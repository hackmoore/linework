import type { KanbanCard, KanbanColumn, KanbanData, KanbanLane, KanbanPriority } from "@linework/shared";
import { createId } from "../diagram/factory";
import { todayIso } from "../gantt/model";

export const COLUMN_COLORS = ["#6b7280", "#1a56db", "#b45309", "#6d28d9", "#0f766e", "#be185d"] as const;

/** Card accent colours offered in the inspector. */
export const CARD_COLORS = [
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#9333ea",
] as const;

export const PRIORITY_LABELS: Readonly<Record<KanbanPriority, string>> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_COLORS: Readonly<Record<KanbanPriority, string>> = {
  none: "#9ca3af",
  low: "#16a34a",
  medium: "#ca8a04",
  high: "#ea580c",
  urgent: "#dc2626",
};

export function createColumn(
  name: string,
  index: number,
  overrides: Partial<KanbanColumn> = {},
): KanbanColumn {
  return {
    id: createId(),
    name,
    color: COLUMN_COLORS[index % COLUMN_COLORS.length] ?? COLUMN_COLORS[0],
    wipLimit: null,
    done: false,
    ...overrides,
  };
}

export function createLane(name: string): KanbanLane {
  return { id: createId(), name, collapsed: false };
}

export function createCard(
  title: string,
  columnId: string,
  laneId: string | null = null,
  overrides: Partial<KanbanCard> = {},
): KanbanCard {
  return {
    id: createId(),
    columnId,
    laneId,
    title,
    description: "",
    owner: "",
    due: null,
    tags: [],
    priority: "none",
    color: null,
    ...overrides,
  };
}

/** The usual starting columns: To do, In progress (WIP 3), Done. */
export function createKanbanData(): KanbanData {
  return {
    columns: [
      createColumn("To do", 0),
      createColumn("In progress", 1, { wipLimit: 3 }),
      createColumn("Done", 4, { done: true }),
    ],
    lanes: [],
    cards: [],
  };
}

/**
 * Rows shown on the board: each lane, plus a row for cards without a lane. That row is
 * the whole board when there are no lanes, and is only shown otherwise when it has cards.
 */
export interface BoardRow {
  /** Lane id, or null for cards without a lane. */
  readonly laneId: string | null;
  readonly lane: KanbanLane | null;
}

export function boardRows(data: KanbanData): BoardRow[] {
  const laneIds = new Set(data.lanes.map((l) => l.id));
  const rows: BoardRow[] = data.lanes.map((lane) => ({ laneId: lane.id, lane }));
  const loose = data.cards.some((c) => c.laneId === null || !laneIds.has(c.laneId));
  if (data.lanes.length === 0 || loose) rows.unshift({ laneId: null, lane: null });
  return rows;
}

/** Cards in one column and lane, in display order. */
export function cardsIn(data: KanbanData, columnId: string, laneId: string | null): KanbanCard[] {
  return data.cards.filter((c) => c.columnId === columnId && c.laneId === laneId);
}

export function columnCount(data: KanbanData, columnId: string): number {
  return data.cards.reduce((n, c) => (c.columnId === columnId ? n + 1 : n), 0);
}

export function isOverLimit(data: KanbanData, column: KanbanColumn): boolean {
  return column.wipLimit !== null && columnCount(data, column.id) > column.wipLimit;
}

/** Due before today and not in a done column. */
export function isOverdue(card: KanbanCard, data: KanbanData, today: string = todayIso()): boolean {
  if (!card.due || card.due >= today) return false;
  return !data.columns.find((c) => c.id === card.columnId)?.done;
}

/** Splits a comma-separated tag list into clean, unique tags. */
export function parseTags(text: string): string[] {
  const tags = text
    .split(",")
    .map((t) => t.trim().slice(0, 40))
    .filter((t) => t.length > 0);
  return [...new Set(tags)].slice(0, 10);
}

/** Whether a card matches a search: title, description, owner or a tag contains the text. */
export function matchesFilter(card: KanbanCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [card.title, card.description, card.owner, ...card.tags].some((s) => s.toLowerCase().includes(q));
}

/** Removes cards by id. */
export function withoutCards(data: KanbanData, ids: ReadonlySet<string>): KanbanData {
  return { ...data, cards: data.cards.filter((c) => !ids.has(c.id)) };
}
