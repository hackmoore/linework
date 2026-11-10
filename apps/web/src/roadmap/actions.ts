import {
  fromDayNumber,
  toDayNumber,
  type Diagram,
  type RoadmapData,
  type RoadmapItem,
  type RoadmapLane,
} from "@linework/shared";
import { useEditor } from "../editor/store";
import { addDays } from "../gantt/model";
import { createRoadmapItem, createRoadmapLane, DEFAULT_DAYS, defaultStart } from "./model";

type RoadmapRecipe = (data: RoadmapData) => RoadmapData;

/** Wraps a roadmap change as a diagram recipe. */
export function roadmapRecipe(recipe: RoadmapRecipe): (d: Diagram) => Diagram {
  return (d) => {
    if (!d.roadmap) return d;
    const next = recipe(d.roadmap);
    return next === d.roadmap ? d : { ...d, roadmap: next };
  };
}

function commitRoadmap(recipe: RoadmapRecipe): void {
  useEditor.getState().commit(roadmapRecipe(recipe));
}

function current(): RoadmapData | undefined {
  return useEditor.getState().diagram?.roadmap;
}

/** Keeps an item's dates consistent: milestones last one day, items never end before they start. */
export function normaliseItem(item: RoadmapItem): RoadmapItem {
  if (item.kind === "milestone") return item.end === item.start ? item : { ...item, end: item.start };
  return item.end < item.start ? { ...item, end: item.start } : item;
}

/** Moves an item by whole days, and optionally into another lane. */
export function shiftItem(item: RoadmapItem, days: number, laneId = item.laneId): RoadmapItem {
  if (days === 0 && laneId === item.laneId) return item;
  return { ...item, laneId, start: addDays(item.start, days), end: addDays(item.end, days) };
}

/** Moves one edge of an item, never past the other edge. */
export function resizeItem(item: RoadmapItem, edge: "start" | "end", days: number): RoadmapItem {
  if (item.kind === "milestone" || days === 0) return item;
  const start = toDayNumber(item.start);
  const end = toDayNumber(item.end);
  return edge === "start"
    ? { ...item, start: fromDayNumber(Math.min(start + days, end)) }
    : { ...item, end: fromDayNumber(Math.max(end + days, start)) };
}

/** Removes a lane. Its items move to the neighbouring lane, or go with it when it is the last. */
export function removeLane(data: RoadmapData, id: string): RoadmapData {
  const index = data.lanes.findIndex((l) => l.id === id);
  if (index < 0) return data;
  const neighbour = data.lanes[index - 1] ?? data.lanes[index + 1];
  return {
    ...data,
    lanes: data.lanes.filter((l) => l.id !== id),
    items: neighbour
      ? data.items.map((i) => (i.laneId === id ? { ...i, laneId: neighbour.id } : i))
      : data.items.filter((i) => i.laneId !== id),
  };
}

export function moveLaneBy(data: RoadmapData, id: string, by: -1 | 1): RoadmapData {
  const from = data.lanes.findIndex((l) => l.id === id);
  const to = from + by;
  const a = data.lanes[from];
  const b = data.lanes[to];
  if (!a || !b) return data;
  const lanes = [...data.lanes];
  lanes[from] = b;
  lanes[to] = a;
  return { ...data, lanes };
}

// ------------------------------------------------------------ editor wrappers

/** Adds an item or milestone, selects it and returns its id. Adds a lane first if there are none. */
export function addItem(
  kind: RoadmapItem["kind"],
  at: { laneId?: string; start?: string } = {},
  title = kind === "milestone" ? "New milestone" : "New item",
): string | null {
  const data = current();
  if (!data) return null;
  const lane = data.lanes.find((l) => l.id === at.laneId) ?? data.lanes[0] ?? createRoadmapLane("Lane 1", 0);
  const item = createRoadmapItem(title, lane.id, at.start ?? defaultStart(), DEFAULT_DAYS[data.scale], {
    kind,
  });
  commitRoadmap((r) => ({
    ...r,
    lanes: r.lanes.some((l) => l.id === lane.id) ? r.lanes : [...r.lanes, lane],
    items: [...r.items, item],
  }));
  useEditor.getState().select({ taskIds: [item.id] });
  return item.id;
}

export function updateItem(id: string, patch: Partial<Omit<RoadmapItem, "id">>): void {
  commitRoadmap((r) => ({
    ...r,
    items: r.items.map((i) => (i.id === id ? normaliseItem({ ...i, ...patch }) : i)),
  }));
}

export function updateItems(ids: readonly string[], patch: Partial<Omit<RoadmapItem, "id">>): void {
  const wanted = new Set(ids);
  commitRoadmap((r) => ({
    ...r,
    items: r.items.map((i) => (wanted.has(i.id) ? normaliseItem({ ...i, ...patch }) : i)),
  }));
}

/** Moves selected items by whole days (keyboard nudging). */
export function shiftItems(ids: readonly string[], days: number): void {
  const wanted = new Set(ids);
  commitRoadmap((r) => ({ ...r, items: r.items.map((i) => (wanted.has(i.id) ? shiftItem(i, days) : i)) }));
}

export function updateRoadmapSettings(
  patch: Partial<Pick<RoadmapData, "scale" | "fiscalYearStart" | "showToday">>,
): void {
  commitRoadmap((r) => ({ ...r, ...patch }));
}

export function addLane(name?: string): string | null {
  const data = current();
  if (!data || data.lanes.length >= 100) return null;
  const lane = createRoadmapLane(name ?? `Lane ${String(data.lanes.length + 1)}`, data.lanes.length);
  commitRoadmap((r) => ({ ...r, lanes: [...r.lanes, lane] }));
  return lane.id;
}

export function updateLane(id: string, patch: Partial<Omit<RoadmapLane, "id">>): void {
  commitRoadmap((r) => ({ ...r, lanes: r.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
}

export function deleteLane(id: string): void {
  commitRoadmap((r) => removeLane(r, id));
}

export function moveLane(id: string, by: -1 | 1): void {
  commitRoadmap((r) => moveLaneBy(r, id, by));
}
