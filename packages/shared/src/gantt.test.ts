import { describe, expect, it } from "vitest";
import { DIAGRAM_FORMAT_VERSION, parseDiagram } from "./diagram.js";
import {
  findDependencyCycle,
  fromDayNumber,
  isValidIsoDate,
  toDayNumber,
  type GanttData,
  type GanttTask,
} from "./gantt.js";

function task(overrides: Partial<GanttTask> & Pick<GanttTask, "id">): GanttTask {
  return {
    kind: "task",
    name: overrides.id,
    start: "2026-03-02",
    end: "2026-03-06",
    progress: 0,
    sectionId: "s1",
    color: null,
    owner: "",
    dependencies: [],
    ...overrides,
  };
}

const fs = (taskId: string): GanttTask["dependencies"][number] => ({ taskId, type: "FS", lag: 0 });

function ganttDiagram(gantt: Partial<GanttData>): unknown {
  return {
    version: DIAGRAM_FORMAT_VERSION,
    id: "g1",
    chartType: "gantt",
    title: "Plan",
    styleId: "professional",
    background: "#ffffff",
    nodes: [],
    edges: [],
    layers: [{ id: "l1", name: "Layer 1", visible: true, locked: false }],
    comments: [],
    gantt: {
      sections: [{ id: "s1", name: "Build", color: "#1a56db", collapsed: false }],
      tasks: [],
      scale: "day",
      autoSchedule: true,
      showToday: true,
      showCriticalPath: false,
      calendar: { skipWeekends: false, holidays: [] },
      baseline: null,
      ...gantt,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("day numbers", () => {
  it("round-trips dates across month and leap boundaries", () => {
    for (const iso of ["1970-01-01", "2024-02-29", "2026-12-31"]) {
      expect(fromDayNumber(toDayNumber(iso))).toBe(iso);
    }
    expect(toDayNumber("2026-03-01") - toDayNumber("2026-02-28")).toBe(1);
  });

  it("rejects impossible dates", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-3-1")).toBe(false);
    expect(isValidIsoDate("2026-03-01")).toBe(true);
    expect(isValidIsoDate("0002-03-01")).toBe(false);
    expect(isValidIsoDate("2300-01-01")).toBe(false);
  });
});

describe("gantt validation", () => {
  it("accepts a valid plan", () => {
    const result = parseDiagram(
      ganttDiagram({
        tasks: [
          task({ id: "a" }),
          task({
            id: "b",
            start: "2026-03-09",
            end: "2026-03-09",
            kind: "milestone",
            dependencies: [fs("a")],
          }),
        ],
      }),
    );
    expect(result.ok ? true : result.error).toBe(true);
  });

  it("requires gantt data for gantt charts", () => {
    const doc = ganttDiagram({}) as Record<string, unknown>;
    delete doc.gantt;
    expect(parseDiagram(doc).ok).toBe(false);
  });

  it.each([
    ["end before start", [task({ id: "a", start: "2026-03-05", end: "2026-03-01" })]],
    ["multi-day milestone", [task({ id: "a", kind: "milestone" })]],
    ["missing section", [task({ id: "a", sectionId: "nope" })]],
    ["missing dependency", [task({ id: "a", dependencies: [fs("ghost")] })]],
    ["self dependency", [task({ id: "a", dependencies: [fs("a")] })]],
    ["cycle", [task({ id: "a", dependencies: [fs("b")] }), task({ id: "b", dependencies: [fs("a")] })]],
    [
      "duplicate dependency",
      [task({ id: "a" }), task({ id: "b", dependencies: [fs("a"), { taskId: "a", type: "SS", lag: 0 }] })],
    ],
  ])("rejects %s", (_name, tasks) => {
    expect(parseDiagram(ganttDiagram({ tasks })).ok).toBe(false);
  });
});

describe("findDependencyCycle", () => {
  it("finds indirect cycles only", () => {
    expect(
      findDependencyCycle([
        { id: "a", dependencies: [] },
        { id: "b", dependencies: [fs("a")] },
      ]),
    ).toBeNull();
    expect(
      findDependencyCycle([
        { id: "a", dependencies: [fs("c")] },
        { id: "b", dependencies: [fs("a")] },
        { id: "c", dependencies: [fs("b")] },
      ]),
    ).not.toBeNull();
  });
});
