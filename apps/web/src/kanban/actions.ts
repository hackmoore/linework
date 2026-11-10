import type { Diagram, KanbanCard, KanbanColumn, KanbanData, KanbanLane } from "@linework/shared";
import { useEditor } from "../editor/store";
import { createCard, createColumn, createLane } from "./model";

type KanbanRecipe = (data: KanbanData) => KanbanData;

/** Wraps a board change as a diagram recipe. */
export function kanbanRecipe(recipe: KanbanRecipe): (d: Diagram) => Diagram {
  return (d) => {
    if (!d.kanban) return d;
    const next = recipe(d.kanban);
    return next === d.kanban ? d : { ...d, kanban: next };
  };
}

function commitKanban(recipe: KanbanRecipe): void {
  useEditor.getState().commit(kanbanRecipe(recipe));
}

function currentBoard(): KanbanData | undefined {
  return useEditor.getState().diagram?.kanban;
}

/** Adds a card at the bottom of a column and lane, selects it and returns its id. */
export function addCard(columnId: string, laneId: string | null, title = "New card"): string | null {
  const board = currentBoard();
  if (!board?.columns.some((c) => c.id === columnId)) return null;
  const card = createCard(title, columnId, laneId);
  commitKanban((k) => ({ ...k, cards: [...k.cards, card] }));
  useEditor.getState().select({ cardIds: [card.id] });
  return card.id;
}

export function updateCard(id: string, patch: Partial<Omit<KanbanCard, "id">>): void {
  commitKanban((k) => ({ ...k, cards: k.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

/**
 * Moves a card to a column and lane, placed before `beforeCardId`, or at the bottom of
 * that column and lane when it is null.
 */
export function moveCard(
  id: string,
  columnId: string,
  laneId: string | null,
  beforeCardId: string | null,
): void {
  if (id === beforeCardId) return;
  commitKanban((k) => {
    const card = k.cards.find((c) => c.id === id);
    if (!card || !k.columns.some((c) => c.id === columnId)) return k;
    const moved = { ...card, columnId, laneId };
    const rest = k.cards.filter((c) => c.id !== id);
    let index = beforeCardId ? rest.findIndex((c) => c.id === beforeCardId) : -1;
    if (index < 0) {
      const last = rest.findLastIndex((c) => c.columnId === columnId && c.laneId === laneId);
      index = last >= 0 ? last + 1 : rest.length;
    }
    const cards = [...rest.slice(0, index), moved, ...rest.slice(index)];
    const unchanged =
      card.columnId === columnId && card.laneId === laneId && cards.every((c, i) => c.id === k.cards[i]?.id);
    return unchanged ? k : { ...k, cards };
  });
}

/** Moves a card one place up or down within its column and lane. */
export function moveCardInColumn(id: string, direction: -1 | 1): void {
  const board = currentBoard();
  const card = board?.cards.find((c) => c.id === id);
  if (!board || !card) return;
  const siblings = board.cards.filter((c) => c.columnId === card.columnId && c.laneId === card.laneId);
  const index = siblings.findIndex((c) => c.id === id);
  if (!siblings[index + direction]) return;
  const before = direction === -1 ? (siblings[index - 1]?.id ?? null) : (siblings[index + 2]?.id ?? null);
  moveCard(id, card.columnId, card.laneId, before);
}

/** Moves a card to the next or previous column, keeping its lane. */
export function moveCardAcross(id: string, direction: -1 | 1): void {
  const board = currentBoard();
  const card = board?.cards.find((c) => c.id === id);
  if (!board || !card) return;
  const index = board.columns.findIndex((c) => c.id === card.columnId);
  const target = board.columns[index + direction];
  if (target) moveCard(id, target.id, card.laneId, null);
}

export function addColumn(name = "New column"): string | null {
  const board = currentBoard();
  if (!board) return null;
  const column = createColumn(name, board.columns.length);
  commitKanban((k) => ({ ...k, columns: [...k.columns, column] }));
  return column.id;
}

export function updateColumn(id: string, patch: Partial<Omit<KanbanColumn, "id">>): void {
  commitKanban((k) => ({ ...k, columns: k.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

/** Removes a column. Its cards move to the neighbouring column, or are removed with the last column. */
export function deleteColumn(id: string): void {
  commitKanban((k) => {
    const index = k.columns.findIndex((c) => c.id === id);
    if (index < 0) return k;
    const columns = k.columns.filter((c) => c.id !== id);
    const fallback = columns[Math.max(0, index - 1)];
    const cards = fallback
      ? k.cards.map((c) => (c.columnId === id ? { ...c, columnId: fallback.id } : c))
      : k.cards.filter((c) => c.columnId !== id);
    return { ...k, columns, cards };
  });
}

/** Moves a column one place left or right. */
export function moveColumn(id: string, direction: -1 | 1): void {
  commitKanban((k) => {
    const columns = moveItem(k.columns, id, direction);
    return columns ? { ...k, columns } : k;
  });
}

export function addLane(name = "New lane"): string | null {
  const board = currentBoard();
  if (!board) return null;
  const lane = createLane(name);
  commitKanban((k) => {
    // The first lane takes the existing cards, so nothing is left in an unnamed row.
    const cards =
      k.lanes.length === 0
        ? k.cards.map((c) => (c.laneId === null ? { ...c, laneId: lane.id } : c))
        : k.cards;
    return { ...k, lanes: [...k.lanes, lane], cards };
  });
  return lane.id;
}

export function updateLane(id: string, patch: Partial<Omit<KanbanLane, "id">>): void {
  commitKanban((k) => ({ ...k, lanes: k.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
}

export function toggleLane(id: string): void {
  commitKanban((k) => ({
    ...k,
    lanes: k.lanes.map((l) => (l.id === id ? { ...l, collapsed: !l.collapsed } : l)),
  }));
}

/** Removes a lane. Its cards move to the neighbouring lane, or out of lanes with the last lane. */
export function deleteLane(id: string): void {
  commitKanban((k) => {
    const index = k.lanes.findIndex((l) => l.id === id);
    if (index < 0) return k;
    const lanes = k.lanes.filter((l) => l.id !== id);
    const fallback = lanes[Math.max(0, index - 1)]?.id ?? null;
    return { ...k, lanes, cards: k.cards.map((c) => (c.laneId === id ? { ...c, laneId: fallback } : c)) };
  });
}

export function moveLane(id: string, direction: -1 | 1): void {
  commitKanban((k) => {
    const lanes = moveItem(k.lanes, id, direction);
    return lanes ? { ...k, lanes } : k;
  });
}

/** The items with one moved a place, or null when it can't move. */
function moveItem<T extends { id: string }>(items: readonly T[], id: string, direction: -1 | 1): T[] | null {
  const index = items.findIndex((i) => i.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return null;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}
