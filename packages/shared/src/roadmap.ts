import { z } from "zod";
import { isoDateSchema } from "./gantt.js";

const id = z.string().min(1).max(64);
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected #RRGGBB or #RRGGBBAA");

/** Timeline zoom: one column per week, month or quarter. */
export const ROADMAP_SCALES = ["week", "month", "quarter"] as const;
export type RoadmapScale = (typeof ROADMAP_SCALES)[number];

export const ROADMAP_STATUSES = ["planned", "in-progress", "done", "at-risk"] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

/** A row of the roadmap: a team, product area, theme or workstream. */
export const roadmapLaneSchema = z.object({
  id,
  name: z.string().max(100),
  color: hexColor,
  /** Hide the lane's items, leaving only its header. */
  collapsed: z.boolean(),
});
export type RoadmapLane = z.infer<typeof roadmapLaneSchema>;

/** A piece of work drawn as a bar from start to end, or a milestone on one date. */
export const roadmapItemSchema = z.object({
  id,
  laneId: id,
  kind: z.enum(["item", "milestone"]),
  title: z.string().max(200),
  description: z.string().max(5_000),
  /** Inclusive dates; a milestone uses `start` and has `end` equal to it. */
  start: isoDateSchema,
  end: isoDateSchema,
  status: z.enum(ROADMAP_STATUSES),
  owner: z.string().max(100),
  /** Overrides the lane colour; null to use it. */
  color: hexColor.nullable(),
});
export type RoadmapItem = z.infer<typeof roadmapItemSchema>;

export const roadmapDataSchema = z.object({
  scale: z.enum(ROADMAP_SCALES),
  /** Month the financial year starts (1 = January), used for quarter labels. */
  fiscalYearStart: z.number().int().min(1).max(12),
  showToday: z.boolean(),
  lanes: z.array(roadmapLaneSchema).max(100),
  items: z.array(roadmapItemSchema).max(5_000),
});
export type RoadmapData = z.infer<typeof roadmapDataSchema>;

/** Structural problems zod can't see. Each entry is [path, message]. */
export function validateRoadmap(data: RoadmapData): [(string | number)[], string][] {
  const issues: [(string | number)[], string][] = [];
  const laneIds = new Set<string>();
  data.lanes.forEach((lane, index) => {
    if (laneIds.has(lane.id)) issues.push([["lanes", index, "id"], "Duplicate lane id"]);
    laneIds.add(lane.id);
  });
  const itemIds = new Set<string>();
  data.items.forEach((item, index) => {
    if (itemIds.has(item.id)) issues.push([["items", index, "id"], "Duplicate item id"]);
    itemIds.add(item.id);
    if (!laneIds.has(item.laneId)) issues.push([["items", index, "laneId"], "Item is in a missing lane"]);
    if (item.end < item.start) issues.push([["items", index, "end"], "Item ends before it starts"]);
  });
  return issues;
}
