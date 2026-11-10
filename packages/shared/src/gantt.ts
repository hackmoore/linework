import { z } from "zod";

const MS_PER_DAY = 86_400_000;

/** Whole days since 1970-01-01 (UTC) for a YYYY-MM-DD string. Callers must pass a validated date. */
export function toDayNumber(iso: string): number {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2199;

/**
 * A real calendar date in YYYY-MM-DD form within MIN_YEAR..MAX_YEAR. The year bound also
 * rejects the partial values native date inputs emit while a year is being typed (e.g. 0002).
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR && fromDayNumber(toDayNumber(value)) === value;
}

/** Calendar date without time or zone, e.g. "2026-03-14". */
export const isoDateSchema = z.string().refine(isValidIsoDate, "Expected a YYYY-MM-DD date");

export const GANTT_TASK_KINDS = ["task", "milestone"] as const;
export type GanttTaskKind = (typeof GANTT_TASK_KINDS)[number];

export const GANTT_SCALES = ["day", "week", "month"] as const;

/**
 * Dependency types, named after when the predecessor and successor start (S) or finish (F):
 * FS: successor starts after predecessor finishes (the usual case),
 * SS: starts after it starts, FF: finishes after it finishes, SF: finishes after it starts.
 */
export const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];
export type GanttScale = (typeof GANTT_SCALES)[number];

const id = z.string().min(1).max(64);
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected #RRGGBB or #RRGGBBAA");

export const ganttSectionSchema = z.object({
  id,
  name: z.string().max(200),
  color: hexColor,
  /** Hide the section's tasks, leaving only its summary row. */
  collapsed: z.boolean(),
});

export const ganttDependencySchema = z.object({
  /** The predecessor task. */
  taskId: id,
  type: z.enum(DEPENDENCY_TYPES),
  /** Delay in (working) days after the constraint; negative values overlap (lead time). */
  lag: z.number().int().min(-999).max(999),
});
export type GanttDependency = z.infer<typeof ganttDependencySchema>;
export type GanttSection = z.infer<typeof ganttSectionSchema>;

export const ganttTaskSchema = z.object({
  id,
  kind: z.enum(GANTT_TASK_KINDS),
  name: z.string().max(200),
  /** First day of work. */
  start: isoDateSchema,
  /** Last day of work, inclusive. Equal to start for milestones and one-day tasks. */
  end: isoDateSchema,
  /** Percent complete, 0-100. */
  progress: z.number().min(0).max(100),
  /** Section the task belongs to, or null for ungrouped tasks shown above all sections. */
  sectionId: id.nullable(),
  /** Bar colour; null uses the section colour. */
  color: hexColor.nullable(),
  owner: z.string().max(100),
  /** Predecessors this task's dates are constrained by. */
  dependencies: z.array(ganttDependencySchema).max(100),
});
export type GanttTask = z.infer<typeof ganttTaskSchema>;

export const ganttCalendarSchema = z.object({
  /** Count only Monday to Friday in durations, lags and scheduling. */
  skipWeekends: z.boolean(),
  /** Non-working days such as public holidays. */
  holidays: z.array(isoDateSchema).max(500),
});
export type GanttCalendar = z.infer<typeof ganttCalendarSchema>;

export const ganttBaselineSchema = z.object({
  savedAt: z.iso.datetime(),
  tasks: z.array(z.object({ id, start: isoDateSchema, end: isoDateSchema })).max(2_000),
});
export type GanttBaseline = z.infer<typeof ganttBaselineSchema>;

export const ganttDataSchema = z.object({
  sections: z.array(ganttSectionSchema).max(200),
  tasks: z.array(ganttTaskSchema).max(2_000),
  scale: z.enum(GANTT_SCALES),
  /** Push dependent tasks later when a predecessor would overlap them. */
  autoSchedule: z.boolean(),
  showToday: z.boolean(),
  showCriticalPath: z.boolean(),
  calendar: ganttCalendarSchema,
  /** Saved copy of the plan's dates to compare progress against. */
  baseline: ganttBaselineSchema.nullable(),
});
export type GanttData = z.infer<typeof ganttDataSchema>;

/** Returns the id of a task on a dependency cycle, or null when the graph is acyclic. */
export function findDependencyCycle(tasks: readonly Pick<GanttTask, "id" | "dependencies">[]): string | null {
  const deps = new Map(tasks.map((t) => [t.id, t.dependencies.map((d) => d.taskId)]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (taskId: string): string | null => {
    const s = state.get(taskId);
    if (s === "done") return null;
    if (s === "visiting") return taskId;
    state.set(taskId, "visiting");
    for (const dep of deps.get(taskId) ?? []) {
      const hit = visit(dep);
      if (hit) return hit;
    }
    state.set(taskId, "done");
    return null;
  };
  for (const t of tasks) {
    const hit = visit(t.id);
    if (hit) return hit;
  }
  return null;
}

/** Cross-field checks shared by the diagram schema. Returns issues as [path, message] pairs. */
export function validateGantt(data: GanttData): [readonly (string | number)[], string][] {
  const issues: [readonly (string | number)[], string][] = [];
  const taskIds = new Set(data.tasks.map((t) => t.id));
  const sectionIds = new Set(data.sections.map((s) => s.id));
  data.tasks.forEach((task, i) => {
    if (task.end < task.start) issues.push([["tasks", i, "end"], "Task ends before it starts"]);
    if (task.kind === "milestone" && task.end !== task.start) {
      issues.push([["tasks", i, "end"], "Milestones must start and end on the same day"]);
    }
    if (task.sectionId !== null && !sectionIds.has(task.sectionId)) {
      issues.push([["tasks", i, "sectionId"], "Task references a missing section"]);
    }
    const seen = new Set<string>();
    task.dependencies.forEach((dep, j) => {
      const path = ["tasks", i, "dependencies", j];
      if (dep.taskId === task.id) issues.push([path, "Task depends on itself"]);
      else if (!taskIds.has(dep.taskId)) issues.push([path, "Dependency references a missing task"]);
      else if (seen.has(dep.taskId)) issues.push([path, "Duplicate dependency"]);
      seen.add(dep.taskId);
    });
  });
  if (issues.length === 0 && findDependencyCycle(data.tasks)) {
    issues.push([["tasks"], "Task dependencies form a cycle"]);
  }
  return issues;
}
