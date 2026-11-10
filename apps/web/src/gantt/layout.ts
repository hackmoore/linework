import {
  fromDayNumber,
  toDayNumber,
  type GanttData,
  type GanttScale,
  type GanttSection,
  type GanttTask,
} from "@linework/shared";
import { orderedTasks, startOfWeek, taskColor, todayIso } from "./model";
import { calendarOf, criticalPath, spanOf, type CriticalPath } from "./schedule";

export const ROW_HEIGHT = 36;
export const AXIS_HEIGHT = 52;
/** Width of the task-name column drawn in exported images (the editor uses an HTML table instead). */
export const LABEL_COLUMN_WIDTH = 240;

const DAY_WIDTH: Readonly<Record<GanttScale, number>> = { day: 36, week: 16, month: 5 };
const MIN_SPAN_DAYS: Readonly<Record<GanttScale, number>> = { day: 28, week: 84, month: 270 };

export interface SectionSummary {
  readonly x1: number;
  readonly x2: number;
  /** Percent complete, weighted by working days. */
  readonly progress: number;
  readonly taskCount: number;
  readonly start: string;
  readonly end: string;
}

export type GanttRow =
  | {
      readonly type: "section";
      readonly section: GanttSection;
      readonly y: number;
      readonly summary: SectionSummary | null;
    }
  | {
      readonly type: "task";
      readonly task: GanttTask;
      readonly y: number;
      /** Bar extent in timeline pixels; x2 is the end of the task's last day. */
      readonly x1: number;
      readonly x2: number;
      readonly color: string;
      readonly indent: boolean;
      /** Baseline bar extent, when a baseline exists for this task. */
      readonly baseline: { readonly x1: number; readonly x2: number } | null;
    };

export interface AxisTick {
  readonly x: number;
  readonly width: number;
  readonly label: string;
}

export interface GanttLayout {
  readonly scale: GanttScale;
  readonly dayWidth: number;
  /** First day shown (day number). */
  readonly startDay: number;
  /** Number of days shown. */
  readonly days: number;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly GanttRow[];
  readonly majorTicks: readonly AxisTick[];
  readonly minorTicks: readonly AxisTick[];
  /** Day offsets to shade as non-working (weekends in day scale, plus holidays). */
  readonly weekendDays: readonly number[];
  /** Present when the critical path is switched on. */
  readonly critical: CriticalPath | null;
  /** Pixel position of the middle of today, or null when out of range or hidden. */
  readonly todayX: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(day: number): { year: number; month: number; date: number; weekday: number } {
  const d = new Date(day * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), weekday: d.getUTCDay() };
}

function firstOfMonth(day: number): number {
  const { year, month } = parts(day);
  return Math.round(Date.UTC(year, month, 1) / 86_400_000);
}

function nextMonth(day: number): number {
  const { year, month } = parts(day);
  return Math.round(Date.UTC(year, month + 1, 1) / 86_400_000);
}

/** Groups consecutive days into ticks where `key` stays the same. */
function ticksBy(
  startDay: number,
  days: number,
  dayWidth: number,
  key: (day: number) => string,
  label: (day: number) => string,
): AxisTick[] {
  const ticks: AxisTick[] = [];
  let runStart = startDay;
  for (let day = startDay + 1; day <= startDay + days; day++) {
    if (day === startDay + days || key(day) !== key(runStart)) {
      ticks.push({
        x: (runStart - startDay) * dayWidth,
        width: (day - runStart) * dayWidth,
        label: label(runStart),
      });
      runStart = day;
    }
  }
  return ticks;
}

export function computeGanttLayout(data: GanttData, today: string = todayIso()): GanttLayout {
  const { scale } = data;
  const dayWidth = DAY_WIDTH[scale];
  const todayDay = toDayNumber(today);

  // Visible range: all tasks plus some breathing room, aligned to the scale's unit.
  let min = todayDay;
  let max = todayDay;
  const dated = [...data.tasks, ...(data.baseline?.tasks ?? [])];
  if (dated.length > 0) {
    min = Math.min(...dated.map((t) => toDayNumber(t.start)));
    max = Math.max(...dated.map((t) => toDayNumber(t.end)));
  }
  const startDay =
    scale === "month" ? firstOfMonth(min - 7) : toDayNumber(startOfWeek(fromDayNumber(min - 3)));
  let endDay = Math.max(max + (scale === "day" ? 7 : 21), startDay + MIN_SPAN_DAYS[scale]);
  if (scale === "month") endDay = nextMonth(endDay);
  else endDay = toDayNumber(startOfWeek(fromDayNumber(endDay))) + 7;
  const days = endDay - startDay;

  const cal = calendarOf(data);
  const rows: GanttRow[] = [];
  const sectionIds = new Set(data.sections.map((s) => s.id));
  const baselineById = new Map(data.baseline?.tasks.map((b) => [b.id, b]));
  const xOf = (day: number): number => (day - startDay) * dayWidth;
  let y = 0;
  const pushTask = (task: GanttTask, indent: boolean): void => {
    const base = baselineById.get(task.id);
    rows.push({
      type: "task",
      task,
      y,
      x1: xOf(toDayNumber(task.start)),
      x2: xOf(toDayNumber(task.end) + 1),
      color: taskColor(task, data.sections),
      indent,
      baseline: base ? { x1: xOf(toDayNumber(base.start)), x2: xOf(toDayNumber(base.end) + 1) } : null,
    });
    y += ROW_HEIGHT;
  };
  const ordered = orderedTasks(data);
  for (const task of ordered) {
    if (task.sectionId === null || !sectionIds.has(task.sectionId)) pushTask(task, false);
  }
  for (const section of data.sections) {
    const tasks = ordered.filter((t) => t.sectionId === section.id);
    rows.push({ type: "section", section, y, summary: summarize(tasks) });
    y += ROW_HEIGHT;
    if (!section.collapsed) for (const task of tasks) pushTask(task, true);
  }

  function summarize(tasks: readonly GanttTask[]): SectionSummary | null {
    if (tasks.length === 0) return null;
    const first = Math.min(...tasks.map((t) => toDayNumber(t.start)));
    const last = Math.max(...tasks.map((t) => toDayNumber(t.end)));
    let weight = 0;
    let done = 0;
    for (const t of tasks) {
      if (t.kind === "milestone") continue;
      const days = spanOf(t, cal).duration;
      weight += days;
      done += (days * t.progress) / 100;
    }
    return {
      x1: xOf(first),
      x2: xOf(last + 1),
      progress: weight > 0 ? Math.round((done / weight) * 100) : 0,
      taskCount: tasks.length,
      start: fromDayNumber(first),
      end: fromDayNumber(last),
    };
  }

  const monthKey = (d: number): string => {
    const p = parts(d);
    return `${p.year}-${p.month}`;
  };
  const monthLabel = (d: number): string => {
    const p = parts(d);
    return `${MONTHS[p.month] ?? ""} ${p.year}`;
  };
  let majorTicks: AxisTick[];
  let minorTicks: AxisTick[];
  if (scale === "month") {
    majorTicks = ticksBy(
      startDay,
      days,
      dayWidth,
      (d) => String(parts(d).year),
      (d) => String(parts(d).year),
    );
    minorTicks = ticksBy(startDay, days, dayWidth, monthKey, (d) => MONTHS[parts(d).month] ?? "");
  } else {
    majorTicks = ticksBy(startDay, days, dayWidth, monthKey, monthLabel);
    minorTicks =
      scale === "day"
        ? ticksBy(startDay, days, dayWidth, String, (d) => String(parts(d).date))
        : ticksBy(
            startDay,
            days,
            dayWidth,
            (d) => startOfWeek(fromDayNumber(d)),
            (d) => {
              const p = parts(d);
              return `${String(p.date)} ${MONTHS[p.month] ?? ""}`;
            },
          );
  }

  const weekendDays: number[] = [];
  if (scale !== "month") {
    const holidays = new Set(data.calendar.holidays.map(toDayNumber));
    for (let d = startDay; d < endDay; d++) {
      const { weekday } = parts(d);
      const weekend = weekday === 0 || weekday === 6;
      if ((weekend && (scale === "day" || data.calendar.skipWeekends)) || holidays.has(d))
        weekendDays.push(d - startDay);
    }
  }

  const todayX =
    data.showToday && todayDay >= startDay && todayDay < endDay
      ? (todayDay - startDay + 0.5) * dayWidth
      : null;

  return {
    scale,
    dayWidth,
    startDay,
    days,
    width: days * dayWidth,
    height: Math.max(y, ROW_HEIGHT * 3),
    rows,
    majorTicks,
    minorTicks,
    weekendDays,
    critical: data.showCriticalPath ? criticalPath(data.tasks, cal) : null,
    todayX,
  };
}

/** Day offset (from layout start) under a timeline x position. */
export function dayAtX(layout: GanttLayout, x: number): number {
  return Math.floor(x / layout.dayWidth);
}

export function isoAtOffset(layout: GanttLayout, offset: number): string {
  return fromDayNumber(layout.startDay + offset);
}
