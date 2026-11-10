import {
  fromDayNumber,
  toDayNumber,
  type RoadmapData,
  type RoadmapItem,
  type RoadmapLane,
} from "@linework/shared";
import { startOfWeek, todayIso } from "../gantt/model";
import { itemColor, quarterLabel } from "./model";

/** Static roadmap layout, shared by the editor, export, thumbnails and presenting. */

export const AXIS_HEIGHT = 56;
/** Width of the lane-name column in exported images (the editor draws its own). */
export const LANE_COLUMN_WIDTH = 200;
export const ROW_HEIGHT = 40;
export const BAR_HEIGHT = 28;
const LANE_PAD = 10;
const COLLAPSED_HEIGHT = 36;
const MIN_LANE_HEIGHT = ROW_HEIGHT + LANE_PAD * 2;
const MILESTONE_SIZE = 10;

const DAY_WIDTH = { week: 10, month: 3.6, quarter: 2.2 } as const;
/** Fewest columns shown, so a short roadmap still reads as a timeline. */
const MIN_PERIODS = { week: 10, month: 8, quarter: 6 } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Rough text width for packing and fitting labels (no DOM measuring in export). */
export function textWidth(text: string, size = 13): number {
  return text.length * size * 0.56;
}

export interface ItemBox {
  readonly item: RoadmapItem;
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly color: string;
  /** The title fits inside the bar; otherwise it is drawn to the right. */
  readonly labelInside: boolean;
}

export interface LaneBox {
  readonly lane: RoadmapLane;
  readonly y: number;
  readonly height: number;
  readonly itemCount: number;
}

export interface AxisCell {
  readonly x: number;
  readonly width: number;
  readonly label: string;
}

export interface RoadmapLayout {
  readonly dayWidth: number;
  readonly startDay: number;
  readonly width: number;
  readonly height: number;
  readonly top: readonly AxisCell[];
  readonly bottom: readonly AxisCell[];
  readonly lanes: readonly LaneBox[];
  readonly items: readonly ItemBox[];
  readonly todayX: number | null;
}

interface YMD {
  readonly year: number;
  readonly month: number;
  readonly date: number;
}

function ymd(day: number): YMD {
  const [year = 2000, month = 1, date = 1] = fromDayNumber(day).split("-").map(Number);
  return { year, month: month - 1, date };
}

const dayOf = (year: number, month: number, date = 1): number =>
  Math.round(Date.UTC(year, month, date) / 86_400_000);

/** Start of the column containing `day`. Quarters follow the financial year. */
function periodStart(day: number, scale: RoadmapData["scale"], fiscalYearStart: number): number {
  if (scale === "week") return toDayNumber(startOfWeek(fromDayNumber(day)));
  const { year, month } = ymd(day);
  if (scale === "month") return dayOf(year, month);
  const offset = (month - (fiscalYearStart - 1) + 12) % 12;
  return dayOf(year, month - (offset % 3));
}

function nextPeriod(day: number, scale: RoadmapData["scale"]): number {
  if (scale === "week") return day + 7;
  const { year, month } = ymd(day);
  return dayOf(year, month + (scale === "month" ? 1 : 3));
}

export function computeRoadmapLayout(data: RoadmapData, today: string = todayIso()): RoadmapLayout {
  const { scale, fiscalYearStart } = data;
  const dayWidth = DAY_WIDTH[scale];
  const todayDay = toDayNumber(today);
  const starts = data.items.map((i) => toDayNumber(i.start));
  const ends = data.items.map((i) => toDayNumber(i.end));
  const first = Math.min(todayDay, ...starts);
  const last = Math.max(todayDay, ...ends);
  const startDay = periodStart(first, scale, fiscalYearStart);
  // Columns until one past the last date, and at least the minimum.
  const columns: number[] = [];
  for (let d = startDay; d <= last || columns.length < MIN_PERIODS[scale]; d = nextPeriod(d, scale)) {
    columns.push(d);
    if (columns.length > 600) break;
  }
  const endDay = nextPeriod(columns.at(-1) ?? startDay, scale);
  const xOf = (day: number): number => (day - startDay) * dayWidth;
  const width = Math.ceil(xOf(endDay));

  const bottom: AxisCell[] = columns.map((d) => {
    const { year, month, date } = ymd(d);
    const label =
      scale === "week"
        ? `${String(date)} ${MONTHS[month] ?? ""}`
        : scale === "month"
          ? (MONTHS[month] ?? "")
          : (quarterLabel(year, month, fiscalYearStart).split(" ")[0] ?? "");
    return { x: xOf(d), width: xOf(nextPeriod(d, scale)) - xOf(d), label };
  });
  // Top row: months for week columns, otherwise years (financial years for quarters).
  const top: AxisCell[] = [];
  for (const d of columns) {
    const { year, month } = ymd(d);
    const label =
      scale === "week"
        ? `${MONTHS[month] ?? ""} ${String(year)}`
        : scale === "quarter" && fiscalYearStart !== 1
          ? (quarterLabel(year, month, fiscalYearStart).split(" ")[1] ?? "")
          : String(year);
    const x = xOf(d);
    const end = xOf(nextPeriod(d, scale));
    const previous = top.at(-1);
    if (previous?.label === label) top[top.length - 1] = { ...previous, width: end - previous.x };
    else top.push({ x, width: end - x, label });
  }

  const lanes: LaneBox[] = [];
  const items: ItemBox[] = [];
  let y = AXIS_HEIGHT;
  for (const lane of data.lanes) {
    const own = data.items
      .filter((i) => i.laneId === lane.id)
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    if (lane.collapsed) {
      lanes.push({ lane, y, height: COLLAPSED_HEIGHT, itemCount: own.length });
      y += COLLAPSED_HEIGHT;
      continue;
    }
    // Greedy packing: each item takes the first row where it doesn't overlap, label included.
    const rowEnds: number[] = [];
    for (const item of own) {
      const x1 = xOf(toDayNumber(item.start));
      const milestone = item.kind === "milestone";
      const x2 = milestone ? x1 : Math.max(x1 + 8, xOf(toDayNumber(item.end) + 1));
      const label = textWidth(item.title || "Untitled") + 16;
      const labelInside = !milestone && label <= x2 - x1;
      const left = milestone ? x1 - MILESTONE_SIZE : x1;
      const right = milestone ? x1 + MILESTONE_SIZE + 6 + label : labelInside ? x2 : x2 + 6 + label;
      let row = rowEnds.findIndex((end) => end + 6 <= left);
      if (row < 0) row = rowEnds.length;
      rowEnds[row] = right;
      items.push({
        item,
        x1,
        x2,
        y: y + LANE_PAD + row * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2,
        color: itemColor(item, data.lanes),
        labelInside,
      });
    }
    const height = Math.max(MIN_LANE_HEIGHT, rowEnds.length * ROW_HEIGHT + LANE_PAD * 2);
    lanes.push({ lane, y, height, itemCount: own.length });
    y += height;
  }
  const todayX =
    data.showToday && todayDay >= startDay && todayDay < endDay ? xOf(todayDay) + dayWidth / 2 : null;
  return { dayWidth, startDay, width, height: y, top, bottom, lanes, items, todayX };
}

/** Day number at a timeline x position. */
export function dayAtX(layout: RoadmapLayout, x: number): number {
  return layout.startDay + Math.floor(x / layout.dayWidth);
}

/** The lane under a timeline y position. */
export function laneAtY(layout: RoadmapLayout, y: number): LaneBox | undefined {
  return layout.lanes.find((l) => y >= l.y && y < l.y + l.height);
}
