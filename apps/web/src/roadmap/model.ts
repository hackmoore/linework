import type { RoadmapData, RoadmapItem, RoadmapLane, RoadmapScale, RoadmapStatus } from "@linework/shared";
import { createId } from "../diagram/factory";
import { addDays, todayIso } from "../gantt/model";

export const LANE_COLORS = ["#1a56db", "#0f766e", "#6d28d9", "#b45309", "#be185d", "#4b5563"] as const;

export const STATUS_LABELS: Readonly<Record<RoadmapStatus, string>> = {
  planned: "Planned",
  "in-progress": "In progress",
  done: "Done",
  "at-risk": "At risk",
};

export const SCALE_LABELS: Readonly<Record<RoadmapScale, string>> = {
  week: "Weeks",
  month: "Months",
  quarter: "Quarters",
};

/** Length of a new item, in days: about one column at each zoom. */
export const DEFAULT_DAYS: Readonly<Record<RoadmapScale, number>> = { week: 14, month: 30, quarter: 90 };

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function createRoadmapLane(name: string, index: number): RoadmapLane {
  return {
    id: createId(),
    name,
    color: LANE_COLORS[index % LANE_COLORS.length] ?? LANE_COLORS[0],
    collapsed: false,
  };
}

export function createRoadmapItem(
  title: string,
  laneId: string,
  start: string,
  days: number,
  overrides: Partial<RoadmapItem> = {},
): RoadmapItem {
  const kind = overrides.kind ?? "item";
  return {
    id: createId(),
    laneId,
    kind,
    title,
    description: "",
    start,
    end: kind === "milestone" ? start : addDays(start, Math.max(1, days) - 1),
    status: "planned",
    owner: "",
    color: null,
    ...overrides,
  };
}

/** A new roadmap with two lanes, zoomed to months. */
export function createRoadmapData(): RoadmapData {
  return {
    scale: "month",
    fiscalYearStart: 1,
    showToday: true,
    lanes: [createRoadmapLane("Product", 0), createRoadmapLane("Engineering", 1)],
    items: [],
  };
}

export function itemColor(item: RoadmapItem, lanes: readonly RoadmapLane[]): string {
  return item.color ?? lanes.find((l) => l.id === item.laneId)?.color ?? LANE_COLORS[0];
}

/** First day of the month containing `iso`. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** A sensible start for a new item: the start of this month. */
export function defaultStart(): string {
  return monthStart(todayIso());
}

/** "Q3 2026", or "Q1 FY27" when the financial year doesn't start in January. */
export function quarterLabel(year: number, month: number, fiscalYearStart: number): string {
  // month is 0-11; shift so the financial year's first month is month 0.
  const shifted = (month - (fiscalYearStart - 1) + 12) % 12;
  const quarter = Math.floor(shifted / 3) + 1;
  if (fiscalYearStart === 1) return `Q${String(quarter)} ${String(year)}`;
  // The financial year is named after the calendar year it ends in.
  const endsIn = month >= fiscalYearStart - 1 ? year + 1 : year;
  return `Q${String(quarter)} FY${String(endsIn % 100).padStart(2, "0")}`;
}

export function withoutItems(data: RoadmapData, ids: ReadonlySet<string>): RoadmapData {
  return ids.size === 0 ? data : { ...data, items: data.items.filter((i) => !ids.has(i.id)) };
}
