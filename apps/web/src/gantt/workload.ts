import { toDayNumber, type GanttData } from "@linework/shared";
import { startOfWeek } from "./model";
import { calendarOf } from "./schedule";

export interface WorkloadWeek {
  /** Monday of the week (day number). */
  readonly start: number;
  /** Working days available in the week (5 minus holidays, or 7 when weekends count). */
  readonly capacity: number;
}

export interface WorkloadRow {
  readonly owner: string;
  /** Assigned working days per week, aligned with `weeks`. */
  readonly days: readonly number[];
  readonly total: number;
}

export interface Workload {
  readonly weeks: readonly WorkloadWeek[];
  readonly rows: readonly WorkloadRow[];
}

export const UNASSIGNED = "Unassigned";

/**
 * Working days assigned to each owner in each week. A task contributes one day per
 * working day it covers; milestones count nothing. Overlapping tasks add up, which is
 * how overbooking shows (more days than the week's capacity).
 */
export function computeWorkload(data: GanttData): Workload {
  const tasks = data.tasks.filter((t) => t.kind === "task");
  if (tasks.length === 0) return { weeks: [], rows: [] };
  const cal = calendarOf(data);
  const first = toDayNumber(
    startOfWeek(tasks.reduce((min, t) => (t.start < min ? t.start : min), tasks[0]?.start ?? "")),
  );
  const last = Math.max(...tasks.map((t) => toDayNumber(t.end)));
  const weeks: WorkloadWeek[] = [];
  for (let start = first; start <= last; start += 7) {
    let capacity = 0;
    for (let d = start; d < start + 7; d++) if (cal.isWorkday(d)) capacity++;
    // Without a working calendar, plan around a normal five-day week.
    weeks.push({
      start,
      capacity: data.calendar.skipWeekends || data.calendar.holidays.length > 0 ? capacity : 5,
    });
  }
  const byOwner = new Map<string, number[]>();
  for (const task of tasks) {
    const owner = task.owner.trim() || UNASSIGNED;
    const row = byOwner.get(owner) ?? weeks.map(() => 0);
    for (let d = toDayNumber(task.start); d <= toDayNumber(task.end); d++) {
      if (!cal.isWorkday(d)) continue;
      const w = Math.floor((d - first) / 7);
      if (row[w] !== undefined) row[w] += 1;
    }
    byOwner.set(owner, row);
  }
  const rows = [...byOwner.entries()]
    .map(([owner, days]) => ({ owner, days, total: days.reduce((a, b) => a + b, 0) }))
    .sort((a, b) =>
      a.owner === UNASSIGNED ? 1 : b.owner === UNASSIGNED ? -1 : a.owner.localeCompare(b.owner),
    );
  return { weeks, rows };
}
