import {
  fromDayNumber,
  toDayNumber,
  type DependencyType,
  type GanttData,
  type GanttTask,
} from "@linework/shared";
import { makeCalendar, type WorkCalendar } from "./calendar";

/** A task's position in working-day index space: it runs from point `start` to point `start + duration`. */
interface Span {
  readonly start: number;
  readonly duration: number;
}

export function spanOf(task: GanttTask, cal: WorkCalendar): Span {
  const startDay = toDayNumber(task.start);
  return { start: cal.index(startDay), duration: Math.max(1, cal.count(startDay, toDayNumber(task.end))) };
}

/** Working days a task covers (at least 1). */
export function workDuration(task: GanttTask, cal: WorkCalendar): number {
  return spanOf(task, cal).duration;
}

/** Dates for a task that starts at working-day index `start` and lasts `duration` working days. */
export function placeAt(task: GanttTask, start: number, duration: number, cal: WorkCalendar): GanttTask {
  const startIso = fromDayNumber(cal.dayAt(start));
  const endIso = task.kind === "milestone" ? startIso : fromDayNumber(cal.dayAt(start + duration - 1));
  return startIso === task.start && endIso === task.end ? task : { ...task, start: startIso, end: endIso };
}

/** Moves a task so it starts on (or after, if that is not a working day) `startDay`, keeping its working length. */
export function moveTaskTo(task: GanttTask, startDay: number, cal: WorkCalendar): GanttTask {
  return placeAt(task, cal.index(startDay), workDuration(task, cal), cal);
}

/** Earliest start index allowed by one dependency. */
function earliestStart(type: DependencyType, lag: number, pred: Span, duration: number): number {
  const predFinish = pred.start + pred.duration;
  switch (type) {
    case "FS":
      return predFinish + lag;
    case "SS":
      return pred.start + lag;
    case "FF":
      return predFinish + lag - duration;
    case "SF":
      return pred.start + lag - duration;
  }
}

/** Tasks ordered so every task comes after its predecessors. Assumes no cycles. */
function topologicalOrder(tasks: readonly GanttTask[]): GanttTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const done = new Set<string>();
  const out: GanttTask[] = [];
  const visit = (task: GanttTask, depth: number): void => {
    if (done.has(task.id) || depth > tasks.length) return;
    done.add(task.id);
    for (const dep of task.dependencies) {
      const pred = byId.get(dep.taskId);
      if (pred) visit(pred, depth + 1);
    }
    out.push(task);
  };
  for (const t of tasks) visit(t, 0);
  return out;
}

/**
 * Pushes tasks later until every dependency is satisfied. Never pulls a task earlier.
 * Returns tasks in their original order.
 */
export function autoSchedule(tasks: readonly GanttTask[], cal: WorkCalendar): GanttTask[] {
  const spans = new Map<string, Span>();
  const scheduled = new Map<string, GanttTask>();
  for (const task of topologicalOrder(tasks)) {
    let span = spanOf(task, cal);
    let earliest = -Infinity;
    for (const dep of task.dependencies) {
      const pred = spans.get(dep.taskId);
      if (pred) earliest = Math.max(earliest, earliestStart(dep.type, dep.lag, pred, span.duration));
    }
    let next = task;
    if (span.start < earliest) {
      span = { ...span, start: earliest };
      next = placeAt(task, span.start, span.duration, cal);
    }
    spans.set(task.id, span);
    scheduled.set(task.id, next);
  }
  return tasks.map((t) => scheduled.get(t.id) ?? t);
}

export interface TaskTiming {
  /** Working days the task can slip without moving the project's end. */
  readonly slack: number;
  readonly critical: boolean;
}

export interface CriticalPath {
  readonly timings: ReadonlyMap<string, TaskTiming>;
  /** Dependencies on the critical path, as "predecessorId>successorId". */
  readonly criticalLinks: ReadonlySet<string>;
  /** Day number of the project's last working day, or null with no tasks. */
  readonly finishDay: number | null;
}

/**
 * Critical path method on the plan's current dates: a backward pass from the latest
 * finish gives each task's latest allowed finish; slack is the gap to its actual finish.
 */
export function criticalPath(tasks: readonly GanttTask[], cal: WorkCalendar): CriticalPath {
  if (tasks.length === 0) return { timings: new Map(), criticalLinks: new Set(), finishDay: null };
  const spans = new Map(tasks.map((t) => [t.id, spanOf(t, cal)]));
  const finish = (s: Span): number => s.start + s.duration;
  const projectFinish = Math.max(...[...spans.values()].map(finish));

  const successors = new Map<string, { task: GanttTask; type: DependencyType; lag: number }[]>();
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      const list = successors.get(dep.taskId) ?? [];
      list.push({ task, type: dep.type, lag: dep.lag });
      successors.set(dep.taskId, list);
    }
  }

  const latestFinish = new Map<string, number>();
  for (const task of topologicalOrder(tasks).reverse()) {
    const span = spans.get(task.id);
    if (!span) continue;
    let lf = projectFinish;
    for (const { task: succ, type, lag } of successors.get(task.id) ?? []) {
      const succSpan = spans.get(succ.id);
      const succLf = latestFinish.get(succ.id);
      if (!succSpan || succLf === undefined) continue;
      const succLs = succLf - succSpan.duration;
      const bound =
        type === "FS"
          ? succLs - lag
          : type === "SS"
            ? succLs - lag + span.duration
            : type === "FF"
              ? succLf - lag
              : succLf - lag + span.duration;
      lf = Math.min(lf, bound);
    }
    latestFinish.set(task.id, lf);
  }

  const timings = new Map<string, TaskTiming>();
  for (const task of tasks) {
    const span = spans.get(task.id);
    const lf = latestFinish.get(task.id);
    if (!span || lf === undefined) continue;
    const slack = lf - finish(span);
    timings.set(task.id, { slack, critical: slack <= 0 });
  }

  const criticalLinks = new Set<string>();
  for (const task of tasks) {
    const span = spans.get(task.id);
    if (!span || !timings.get(task.id)?.critical) continue;
    for (const dep of task.dependencies) {
      const pred = spans.get(dep.taskId);
      // A link is critical when both ends are critical and the constraint is tight.
      if (
        pred &&
        timings.get(dep.taskId)?.critical &&
        earliestStart(dep.type, dep.lag, pred, span.duration) >= span.start
      ) {
        criticalLinks.add(`${dep.taskId}>${task.id}`);
      }
    }
  }

  return { timings, criticalLinks, finishDay: cal.dayAt(projectFinish - 1) };
}

/** Calendar for a plan. */
export function calendarOf(data: Pick<GanttData, "calendar">): WorkCalendar {
  return makeCalendar(data.calendar);
}
