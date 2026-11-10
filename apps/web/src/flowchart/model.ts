import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  FlowchartData,
  FlowDirection,
  FlowLane,
  ShapeKind,
} from "@linework/shared";
import { createId } from "../diagram/factory";
import { boundsOf, type Rect } from "../render/geometry";

/** Colours for flowchart shapes, so the kind of each step reads at a glance. */
const FLOW_COLORS: Partial<Record<ShapeKind, { fill: string; stroke: string }>> = {
  terminal: { fill: "#e6f4ea", stroke: "#1e7e34" },
  rectangle: { fill: "#e8f0fe", stroke: "#1a56db" },
  subroutine: { fill: "#e8f0fe", stroke: "#1a56db" },
  diamond: { fill: "#fff4e0", stroke: "#b45309" },
  parallelogram: { fill: "#f1ebff", stroke: "#6d28d9" },
  document: { fill: "#f3f4f6", stroke: "#4b5563" },
  cylinder: { fill: "#f3f4f6", stroke: "#4b5563" },
};

export const LANE_COLORS = ["#1a56db", "#0f766e", "#b45309", "#6d28d9", "#be185d", "#4b5563"] as const;

/** Header strip at the start of each lane, holding its name. */
export const LANE_HEADER = 40;
/** Space between the lane edges and the steps inside it. */
export const LANE_PAD = 32;
export const DEFAULT_LANE_SIZE = 280;
const MIN_LANE_LENGTH = 360;

/** Default fill and stroke for a new flowchart step of this kind. */
export function flowNodeStyle(kind: ShapeKind): Partial<DiagramNode> {
  return FLOW_COLORS[kind] ?? {};
}

/** A flowchart's direction, for routing; undefined for other chart types. */
export function flowDirection(diagram: Diagram): FlowDirection | undefined {
  return diagram.chartType === "flowchart" ? diagram.flowchart?.direction : undefined;
}

export function createFlowchartData(direction: FlowDirection = "TB"): FlowchartData {
  return { direction, laneStart: 0, lanes: [] };
}

export function createFlowLane(name: string, index: number, size = DEFAULT_LANE_SIZE): FlowLane {
  return { id: createId(), name, size, color: LANE_COLORS[index % LANE_COLORS.length] ?? LANE_COLORS[0] };
}

/** Annotations that sit beside the flow: never laid out, never checked, never in a lane. */
export function isAnnotation(node: DiagramNode): boolean {
  return node.kind === "note" || node.kind === "text" || node.kind === "container";
}

/** Coordinate across the flow (x for top to bottom) and along it (y for top to bottom). */
export const crossOf = (direction: FlowDirection, p: { x: number; y: number }): number =>
  direction === "TB" ? p.x : p.y;
export const alongOf = (direction: FlowDirection, p: { x: number; y: number }): number =>
  direction === "TB" ? p.y : p.x;
export const crossSize = (direction: FlowDirection, n: { width: number; height: number }): number =>
  direction === "TB" ? n.width : n.height;
export const alongSize = (direction: FlowDirection, n: { width: number; height: number }): number =>
  direction === "TB" ? n.height : n.width;

export interface LaneBand extends Rect {
  readonly lane: FlowLane;
  readonly index: number;
  /** Strip holding the lane name: along the top for columns, down the left for rows. */
  readonly header: Rect;
  /** Start of the band across the flow. */
  readonly crossStart: number;
}

/**
 * Where each lane is drawn. Lanes stack across the flow from `laneStart`; along the flow they
 * stretch to cover every step, with room for the header before the first one.
 */
export function laneBands(diagram: Diagram): LaneBand[] {
  const data = diagram.flowchart;
  if (!data || data.lanes.length === 0) return [];
  const dir = data.direction;
  const steps = diagram.nodes.filter((n) => !isAnnotation(n));
  const bounds = boundsOf(steps);
  const firstAlong = bounds ? alongOf(dir, bounds) : LANE_HEADER + LANE_PAD;
  const lastAlong = bounds ? firstAlong + alongSize(dir, bounds) : firstAlong + MIN_LANE_LENGTH;
  const start = firstAlong - LANE_HEADER - LANE_PAD;
  const length = Math.max(MIN_LANE_LENGTH, lastAlong + LANE_PAD - start);
  let cross = data.laneStart;
  return data.lanes.map((lane, index) => {
    const band =
      dir === "TB"
        ? {
            x: cross,
            y: start,
            width: lane.size,
            height: length,
            header: { x: cross, y: start, width: lane.size, height: LANE_HEADER },
          }
        : {
            x: start,
            y: cross,
            width: length,
            height: lane.size,
            header: { x: start, y: cross, width: LANE_HEADER, height: lane.size },
          };
    const result = { ...band, lane, index, crossStart: cross };
    cross += lane.size;
    return result;
  });
}

/** Cross-flow start of each lane, by id. */
export function laneStarts(data: FlowchartData): Map<string, number> {
  const starts = new Map<string, number>();
  let cross = data.laneStart;
  for (const lane of data.lanes) {
    starts.set(lane.id, cross);
    cross += lane.size;
  }
  return starts;
}

/** The lane a step's centre is in, or null when it is outside every lane. */
export function laneOf(data: FlowchartData, node: DiagramNode): string | null {
  const centre = crossOf(data.direction, node) + crossSize(data.direction, node) / 2;
  let cross = data.laneStart;
  for (const lane of data.lanes) {
    if (centre >= cross && centre < cross + lane.size) return lane.id;
    cross += lane.size;
  }
  return null;
}

/** Bounds of everything drawn: visible shapes, plus swimlanes for flowcharts. */
export function contentBounds(diagram: Diagram, nodes: readonly DiagramNode[] = diagram.nodes): Rect | null {
  return boundsOf([...nodes, ...laneBands(diagram)]);
}

/**
 * Defaults for a new connector in a flowchart: elbow routing, and "Yes" then "No" on the
 * first two branches leaving a decision.
 */
export function flowEdgeDefaults(diagram: Diagram, sourceId: string): Partial<DiagramEdge> {
  const source = diagram.nodes.find((n) => n.id === sourceId);
  if (source?.kind !== "diamond") return { routing: "elbow" };
  const branches = diagram.edges.filter((e) => e.source === sourceId).length;
  return { routing: "elbow", label: branches === 0 ? "Yes" : branches === 1 ? "No" : "" };
}

/** Kinds that may finish a path: ends, and data stores or documents that work is saved to. */
const ENDS_ALLOWED: ReadonlySet<ShapeKind> = new Set(["terminal", "cylinder", "document"]);

export interface FlowIssue {
  readonly nodeId: string | null;
  readonly message: string;
}

const name = (n: DiagramNode): string =>
  n.label.trim() ? `"${n.label.trim().replace(/\s+/g, " ")}"` : "A step";

/**
 * Common flowchart mistakes: no start, steps that can't be reached, decisions without two
 * labelled branches, and steps that lead nowhere.
 */
export function flowIssues(diagram: Diagram): FlowIssue[] {
  const steps = diagram.nodes.filter((n) => !isAnnotation(n));
  if (steps.length === 0) return [];
  const ids = new Set(steps.map((n) => n.id));
  const edges = diagram.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const outgoing = new Map<string, DiagramEdge[]>(steps.map((n) => [n.id, []]));
  const incoming = new Map<string, number>(steps.map((n) => [n.id, 0]));
  for (const e of edges) {
    outgoing.get(e.source)?.push(e);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }
  const issues: FlowIssue[] = [];
  const starts = steps.filter((n) => n.kind === "terminal" && (incoming.get(n.id) ?? 0) === 0);
  if (starts.length === 0) {
    issues.push({
      nodeId: null,
      message: "Add a Start step (the pill shape) so readers know where to begin.",
    });
  } else {
    const reached = new Set<string>();
    const queue = starts.map((n) => n.id);
    while (queue.length > 0) {
      const id = queue.pop() ?? "";
      if (reached.has(id)) continue;
      reached.add(id);
      for (const e of outgoing.get(id) ?? []) queue.push(e.target);
    }
    for (const n of steps)
      if (!reached.has(n.id))
        issues.push({ nodeId: n.id, message: `${name(n)} can't be reached from a start.` });
  }
  for (const n of steps) {
    const out = outgoing.get(n.id) ?? [];
    if (n.kind === "diamond") {
      if (out.length < 2)
        issues.push({ nodeId: n.id, message: `Decision ${name(n)} needs at least two branches.` });
      else if (out.some((e) => !e.label.trim()))
        issues.push({
          nodeId: n.id,
          message: `Label every branch of decision ${name(n)}, such as Yes and No.`,
        });
    } else if (!ENDS_ALLOWED.has(n.kind) && out.length === 0) {
      issues.push({
        nodeId: n.id,
        message: `${name(n)} has no next step. Connect it, or end with an End step.`,
      });
    }
  }
  return issues;
}
