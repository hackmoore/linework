import { z } from "zod";

const id = z.string().min(1).max(64);
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected #RRGGBB or #RRGGBBAA");

/** Which way a flowchart reads: top to bottom, or left to right. */
export const FLOW_DIRECTIONS = ["TB", "LR"] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

/**
 * A swimlane: a band across the flow for one person, team or system. Lanes sit side by side
 * across the flow (columns when it reads top to bottom, rows when it reads left to right),
 * and a step belongs to the lane its centre is in.
 */
export const flowLaneSchema = z.object({
  id,
  name: z.string().max(100),
  /** Width of the band across the flow, in diagram units. */
  size: z.number().min(120).max(4_000),
  color: hexColor,
});
export type FlowLane = z.infer<typeof flowLaneSchema>;

export const flowchartDataSchema = z.object({
  direction: z.enum(FLOW_DIRECTIONS),
  /** Where the first lane starts across the flow (x for top to bottom, y for left to right). */
  laneStart: z.number(),
  lanes: z.array(flowLaneSchema).max(30),
});
export type FlowchartData = z.infer<typeof flowchartDataSchema>;

/** Structural problems zod can't see. Each entry is [path, message]. */
export function validateFlowchart(data: FlowchartData): [(string | number)[], string][] {
  const issues: [(string | number)[], string][] = [];
  const seen = new Set<string>();
  data.lanes.forEach((lane, index) => {
    if (seen.has(lane.id)) issues.push([["lanes", index, "id"], "Duplicate lane id"]);
    seen.add(lane.id);
  });
  return issues;
}
