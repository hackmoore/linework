import { z } from "zod";
import { isoDateSchema } from "./gantt.js";

const id = z.string().min(1).max(64);
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected #RRGGBB or #RRGGBBAA");

export const KANBAN_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type KanbanPriority = (typeof KANBAN_PRIORITIES)[number];

export const kanbanColumnSchema = z.object({
  id,
  name: z.string().max(100),
  color: hexColor,
  /** Most cards the column should hold (work-in-progress limit); null for no limit. */
  wipLimit: z.number().int().min(1).max(999).nullable(),
  /** Cards here count as finished: they are never shown as overdue. */
  done: z.boolean(),
});
export type KanbanColumn = z.infer<typeof kanbanColumnSchema>;

/** A horizontal swimlane across every column, such as a team, a client or a class of work. */
export const kanbanLaneSchema = z.object({
  id,
  name: z.string().max(100),
  /** Hide the lane's cards, leaving only its header row. */
  collapsed: z.boolean(),
});
export type KanbanLane = z.infer<typeof kanbanLaneSchema>;

export const kanbanCardSchema = z.object({
  id,
  columnId: id,
  /** Swimlane, or null for cards not in a lane (the only row when there are no lanes). */
  laneId: id.nullable(),
  title: z.string().max(500),
  description: z.string().max(5_000),
  owner: z.string().max(100),
  due: isoDateSchema.nullable(),
  tags: z.array(z.string().min(1).max(40)).max(10),
  priority: z.enum(KANBAN_PRIORITIES),
  /** Accent colour; null for none. */
  color: hexColor.nullable(),
});
export type KanbanCard = z.infer<typeof kanbanCardSchema>;

/** Board contents. Cards are stored in display order within each column and lane. */
export const kanbanDataSchema = z.object({
  columns: z.array(kanbanColumnSchema).max(50),
  lanes: z.array(kanbanLaneSchema).max(50),
  cards: z.array(kanbanCardSchema).max(5_000),
});
export type KanbanData = z.infer<typeof kanbanDataSchema>;

/** Cross-field checks shared by the diagram schema. Returns issues as [path, message] pairs. */
export function validateKanban(data: KanbanData): [readonly (string | number)[], string][] {
  const issues: [readonly (string | number)[], string][] = [];
  const columnIds = new Set(data.columns.map((c) => c.id));
  const laneIds = new Set(data.lanes.map((l) => l.id));
  const unique = (items: readonly { id: string }[], name: string): void => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (seen.has(item.id)) issues.push([[name, i, "id"], `Duplicate id ${item.id}`]);
      seen.add(item.id);
    });
  };
  unique(data.columns, "columns");
  unique(data.lanes, "lanes");
  unique(data.cards, "cards");
  data.cards.forEach((card, i) => {
    if (!columnIds.has(card.columnId)) {
      issues.push([["cards", i, "columnId"], "Card references a missing column"]);
    }
    if (card.laneId !== null && !laneIds.has(card.laneId)) {
      issues.push([["cards", i, "laneId"], "Card references a missing lane"]);
    }
  });
  return issues;
}
