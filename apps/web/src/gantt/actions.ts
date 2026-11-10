import {
  toDayNumber,
  type Diagram,
  type GanttData,
  type GanttDependency,
  type GanttSection,
  type GanttTask,
  type GanttTaskKind,
} from "@linework/shared";
import { useEditor } from "../editor/store";
import { createSection, createTask, orderedTasks, todayIso, withoutTasks, wouldCreateCycle } from "./model";
import { autoSchedule, calendarOf, moveTaskTo, placeAt, spanOf } from "./schedule";

type GanttRecipe = (gantt: GanttData) => GanttData;

/** Wraps a gantt change as a diagram recipe, re-running auto-schedule when it is on. */
export function ganttRecipe(recipe: GanttRecipe): (d: Diagram) => Diagram {
  return (d) => {
    if (!d.gantt) return d;
    const next = recipe(d.gantt);
    if (next === d.gantt) return d;
    return {
      ...d,
      gantt: next.autoSchedule ? { ...next, tasks: autoSchedule(next.tasks, calendarOf(next)) } : next,
    };
  };
}

function commitGantt(recipe: GanttRecipe): void {
  useEditor.getState().commit(ganttRecipe(recipe));
}

function currentGantt(): GanttData | undefined {
  return useEditor.getState().diagram?.gantt;
}

function mapTask(g: GanttData, id: string, fn: (t: GanttTask) => GanttTask): GanttData {
  return { ...g, tasks: g.tasks.map((t) => (t.id === id ? fn(t) : t)) };
}

/**
 * Adds a task or milestone after the selected task (same section), else at the
 * end of the last section. Returns the new task's id.
 */
export function addTask(
  kind: GanttTaskKind,
  options: { readonly sectionId?: string | null; readonly start?: string } = {},
): string | null {
  const gantt = currentGantt();
  if (!gantt) return null;
  const cal = calendarOf(gantt);
  const selectedId = useEditor.getState().selection.taskIds.at(-1);
  const after = gantt.tasks.find((t) => t.id === selectedId);
  const targetSection =
    options.sectionId !== undefined
      ? options.sectionId
      : after
        ? after.sectionId
        : (gantt.sections.at(-1)?.id ?? null);
  const inSection = gantt.tasks.filter((t) => t.sectionId === targetSection);
  const previous = after?.sectionId === targetSection ? after : inSection.at(-1);
  const startIndex = options.start
    ? cal.index(toDayNumber(options.start))
    : previous
      ? cal.index(toDayNumber(previous.end) + 1)
      : cal.index(toDayNumber(todayIso()));
  const draft = createTask(
    kind,
    kind === "milestone" ? "New milestone" : "New task",
    todayIso(),
    1,
    targetSection,
  );
  const task = placeAt(draft, startIndex, kind === "milestone" ? 1 : 5, cal);
  commitGantt((g) => {
    const tasks = [...g.tasks];
    const index = previous ? tasks.findIndex((t) => t.id === previous.id) + 1 : tasks.length;
    tasks.splice(index, 0, task);
    return { ...g, tasks };
  });
  useEditor.getState().select({ taskIds: [task.id] });
  return task.id;
}

export function addSection(): string | null {
  const gantt = currentGantt();
  if (!gantt) return null;
  const section = createSection("New section", gantt.sections.length);
  commitGantt((g) => ({ ...g, sections: [...g.sections, section] }));
  return section.id;
}

export function updateTask(id: string, patch: Partial<Omit<GanttTask, "id">>): void {
  commitGantt((g) =>
    mapTask(g, id, (t) => {
      const next = { ...t, ...patch };
      // Keep the document valid whatever combination of fields was edited.
      if (next.kind === "milestone") next.end = next.start;
      else if (next.end < next.start) next.end = next.start;
      return next;
    }),
  );
}

/** Changes the start date and keeps the task's working-day length. */
export function moveTaskStart(id: string, start: string): void {
  commitGantt((g) => mapTask(g, id, (t) => moveTaskTo(t, toDayNumber(start), calendarOf(g))));
}

/** Sets a task's length in working days, keeping its start. */
export function setTaskDuration(id: string, days: number): void {
  commitGantt((g) => {
    const cal = calendarOf(g);
    return mapTask(g, id, (t) => placeAt(t, spanOf(t, cal).start, Math.max(1, Math.round(days)), cal));
  });
}

export function updateSection(id: string, patch: Partial<Omit<GanttSection, "id">>): void {
  commitGantt((g) => ({ ...g, sections: g.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
}

export function toggleSection(id: string): void {
  commitGantt((g) => ({
    ...g,
    sections: g.sections.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s)),
  }));
}

/** Removes a section and the tasks in it. */
export function deleteSection(id: string): void {
  commitGantt((g) => {
    const removed = new Set(g.tasks.filter((t) => t.sectionId === id).map((t) => t.id));
    return { ...withoutTasks(g, removed), sections: g.sections.filter((s) => s.id !== id) };
  });
}

/** Moves a section one place up or down. */
export function moveSection(id: string, direction: -1 | 1): void {
  commitGantt((g) => {
    const index = g.sections.findIndex((s) => s.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= g.sections.length) return g;
    const sections = [...g.sections];
    const [moved] = sections.splice(index, 1);
    if (moved) sections.splice(target, 0, moved);
    return { ...g, sections };
  });
}

/** Moves a task one row up or down within its section. */
export function moveTaskRow(id: string, direction: -1 | 1): void {
  const gantt = currentGantt();
  const task = gantt?.tasks.find((t) => t.id === id);
  if (!gantt || !task) return;
  const siblings = orderedTasks(gantt).filter((t) => t.sectionId === task.sectionId);
  const index = siblings.findIndex((t) => t.id === id);
  const target = siblings[index + direction];
  if (!target) return;
  // Moving down means landing before the task after the neighbour.
  const before = direction === -1 ? target.id : (siblings[index + 2]?.id ?? null);
  moveTask(id, task.sectionId, before);
}

/**
 * Moves a task into a section (or ungrouped, with null), placed before `beforeTaskId`
 * or at the end of that section when it is null.
 */
export function moveTask(id: string, sectionId: string | null, beforeTaskId: string | null): void {
  if (id === beforeTaskId) return;
  commitGantt((g) => {
    const task = g.tasks.find((t) => t.id === id);
    if (!task) return g;
    const moved = { ...task, sectionId };
    const rest = g.tasks.filter((t) => t.id !== id);
    let index = beforeTaskId ? rest.findIndex((t) => t.id === beforeTaskId) : -1;
    if (index < 0) {
      // After the last task currently in the target section, else at the end.
      const lastInSection = rest.map((t) => t.sectionId).lastIndexOf(sectionId);
      index = lastInSection >= 0 ? lastInSection + 1 : rest.length;
    }
    const tasks = [...rest.slice(0, index), moved, ...rest.slice(index)];
    const unchanged = tasks.every((t, i) => t.id === g.tasks[i]?.id) && task.sectionId === sectionId;
    return unchanged ? g : { ...g, tasks };
  });
}

/**
 * Makes taskId depend on depId. Returns false when it would create a cycle or already exists.
 */
export function addDependency(
  taskId: string,
  depId: string,
  type: GanttDependency["type"] = "FS",
  lag = 0,
): boolean {
  const gantt = currentGantt();
  const task = gantt?.tasks.find((t) => t.id === taskId);
  if (
    !gantt ||
    !task ||
    task.dependencies.some((d) => d.taskId === depId) ||
    wouldCreateCycle(gantt.tasks, taskId, depId)
  ) {
    return false;
  }
  commitGantt((g) =>
    mapTask(g, taskId, (t) => ({ ...t, dependencies: [...t.dependencies, { taskId: depId, type, lag }] })),
  );
  return true;
}

export function updateDependency(
  taskId: string,
  depId: string,
  patch: Partial<Omit<GanttDependency, "taskId">>,
): void {
  commitGantt((g) =>
    mapTask(g, taskId, (t) => ({
      ...t,
      dependencies: t.dependencies.map((d) => (d.taskId === depId ? { ...d, ...patch } : d)),
    })),
  );
}

export function removeDependency(taskId: string, depId: string): void {
  commitGantt((g) =>
    mapTask(g, taskId, (t) => ({ ...t, dependencies: t.dependencies.filter((d) => d.taskId !== depId) })),
  );
}

/** Records every task's current dates as the baseline to compare against. */
export function saveBaseline(): void {
  commitGantt((g) => ({
    ...g,
    baseline: {
      savedAt: new Date().toISOString(),
      tasks: g.tasks.map(({ id, start, end }) => ({ id, start, end })),
    },
  }));
}

export function clearBaseline(): void {
  commitGantt((g) => (g.baseline ? { ...g, baseline: null } : g));
}

export function updateGanttSettings(
  patch: Partial<Pick<GanttData, "scale" | "autoSchedule" | "showToday" | "showCriticalPath" | "calendar">>,
): void {
  commitGantt((g) => ({ ...g, ...patch }));
}
