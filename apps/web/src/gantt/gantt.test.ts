import { beforeEach, describe, expect, it } from "vitest";
import { fromDayNumber, parseDiagram, toDayNumber, type GanttData, type GanttTask } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "../editor/store";
import {
  addDependency,
  addSection,
  addTask,
  deleteSection,
  ganttRecipe,
  moveTask,
  saveBaseline,
  setTaskDuration,
  toggleSection,
  updateDependency,
  updateGanttSettings,
  updateTask,
} from "./actions";
import { makeCalendar } from "./calendar";
import { csvToGantt, ganttToCsv, ganttToMsProjectXml, msProjectXmlToGantt, parseCsv } from "./io";
import { computeGanttLayout, ROW_HEIGHT } from "./layout";
import {
  createGanttData,
  createSection,
  createTask,
  durationDays,
  finishToStart,
  startOfWeek,
  wouldCreateCycle,
} from "./model";
import { autoSchedule, criticalPath, moveTaskTo, workDuration } from "./schedule";
import { computeWorkload } from "./workload";

const ALL = makeCalendar({ skipWeekends: false, holidays: [] });
const WEEKDAYS = makeCalendar({ skipWeekends: true, holidays: [] });

describe("calendar", () => {
  it("counts every day without a working calendar", () => {
    expect(ALL.count(toDayNumber("2026-03-02"), toDayNumber("2026-03-08"))).toBe(7);
  });

  it("skips weekends and holidays", () => {
    // Mon 2 Mar to Sun 8 Mar 2026: 5 working days.
    expect(WEEKDAYS.count(toDayNumber("2026-03-02"), toDayNumber("2026-03-08"))).toBe(5);
    const withHoliday = makeCalendar({ skipWeekends: true, holidays: ["2026-03-04", "2026-03-07"] });
    // Saturday holidays don't count twice.
    expect(withHoliday.count(toDayNumber("2026-03-02"), toDayNumber("2026-03-08"))).toBe(4);
    expect(withHoliday.isWorkday(toDayNumber("2026-03-04"))).toBe(false);
  });

  it("maps working-day indexes back to dates", () => {
    const friday = toDayNumber("2026-03-06");
    expect(fromDayNumber(WEEKDAYS.dayAt(WEEKDAYS.index(friday) + 1))).toBe("2026-03-09");
    expect(fromDayNumber(WEEKDAYS.nextWorkday(toDayNumber("2026-03-07")))).toBe("2026-03-09");
    for (const iso of ["1900-01-01", "2026-11-10", "2199-12-31"]) {
      const day = toDayNumber(iso);
      expect(ALL.dayAt(ALL.index(day))).toBe(day);
    }
  });
});

describe("model", () => {
  it("finds the Monday of a week", () => {
    expect(startOfWeek("2026-11-10")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
  });

  it("creates tasks with inclusive end dates", () => {
    const task = createTask("task", "A", "2026-03-02", 5, null);
    expect(task.end).toBe("2026-03-06");
    expect(durationDays(task)).toBe(5);
    expect(createTask("milestone", "M", "2026-03-02", 5, null).end).toBe("2026-03-02");
  });

  it("detects would-be cycles", () => {
    const a = createTask("task", "A", "2026-03-02", 1, null);
    const b = createTask("task", "B", "2026-03-03", 1, null, { dependencies: [finishToStart(a.id)] });
    expect(wouldCreateCycle([a, b], a.id, b.id)).toBe(true);
    expect(wouldCreateCycle([a, b], b.id, a.id)).toBe(false);
    expect(wouldCreateCycle([a, b], a.id, a.id)).toBe(true);
  });
});

describe("scheduling", () => {
  const a = createTask("task", "A", "2026-03-02", 5, null); // Mon 2 - Fri 6

  it.each([
    ["FS", 0, "2026-03-07", "2026-03-08"],
    ["FS", 2, "2026-03-09", "2026-03-10"],
    ["FS", -2, "2026-03-05", "2026-03-06"],
    ["SS", 1, "2026-03-03", "2026-03-04"],
    ["FF", 0, "2026-03-05", "2026-03-06"],
    ["SF", 0, "2026-02-28", "2026-03-01"],
  ] as const)("%s with lag %d starts the successor on %s", (type, lag, start, end) => {
    const b = createTask("task", "B", "2026-01-01", 2, null, { dependencies: [{ taskId: a.id, type, lag }] });
    const [, scheduled] = autoSchedule([a, b], ALL);
    expect(scheduled?.start).toBe(start);
    expect(scheduled?.end).toBe(end);
  });

  it("never pulls tasks earlier", () => {
    const b = createTask("task", "B", "2026-04-01", 2, null, { dependencies: [finishToStart(a.id)] });
    expect(autoSchedule([a, b], ALL)[1]?.start).toBe("2026-04-01");
  });

  it("schedules chains in any order and respects weekends", () => {
    // Created on a Monday so their lengths are 3 and 1 working days.
    const b = createTask("task", "B", "2026-01-05", 3, null, { dependencies: [finishToStart(a.id)] });
    const c = createTask("task", "C", "2026-01-05", 1, null, { dependencies: [finishToStart(b.id)] });
    const scheduled = autoSchedule([c, b, a], WEEKDAYS);
    // B: Mon 9 - Wed 11, C: Thu 12.
    expect(scheduled.map((t) => t.start)).toEqual(["2026-03-12", "2026-03-09", "2026-03-02"]);
    expect(scheduled[1]?.end).toBe("2026-03-11");
  });

  it("keeps working length when moving across a weekend", () => {
    const moved = moveTaskTo(a, toDayNumber("2026-03-05"), WEEKDAYS);
    expect(moved.start).toBe("2026-03-05");
    expect(moved.end).toBe("2026-03-11");
    expect(workDuration(moved, WEEKDAYS)).toBe(5);
    // Starting on a Saturday snaps to Monday.
    expect(moveTaskTo(a, toDayNumber("2026-03-07"), WEEKDAYS).start).toBe("2026-03-09");
  });
});

describe("critical path", () => {
  it("marks the longest chain critical and gives other tasks slack", () => {
    const a = createTask("task", "A", "2026-03-02", 3, null);
    const long = createTask("task", "Long", "2026-03-05", 5, null, { dependencies: [finishToStart(a.id)] });
    const short = createTask("task", "Short", "2026-03-05", 2, null, { dependencies: [finishToStart(a.id)] });
    const end = createTask("milestone", "End", "2026-03-10", 1, null, {
      dependencies: [finishToStart(long.id), finishToStart(short.id)],
    });
    const cp = criticalPath([a, long, short, end], ALL);
    expect(cp.timings.get(a.id)?.critical).toBe(true);
    expect(cp.timings.get(long.id)?.critical).toBe(true);
    expect(cp.timings.get(short.id)).toEqual({ slack: 3, critical: false });
    expect(cp.timings.get(end.id)?.critical).toBe(true);
    expect(cp.criticalLinks.has(`${a.id}>${long.id}`)).toBe(true);
    expect(cp.criticalLinks.has(`${short.id}>${end.id}`)).toBe(false);
    expect(cp.finishDay).toBe(toDayNumber("2026-03-10"));
  });

  it("handles an empty plan", () => {
    expect(criticalPath([], ALL).finishDay).toBeNull();
  });
});

describe("layout", () => {
  it("orders ungrouped tasks first, then sections, and hides collapsed tasks", () => {
    const s1 = createSection("One", 0);
    const s2 = { ...createSection("Two", 1), collapsed: true };
    const t1 = createTask("task", "In two", "2026-03-02", 2, s2.id, { progress: 50 });
    const t2 = createTask("task", "Loose", "2026-03-02", 2, null);
    const t3 = createTask("task", "In one", "2026-03-02", 2, s1.id);
    const layout = computeGanttLayout(createGanttData([s1, s2], [t1, t2, t3]), "2026-03-01");
    expect(layout.rows.map((r) => (r.type === "section" ? `#${r.section.name}` : r.task.name))).toEqual([
      "Loose",
      "#One",
      "In one",
      "#Two",
    ]);
    expect(layout.rows.map((r) => r.y)).toEqual([0, 1, 2, 3].map((i) => i * ROW_HEIGHT));
    const two = layout.rows[3];
    expect(two?.type === "section" && two.summary?.progress).toBe(50);
  });

  it("positions bars and baselines by date", () => {
    const task = createTask("task", "A", "2026-03-04", 3, null);
    const data: GanttData = {
      ...createGanttData([], [task]),
      baseline: {
        savedAt: "2026-03-01T00:00:00.000Z",
        tasks: [{ id: task.id, start: "2026-03-02", end: "2026-03-03" }],
      },
    };
    const layout = computeGanttLayout(data, "2026-03-01");
    const row = layout.rows[0];
    if (row?.type !== "task") throw new Error("expected a task row");
    expect(row.x2 - row.x1).toBe(3 * layout.dayWidth);
    expect(row.x1).toBe((toDayNumber("2026-03-04") - layout.startDay) * layout.dayWidth);
    expect(row.baseline && row.baseline.x2 - row.baseline.x1).toBe(2 * layout.dayWidth);
  });

  it("shades weekends in day scale and holidays", () => {
    const data = {
      ...createGanttData([], [createTask("task", "A", "2026-03-04", 3, null)]),
      calendar: { skipWeekends: false, holidays: ["2026-03-04"] },
    };
    const layout = computeGanttLayout(data, "2026-03-01");
    expect(new Date(layout.startDay * 86_400_000).getUTCDay()).toBe(1);
    expect(layout.weekendDays).toContain(toDayNumber("2026-03-04") - layout.startDay);
    expect(layout.weekendDays).toContain(5);
  });

  it("hides the today line when turned off or out of range", () => {
    const data = createGanttData([], [createTask("task", "A", "2026-03-04", 3, null)]);
    expect(computeGanttLayout(data, "2026-03-05").todayX).not.toBeNull();
    expect(computeGanttLayout({ ...data, showToday: false }, "2026-03-05").todayX).toBeNull();
    expect(computeGanttLayout(data, "2030-01-01").todayX).toBeNull();
  });

  it.each(["day", "week", "month"] as const)("builds axis ticks spanning the range at %s scale", (scale) => {
    const layout = computeGanttLayout(
      { ...createGanttData([], [createTask("task", "A", "2026-03-04", 30, null)]), scale },
      "2026-03-01",
    );
    expect(layout.minorTicks.reduce((sum, t) => sum + t.width, 0)).toBeCloseTo(layout.width);
    expect(layout.majorTicks.length).toBeGreaterThan(0);
  });
});

describe("workload", () => {
  it("adds up task-days per owner per week and spots overbooking", () => {
    const a = createTask("task", "A", "2026-03-02", 5, null, { owner: "Sam" });
    const b = createTask("task", "B", "2026-03-04", 3, null, { owner: "Sam" });
    const c = createTask("task", "C", "2026-03-09", 2, null, { owner: "" });
    const w = computeWorkload(createGanttData([], [a, b, c]));
    expect(w.weeks.map((x) => fromDayNumber(x.start))).toEqual(["2026-03-02", "2026-03-09"]);
    const sam = w.rows.find((r) => r.owner === "Sam");
    expect(sam?.days).toEqual([8, 0]);
    expect(w.rows.at(-1)?.owner).toBe("Unassigned");
  });
});

describe("import and export", () => {
  function samplePlan(): GanttData {
    const s = createSection("Build, test", 0);
    const a = createTask("task", 'Design "v2"', "2026-03-02", 3, s.id, { owner: "Lee", progress: 40 });
    const b = createTask("task", "Build", "2026-03-05", 4, s.id, {
      dependencies: [{ taskId: a.id, type: "SS", lag: 2 }],
    });
    const m = createTask("milestone", "Ship", "2026-03-09", 1, null, { dependencies: [finishToStart(b.id)] });
    return createGanttData([s], [m, a, b]);
  }

  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([
      ["a", "b,c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("round-trips through CSV", () => {
    const plan = samplePlan();
    const result = csvToGantt(ganttToCsv(plan));
    if (!result.ok) throw new Error(result.error);
    const names = result.data.tasks.map((t) => t.name);
    expect(names).toEqual(["Ship", 'Design "v2"', "Build"]);
    expect(result.data.sections.map((s) => s.name)).toEqual(["Build, test"]);
    const build = result.data.tasks.find((t) => t.name === "Build");
    const design = result.data.tasks.find((t) => t.name.startsWith("Design"));
    expect(build?.dependencies).toEqual([{ taskId: design?.id, type: "SS", lag: 2 }]);
    expect(design?.owner).toBe("Lee");
    expect(result.data.tasks[0]?.kind).toBe("milestone");
  });

  it("imports spreadsheet-style CSV with durations and D/M/Y dates", () => {
    const result = csvToGantt(
      "Task,Start,Duration,Assignee,Predecessors\nPlan,2/3/2026,2,Ana,\nDo,04/03/2026,3,,1\n",
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.data.tasks.map((t) => [t.start, t.end])).toEqual([
      ["2026-03-02", "2026-03-03"],
      ["2026-03-04", "2026-03-06"],
    ]);
    expect(result.data.tasks[1]?.dependencies[0]?.taskId).toBe(result.data.tasks[0]?.id);
  });

  it("rejects CSV without required columns or with bad dates", () => {
    expect(csvToGantt("Foo,Bar\n1,2").ok).toBe(false);
    expect(csvToGantt("Name,Start\nA,not a date").ok).toBe(false);
  });

  it("round-trips through MS Project XML", () => {
    const plan = samplePlan();
    const result = msProjectXmlToGantt(ganttToMsProjectXml(plan, "Launch & more"));
    if (!result.ok) throw new Error(result.error);
    expect(result.title).toBe("Launch & more");
    expect(result.data.sections.map((s) => s.name)).toEqual(["Build, test"]);
    const byName = new Map(result.data.tasks.map((t) => [t.name, t]));
    expect(byName.get("Ship")?.sectionId).toBeNull();
    expect(byName.get("Build")?.dependencies).toEqual([
      { taskId: byName.get('Design "v2"')?.id, type: "SS", lag: 2 },
    ]);
    expect(byName.get('Design "v2"')?.progress).toBe(40);
  });

  it("drops dependency cycles from imported files", () => {
    const result = csvToGantt(
      "ID,Name,Start,End,Depends on\n1,A,2026-03-02,2026-03-02,2\n2,B,2026-03-03,2026-03-03,1\n",
    );
    if (!result.ok) throw new Error(result.error);
    const total = result.data.tasks.reduce((n, t) => n + t.dependencies.length, 0);
    expect(total).toBe(1);
  });
});

describe("gantt actions", () => {
  const gantt = (): GanttData => {
    const g = useEditor.getState().diagram?.gantt;
    if (!g) throw new Error("No gantt loaded");
    return g;
  };
  const task = (id: string): GanttTask | undefined => gantt().tasks.find((t) => t.id === id);
  const valid = (): boolean => {
    const d = useEditor.getState().diagram;
    return d !== null && parseDiagram(d).ok;
  };

  beforeEach(() => {
    useEditor.getState().load({
      ...createDiagram("Plan", "professional", "gantt"),
      gantt: createGanttData([createSection("Phase 1", 0)]),
    });
  });

  it("adds tasks after the selected one, in its section", () => {
    const a = addTask("task", { start: "2026-03-02" });
    const b = addTask("task");
    expect(gantt().tasks.map((t) => t.id)).toEqual([a, b]);
    expect(task(b ?? "")?.start).toBe("2026-03-07");
    expect(task(b ?? "")?.sectionId).toBe(gantt().sections[0]?.id);
    expect(useEditor.getState().selection.taskIds).toEqual([b]);
  });

  it("auto-schedules on dependency changes and predecessor growth", () => {
    const a = addTask("task", { start: "2026-03-02" }) ?? "";
    const b = addTask("task", { start: "2026-03-02" }) ?? "";
    expect(addDependency(b, a)).toBe(true);
    expect(task(b)?.start).toBe("2026-03-07");
    updateTask(a, { end: "2026-03-10" });
    expect(task(b)?.start).toBe("2026-03-11");
    updateDependency(b, a, { lag: 3 });
    expect(task(b)?.start).toBe("2026-03-14");
    expect(addDependency(a, b)).toBe(false);
    expect(valid()).toBe(true);
  });

  it("uses working days once weekends are skipped", () => {
    const a = addTask("task", { start: "2026-03-02" }) ?? "";
    updateGanttSettings({ calendar: { skipWeekends: true, holidays: [] } });
    setTaskDuration(a, 7);
    expect(task(a)?.end).toBe("2026-03-10");
  });

  it("moves tasks between sections and reorders them", () => {
    const a = addTask("task") ?? "";
    const b = addTask("task") ?? "";
    const other = addSection() ?? "";
    moveTask(b, gantt().sections[0]?.id ?? null, a);
    expect(gantt().tasks.map((t) => t.id)).toEqual([b, a]);
    moveTask(a, other, null);
    expect(task(a)?.sectionId).toBe(other);
    expect(valid()).toBe(true);
  });

  it("keeps the document valid when deleting tasks and sections", () => {
    const a = addTask("task") ?? "";
    const b = addTask("milestone") ?? "";
    addDependency(b, a);
    useEditor.getState().select({ taskIds: [a] });
    useEditor.getState().deleteSelection();
    expect(task(b)?.dependencies).toEqual([]);
    const section = addSection() ?? "";
    addTask("task", { sectionId: section });
    deleteSection(section);
    expect(gantt().tasks.every((t) => t.sectionId !== section)).toBe(true);
    expect(valid()).toBe(true);
  });

  it("saves baselines and collapses sections", () => {
    addTask("task", { start: "2026-03-02" });
    saveBaseline();
    expect(gantt().baseline?.tasks).toHaveLength(1);
    const id = gantt().sections[0]?.id ?? "";
    toggleSection(id);
    expect(gantt().sections[0]?.collapsed).toBe(true);
    expect(valid()).toBe(true);
  });

  it("undoes a drag as one step", () => {
    const a = addTask("task", { start: "2026-03-02" }) ?? "";
    const origin = gantt();
    useEditor.getState().checkpoint();
    for (const day of [3, 4, 5]) {
      useEditor.getState().transient(
        ganttRecipe(() => ({
          ...origin,
          tasks: origin.tasks.map((t) =>
            t.id === a ? moveTaskTo(t, toDayNumber(`2026-03-0${String(day)}`), ALL) : t,
          ),
        })),
      );
    }
    expect(task(a)?.start).toBe("2026-03-05");
    useEditor.getState().undo();
    expect(task(a)?.start).toBe("2026-03-02");
  });
});
