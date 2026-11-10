import type { KanbanCard, KanbanColumn, KanbanData, KanbanLane } from "@linework/shared";
import { wrapText } from "../render/geometry";
import { boardRows, cardsIn, columnCount, isOverLimit, isOverdue } from "./model";

/** Static board layout, used for export, thumbnails and presenting. The editor uses HTML. */

export const PAD = 24;
export const COLUMN_WIDTH = 260;
export const COLUMN_GAP = 16;
export const HEADER_HEIGHT = 48;
export const LANE_HEADER_HEIGHT = 34;
export const CARD_PAD = 12;
export const CARD_GAP = 10;
export const TITLE_SIZE = 14;
export const TITLE_LINE = 19;
export const META_HEIGHT = 26;
const MIN_ROW_HEIGHT = 64;
const MAX_TITLE_LINES = 4;

export interface CardBox {
  readonly card: KanbanCard;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
  readonly hasMeta: boolean;
  readonly overdue: boolean;
}

export interface ColumnBox {
  readonly column: KanbanColumn;
  readonly x: number;
  readonly count: number;
  readonly overLimit: boolean;
}

export interface LaneBox {
  readonly lane: KanbanLane | null;
  /** Top of the lane header (or of the cards when the board has no lanes). */
  readonly y: number;
  readonly height: number;
  readonly headerHeight: number;
  readonly cardCount: number;
}

export interface KanbanLayout {
  readonly width: number;
  readonly height: number;
  readonly columns: readonly ColumnBox[];
  readonly lanes: readonly LaneBox[];
  readonly cards: readonly CardBox[];
}

export function cardHasMeta(card: KanbanCard): boolean {
  return card.owner !== "" || card.due !== null || card.tags.length > 0 || card.priority !== "none";
}

export function titleLines(title: string): string[] {
  const lines = wrapText(title || "Untitled card", COLUMN_WIDTH - CARD_PAD * 2 - 8, TITLE_SIZE);
  if (lines.length <= MAX_TITLE_LINES) return lines;
  const kept = lines.slice(0, MAX_TITLE_LINES);
  kept[MAX_TITLE_LINES - 1] = `${(kept[MAX_TITLE_LINES - 1] ?? "").slice(0, -1)}…`;
  return kept;
}

export function computeKanbanLayout(data: KanbanData, today?: string): KanbanLayout {
  const columns: ColumnBox[] = data.columns.map((column, i) => ({
    column,
    x: PAD + i * (COLUMN_WIDTH + COLUMN_GAP),
    count: columnCount(data, column.id),
    overLimit: isOverLimit(data, column),
  }));
  const rows = boardRows(data);
  const showLaneHeaders = data.lanes.length > 0;
  const lanes: LaneBox[] = [];
  const cards: CardBox[] = [];
  let y = PAD + HEADER_HEIGHT + 8;
  for (const row of rows) {
    const headerHeight = showLaneHeaders ? LANE_HEADER_HEIGHT : 0;
    const collapsed = row.lane?.collapsed ?? false;
    const top = y + headerHeight + (showLaneHeaders ? 6 : 0);
    let tallest = 0;
    let cardCount = 0;
    for (const col of columns) {
      const inCell = cardsIn(data, col.column.id, row.laneId);
      cardCount += inCell.length;
      if (collapsed) continue;
      let cy = top;
      for (const card of inCell) {
        const lines = titleLines(card.title);
        const hasMeta = cardHasMeta(card);
        const height = CARD_PAD * 2 + lines.length * TITLE_LINE + (hasMeta ? META_HEIGHT : 0);
        cards.push({
          card,
          x: col.x,
          y: cy,
          width: COLUMN_WIDTH,
          height,
          lines,
          hasMeta,
          overdue: isOverdue(card, data, today),
        });
        cy += height + CARD_GAP;
      }
      tallest = Math.max(tallest, cy - top);
    }
    const body = collapsed ? 0 : Math.max(MIN_ROW_HEIGHT, tallest);
    const height = headerHeight + (showLaneHeaders ? 6 : 0) + body + 10;
    lanes.push({ lane: row.lane, y, height, headerHeight, cardCount });
    y += height;
  }
  const width =
    PAD * 2 + Math.max(1, columns.length) * COLUMN_WIDTH + Math.max(0, columns.length - 1) * COLUMN_GAP;
  return { width, height: y + PAD - 10, columns, lanes, cards };
}
