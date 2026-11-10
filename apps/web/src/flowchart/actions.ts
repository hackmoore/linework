import type {
  Diagram,
  DiagramNode,
  FlowchartData,
  FlowDirection,
  FlowLane,
  ShapeKind,
} from "@linework/shared";
import { createEdge, createNode, defaultSize } from "../diagram/factory";
import { usableLayerId, useEditor } from "../editor/store";
import { boundsOf } from "../render/geometry";
import { nextStepCentre, tidyFlowchart } from "./layout";
import {
  createFlowLane,
  crossOf,
  crossSize,
  DEFAULT_LANE_SIZE,
  flowEdgeDefaults,
  flowNodeStyle,
  isAnnotation,
  LANE_PAD,
  laneOf,
  laneStarts,
} from "./model";

/*
 * Flowchart changes as pure functions of the diagram (easy to test), plus small wrappers
 * that apply them to the open document as one undo step.
 */

function withData(d: Diagram, data: FlowchartData): Diagram {
  return { ...d, flowchart: data };
}

/** Moves nodes across the flow by `delta`. */
function shiftAcross(d: Diagram, ids: ReadonlySet<string>, delta: number): DiagramNode[] {
  if (delta === 0 || ids.size === 0) return d.nodes;
  const dir = d.flowchart?.direction ?? "TB";
  return d.nodes.map((n) =>
    ids.has(n.id) ? (dir === "TB" ? { ...n, x: n.x + delta } : { ...n, y: n.y + delta }) : n,
  );
}

/** Ids of the shapes in each lane, by lane id. Groups are left out: they may span lanes. */
function membersByLane(d: Diagram): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const data = d.flowchart;
  if (!data) return out;
  for (const n of d.nodes) {
    if (n.kind === "container") continue;
    const lane = laneOf(data, n);
    if (!lane) continue;
    const set = out.get(lane) ?? new Set<string>();
    set.add(n.id);
    out.set(lane, set);
  }
  return out;
}

/** Changes the reading direction and lays the chart out again to match. */
export function setDirection(d: Diagram, direction: FlowDirection): Diagram {
  const data = d.flowchart;
  if (!data || data.direction === direction) return d;
  // Lanes turn from columns into rows (or back), so read membership before anything moves.
  const lanes = new Map(d.nodes.map((n) => [n.id, laneOf(data, n)]));
  return tidyFlowchart(withData(d, { ...data, direction }), undefined, lanes);
}

/**
 * Adds a lane after the others. The first lane is sized to hold every existing step, so
 * nothing ends up outside the lanes.
 */
export function addLane(d: Diagram, name?: string): Diagram {
  const data = d.flowchart;
  if (!data) return d;
  const index = data.lanes.length;
  const label = name ?? `Lane ${String(index + 1)}`;
  if (index === 0) {
    const bounds = boundsOf(d.nodes.filter((n) => !isAnnotation(n)));
    if (!bounds) return withData(d, { ...data, laneStart: 0, lanes: [createFlowLane(label, 0)] });
    const start = Math.floor(crossOf(data.direction, bounds) - LANE_PAD);
    const size = Math.max(DEFAULT_LANE_SIZE, Math.ceil(crossSize(data.direction, bounds) + LANE_PAD * 2));
    return withData(d, { ...data, laneStart: start, lanes: [createFlowLane(label, 0, size)] });
  }
  return withData(d, { ...data, lanes: [...data.lanes, createFlowLane(label, index)] });
}

export function updateLane(
  d: Diagram,
  id: string,
  patch: Partial<Pick<FlowLane, "name" | "color">>,
): Diagram {
  const data = d.flowchart;
  if (!data) return d;
  return withData(d, { ...data, lanes: data.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
}

/** Resizes a lane; the lanes after it, and their steps, move to make room. */
export function resizeLane(d: Diagram, id: string, size: number): Diagram {
  const data = d.flowchart;
  const index = data?.lanes.findIndex((l) => l.id === id) ?? -1;
  const lane = data?.lanes[index];
  if (!data || !lane) return d;
  const next = Math.round(Math.min(4_000, Math.max(120, size)));
  const delta = next - lane.size;
  if (delta === 0) return d;
  const members = membersByLane(d);
  const later = new Set(data.lanes.slice(index + 1).flatMap((l) => [...(members.get(l.id) ?? [])]));
  return {
    ...d,
    nodes: shiftAcross(d, later, delta),
    flowchart: { ...data, lanes: data.lanes.map((l) => (l.id === id ? { ...l, size: next } : l)) },
  };
}

/** Swaps a lane with its neighbour, taking its steps with it. */
export function moveLane(d: Diagram, id: string, by: -1 | 1): Diagram {
  const data = d.flowchart;
  if (!data) return d;
  const from = data.lanes.findIndex((l) => l.id === id);
  const to = from + by;
  const a = data.lanes[from];
  const b = data.lanes[to];
  if (!a || !b) return d;
  const members = membersByLane(d);
  // The lane moving later shifts by the other lane's size, and the other way round.
  const [first, second] = by === 1 ? [a, b] : [b, a];
  let next: Diagram = { ...d, nodes: shiftAcross(d, members.get(first.id) ?? new Set(), second.size) };
  next = { ...next, nodes: shiftAcross(next, members.get(second.id) ?? new Set(), -first.size) };
  const lanes = [...data.lanes];
  lanes[from] = b;
  lanes[to] = a;
  return withData(next, { ...data, lanes });
}

/** Removes a lane. Its steps move into the neighbouring lane and the chart is tidied. */
export function deleteLane(d: Diagram, id: string): Diagram {
  const data = d.flowchart;
  if (!data) return d;
  const index = data.lanes.findIndex((l) => l.id === id);
  const lane = data.lanes[index];
  if (!lane) return d;
  const members = membersByLane(d);
  const neighbour = data.lanes[index - 1] ?? data.lanes[index + 1];
  const moved = members.get(id) ?? new Set<string>();
  const later = new Set(data.lanes.slice(index + 1).flatMap((l) => [...(members.get(l.id) ?? [])]));
  let next: Diagram = { ...d, nodes: shiftAcross(d, later, -lane.size) };
  const remaining = data.lanes.filter((l) => l.id !== id);
  next = withData(next, { ...data, lanes: remaining });
  if (neighbour && moved.size > 0) next = moveToLane(next, [...moved], neighbour.id);
  return moved.size > 0 && remaining.length > 0 ? tidyFlowchart(next) : next;
}

/** Moves steps into a lane, keeping their place along the flow. */
export function moveToLane(d: Diagram, ids: readonly string[], laneId: string): Diagram {
  const data = d.flowchart;
  const lane = data?.lanes.find((l) => l.id === laneId);
  const start = data ? laneStarts(data).get(laneId) : undefined;
  if (!data || !lane || start === undefined) return d;
  const wanted = new Set(ids);
  const centre = start + lane.size / 2;
  return {
    ...d,
    nodes: d.nodes.map((n) => {
      if (!wanted.has(n.id) || laneOf(data, n) === laneId) return n;
      const at = Math.round(centre - crossSize(data.direction, n) / 2);
      return data.direction === "TB" ? { ...n, x: at } : { ...n, y: at };
    }),
  };
}

/**
 * Adds a step after `fromId`, connected to it, one rank further along the flow and beside
 * any branches already there. Returns the new step's id.
 */
export function addNextStep(
  d: Diagram,
  fromId: string,
  kind: ShapeKind,
  layerId?: string,
): { diagram: Diagram; nodeId: string } | null {
  const from = d.nodes.find((n) => n.id === fromId);
  if (!from) return null;
  const size = defaultSize(kind);
  const at = nextStepCentre(d, from, size);
  const node = createNode(kind, at.x, at.y, {
    ...flowNodeStyle(kind),
    ...(kind === "terminal" ? { label: "End" } : {}),
    layerId: layerId ?? from.layerId,
  });
  const edge = createEdge(from.id, node.id, flowEdgeDefaults(d, from.id));
  return { diagram: { ...d, nodes: [...d.nodes, node], edges: [...d.edges, edge] }, nodeId: node.id };
}

// ------------------------------------------------------------ editor wrappers

function commitFlow(recipe: (d: Diagram) => Diagram): void {
  useEditor.getState().commit(recipe);
}

export const flowActions = {
  setDirection(direction: FlowDirection): void {
    commitFlow((d) => setDirection(d, direction));
  },
  tidy(ids?: readonly string[]): void {
    commitFlow((d) => tidyFlowchart(d, ids && ids.length > 0 ? new Set(ids) : undefined));
  },
  addLane(): void {
    commitFlow((d) => addLane(d));
  },
  updateLane(id: string, patch: Partial<Pick<FlowLane, "name" | "color">>): void {
    commitFlow((d) => updateLane(d, id, patch));
  },
  resizeLane(id: string, size: number): void {
    commitFlow((d) => resizeLane(d, id, size));
  },
  moveLane(id: string, by: -1 | 1): void {
    commitFlow((d) => moveLane(d, id, by));
  },
  deleteLane(id: string): void {
    commitFlow((d) => deleteLane(d, id));
  },
  moveToLane(ids: readonly string[], laneId: string): void {
    commitFlow((d) => moveToLane(d, ids, laneId));
  },
  /** Adds a connected step after `fromId`, selects it and starts editing its text. */
  addNextStep(fromId: string, kind: ShapeKind): void {
    const state = useEditor.getState();
    const d = state.diagram;
    if (!d) return;
    const result = addNextStep(d, fromId, kind, usableLayerId(d, state.activeLayerId));
    if (!result) return;
    state.commit(() => result.diagram);
    state.select({ nodeIds: [result.nodeId] });
    state.startEditing({ nodeId: result.nodeId });
  },
};
