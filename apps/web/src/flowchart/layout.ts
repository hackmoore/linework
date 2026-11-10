import type { Diagram, DiagramNode, FlowLane } from "@linework/shared";
import { layeredLayout, withPositions } from "../editor/arrange";
import { alongOf, alongSize, crossOf, crossSize, isAnnotation, LANE_HEADER, LANE_PAD, laneOf } from "./model";

const RANK_GAP = 64;
const NODE_GAP = 48;
const MIN_LANE_SIZE = 200;

/**
 * Lays a flowchart out along its direction. Steps are ranked along their connectors, so each
 * step sits after the ones that lead to it. With swimlanes, each step stays in its lane:
 * steps keep their rank along the flow and are centred across their own lane, and lanes
 * grow or shrink to fit. Notes, text and groups keep their positions.
 */
export function tidyFlowchart(
  diagram: Diagram,
  onlyIds?: ReadonlySet<string>,
  /** Lane for each step, when it can't be read from positions (after a direction change). */
  lanesById?: ReadonlyMap<string, string | null>,
): Diagram {
  const data = diagram.flowchart;
  if (!data) return diagram;
  const dir = data.direction;
  const steps = diagram.nodes.filter((n) => !isAnnotation(n) && (!onlyIds || onlyIds.has(n.id)));
  if (steps.length === 0) return diagram;
  const layout = layeredLayout(steps, diagram.edges, dir, { rank: RANK_GAP, node: NODE_GAP });
  if (data.lanes.length === 0 || onlyIds) return withPositions(diagram, layout);

  const firstLane = data.lanes[0]?.id ?? "";
  // Lane membership comes from where steps are now, before they move.
  const laneFor = new Map(
    steps.map((n) => [n.id, (lanesById ? lanesById.get(n.id) : laneOf(data, n)) ?? firstLane]),
  );
  const placed = steps.map((n) => {
    const p = layout.get(n.id) ?? n;
    return { node: n, along: alongOf(dir, p), cross: crossOf(dir, p) };
  });
  const minAlong = Math.min(...placed.map((p) => p.along));
  const alongStart = LANE_HEADER + LANE_PAD;

  // Group each lane's steps by rank: steps in one rank share a centre along the flow.
  const ranks = new Map<string, Map<number, typeof placed>>();
  for (const p of placed) {
    const lane = laneFor.get(p.node.id) ?? firstLane;
    const key = Math.round(p.along + alongSize(dir, p.node) / 2);
    const byRank = ranks.get(lane) ?? new Map<number, typeof placed>();
    byRank.set(key, [...(byRank.get(key) ?? []), p]);
    ranks.set(lane, byRank);
  }
  const breadth = (group: typeof placed): number =>
    group.reduce((sum, p, i) => sum + crossSize(dir, p.node) + (i > 0 ? NODE_GAP : 0), 0);

  const lanes: FlowLane[] = data.lanes.map((lane) => {
    const groups = [...(ranks.get(lane.id)?.values() ?? [])];
    const widest = Math.max(0, ...groups.map(breadth));
    return { ...lane, size: Math.max(MIN_LANE_SIZE, Math.round(widest + LANE_PAD * 2)) };
  });

  const positions = new Map<string, { x: number; y: number }>();
  let laneCross = data.laneStart;
  for (const lane of lanes) {
    for (const group of ranks.get(lane.id)?.values() ?? []) {
      group.sort((a, b) => a.cross - b.cross);
      let cursor = laneCross + (lane.size - breadth(group)) / 2;
      for (const p of group) {
        const along = p.along - minAlong + alongStart;
        const cross = Math.round(cursor);
        positions.set(
          p.node.id,
          dir === "TB" ? { x: cross, y: Math.round(along) } : { x: Math.round(along), y: cross },
        );
        cursor += crossSize(dir, p.node) + NODE_GAP;
      }
    }
    laneCross += lane.size;
  }
  return { ...withPositions(diagram, positions), flowchart: { ...data, lanes } };
}

/** Where a new step after `from` should go: one rank further along, beside any existing branches. */
export function nextStepCentre(
  diagram: Diagram,
  from: DiagramNode,
  size: { width: number; height: number },
): { x: number; y: number } {
  const dir = diagram.flowchart?.direction ?? "TB";
  const along = alongOf(dir, from) + alongSize(dir, from) + RANK_GAP + alongSize(dir, size) / 2;
  const centreCross = crossOf(dir, from) + crossSize(dir, from) / 2;
  const step = crossSize(dir, size) + NODE_GAP;
  const toPoint = (cross: number): { x: number; y: number } =>
    dir === "TB" ? { x: cross, y: along } : { x: along, y: cross };
  const overlaps = (c: { x: number; y: number }): boolean =>
    diagram.nodes.some(
      (n) =>
        n.kind !== "container" &&
        c.x - size.width / 2 < n.x + n.width + 8 &&
        c.x + size.width / 2 > n.x - 8 &&
        c.y - size.height / 2 < n.y + n.height + 8 &&
        c.y + size.height / 2 > n.y - 8,
    );
  for (let i = 0; i < 12; i++) {
    const offset = i === 0 ? 0 : Math.ceil(i / 2) * step * (i % 2 === 1 ? 1 : -1);
    const candidate = toPoint(centreCross + offset);
    if (!overlaps(candidate)) return candidate;
  }
  return toPoint(centreCross);
}
