import {
  fromDayNumber,
  toDayNumber,
  type GanttData,
  type GanttDependency,
  type GanttSection,
  type GanttTask,
  type GanttTaskKind,
} from "@linework/shared";
import { createId } from "../diagram/factory";

export const SECTION_COLORS = ["#1a56db", "#6d28d9", "#0f766e", "#b45309", "#be185d", "#4b5563"] as const;

export function todayIso(): string {
  const now = new Date();
  return fromDayNumber(Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000));
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Monday on or before the given date. */
export function startOfWeek(iso: string): string {
  const day = toDayNumber(iso);
  // 1970-01-01 was a Thursday, so (day + 3) % 7 is 0 on Mondays.
  return fromDayNumber(day - ((((day + 3) % 7) + 7) % 7));
}

/** Inclusive length in calendar days. */
export function durationDays(task: Pick<GanttTask, "start" | "end">): number {
  return toDayNumber(task.end) - toDayNumber(task.start) + 1;
}

export function createGanttData(sections: GanttSection[] = [], tasks: GanttTask[] = []): GanttData {
  return {
    sections,
    tasks,
    scale: "day",
    autoSchedule: true,
    showToday: true,
    showCriticalPath: false,
    calendar: { skipWeekends: false, holidays: [] },
    baseline: null,
  };
}

export function createSection(name: string, index: number): GanttSection {
  return {
    id: createId(),
    name,
    color: SECTION_COLORS[index % SECTION_COLORS.length] ?? SECTION_COLORS[0],
    collapsed: false,
  };
}

/** A finish-to-start dependency with no lag, the usual kind. */
export function finishToStart(taskId: string): GanttDependency {
  return { taskId, type: "FS", lag: 0 };
}

export function createTask(
  kind: GanttTaskKind,
  name: string,
  start: string,
  days: number,
  sectionId: string | null,
  overrides: Partial<GanttTask> = {},
): GanttTask {
  const length = kind === "milestone" ? 1 : Math.max(1, Math.round(days));
  return {
    id: createId(),
    kind,
    name,
    start,
    end: addDays(start, length - 1),
    progress: 0,
    sectionId,
    color: null,
    owner: "",
    dependencies: [],
    ...overrides,
  };
}

/** Moves a task by whole days, keeping its length. */
export function shiftTask(task: GanttTask, days: number): GanttTask {
  if (days === 0) return task;
  return { ...task, start: addDays(task.start, days), end: addDays(task.end, days) };
}

/** Whether adding "task depends on dep" would create a cycle. */
export function wouldCreateCycle(tasks: readonly GanttTask[], taskId: string, depId: string): boolean {
  if (taskId === depId) return true;
  // A cycle appears if taskId is already a (transitive) predecessor of depId.
  const deps = new Map(tasks.map((t) => [t.id, t.dependencies.map((d) => d.taskId)]));
  const stack = [depId];
  const seen = new Set<string>();
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(deps.get(current) ?? []));
  }
  return false;
}

/** The bar colour for a task: its own colour, else its section's, else a neutral default. */
export function taskColor(task: GanttTask, sections: readonly GanttSection[]): string {
  if (task.color) return task.color;
  return sections.find((s) => s.id === task.sectionId)?.color ?? "#4b5563";
}

/** Tasks in display order: ungrouped first, then each section's tasks in section order. */
export function orderedTasks(data: GanttData): GanttTask[] {
  const sectionIds = new Set(data.sections.map((s) => s.id));
  const ungrouped = data.tasks.filter((t) => t.sectionId === null || !sectionIds.has(t.sectionId));
  return [...ungrouped, ...data.sections.flatMap((s) => data.tasks.filter((t) => t.sectionId === s.id))];
}

/** Removes tasks and every dependency pointing at them. */
export function withoutTasks(g: GanttData, ids: ReadonlySet<string>): GanttData {
  return {
    ...g,
    tasks: g.tasks
      .filter((t) => !ids.has(t.id))
      .map((t) =>
        t.dependencies.some((d) => ids.has(d.taskId))
          ? { ...t, dependencies: t.dependencies.filter((d) => !ids.has(d.taskId)) }
          : t,
      ),
  };
}
