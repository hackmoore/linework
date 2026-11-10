import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { boundsOf, type Rect } from "../render/geometry";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";

type Box = Pick<DiagramNode, "id" | "x" | "y" | "width" | "height">;

/** New positions that align boxes to the edge or centre of their combined bounds. */
export function alignBoxes(boxes: readonly Box[], mode: AlignMode): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const bounds = boundsOf(boxes);
  if (!bounds || boxes.length < 2) return out;
  for (const b of boxes) {
    let { x, y } = b;
    if (mode === "left") x = bounds.x;
    else if (mode === "center") x = bounds.x + bounds.width / 2 - b.width / 2;
    else if (mode === "right") x = bounds.x + bounds.width - b.width;
    else if (mode === "top") y = bounds.y;
    else if (mode === "middle") y = bounds.y + bounds.height / 2 - b.height / 2;
    else y = bounds.y + bounds.height - b.height;
    out.set(b.id, { x: Math.round(x), y: Math.round(y) });
  }
  return out;
}

/** Spaces boxes so the gaps between neighbours are equal; the outermost two stay put. */
export function distributeBoxes(boxes: readonly Box[], axis: Axis): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length < 3) return out;
  const horizontal = axis === "horizontal";
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return out;
  const span = horizontal ? last.x + last.width - first.x : last.y + last.height - first.y;
  const occupied = sorted.reduce((sum, b) => sum + (horizontal ? b.width : b.height), 0);
  const gap = (span - occupied) / (sorted.length - 1);
  let cursor = horizontal ? first.x : first.y;
  for (const b of sorted) {
    out.set(b.id, horizontal ? { x: Math.round(cursor), y: b.y } : { x: b.x, y: Math.round(cursor) });
    cursor += (horizontal ? b.width : b.height) + gap;
  }
  return out;
}

export interface GuideLine {
  readonly axis: "x" | "y";
  /** Position of the line on its axis. */
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

/**
 * Snaps a moving box to the edges and centres of other boxes within `threshold`.
 * Returns the adjustment to apply and guide lines to draw.
 */
export function snapToGuides(
  moving: Rect,
  others: readonly Rect[],
  threshold: number,
): { dx: number; dy: number; guides: GuideLine[] } {
  const xs = (r: Rect): number[] => [r.x, r.x + r.width / 2, r.x + r.width];
  const ys = (r: Rect): number[] => [r.y, r.y + r.height / 2, r.y + r.height];
  let bestX: { diff: number; at: number } | null = null;
  let bestY: { diff: number; at: number } | null = null;
  for (const other of others) {
    for (const m of xs(moving)) {
      for (const o of xs(other)) {
        const diff = o - m;
        if (Math.abs(diff) <= threshold && (!bestX || Math.abs(diff) < Math.abs(bestX.diff)))
          bestX = { diff, at: o };
      }
    }
    for (const m of ys(moving)) {
      for (const o of ys(other)) {
        const diff = o - m;
        if (Math.abs(diff) <= threshold && (!bestY || Math.abs(diff) < Math.abs(bestY.diff)))
          bestY = { diff, at: o };
      }
    }
  }
  const dx = bestX?.diff ?? 0;
  const dy = bestY?.diff ?? 0;
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: GuideLine[] = [];
  // Draw each guide across every box that touches it.
  if (bestX) {
    const at = bestX.at;
    const touching = [snapped, ...others].filter((r) => xs(r).some((v) => Math.abs(v - at) < 0.5));
    guides.push({
      axis: "x",
      at,
      from: Math.min(...touching.map((r) => r.y)),
      to: Math.max(...touching.map((r) => r.y + r.height)),
    });
  }
  if (bestY) {
    const at = bestY.at;
    const touching = [snapped, ...others].filter((r) => ys(r).some((v) => Math.abs(v - at) < 0.5));
    guides.push({
      axis: "y",
      at,
      from: Math.min(...touching.map((r) => r.x)),
      to: Math.max(...touching.map((r) => r.x + r.width)),
    });
  }
  return { dx, dy, guides };
}

export type LayoutDirection = "TB" | "LR";

/**
 * Layered ("Sugiyama-style") layout: ranks nodes along the edge direction, orders each
 * rank by the average position of its neighbours to reduce crossings, then spaces them out.
 * Keeps the layout's top-left where the nodes' bounds were.
 */
export function layeredLayout(
  nodes: readonly DiagramNode[],
  edges: readonly Pick<DiagramEdge, "source" | "target">[],
  direction: LayoutDirection = "TB",
  gap = { rank: 80, node: 48 },
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return out;
  const ids = new Set(nodes.map((n) => n.id));
  const links = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const outgoing = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const incoming = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of links) {
    outgoing.get(e.source)?.push(e.target);
    incoming.get(e.target)?.push(e.source);
  }

  // Break cycles first: a depth-first search from the sources (nodes nothing points to)
  // marks edges that lead back to a node on the current path. Starting from sources means
  // a loop back to an earlier step is the edge dropped, not the edge into the loop.
  const backEdges = new Set<string>();
  const state = new Map<string, "active" | "done">();
  const visit = (id: string): void => {
    state.set(id, "active");
    for (const next of outgoing.get(id) ?? []) {
      const s = state.get(next);
      if (s === "active") backEdges.add(`${id}\u0000${next}`);
      else if (s === undefined) visit(next);
    }
    state.set(id, "done");
  };
  const sources = nodes.filter((n) => (incoming.get(n.id) ?? []).length === 0);
  for (const n of [...sources, ...nodes]) if (!state.has(n.id)) visit(n.id);

  // Longest-path ranking over the remaining (acyclic) edges.
  const rank = new Map<string, number>();
  const rankOf = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    rank.set(id, 0);
    let r = 0;
    for (const pred of incoming.get(id) ?? [])
      if (!backEdges.has(`${pred}\u0000${id}`)) r = Math.max(r, rankOf(pred) + 1);
    rank.set(id, r);
    return r;
  };
  for (const n of nodes) rankOf(n.id);

  const rankCount = Math.max(...rank.values()) + 1;
  const layers: string[][] = Array.from({ length: rankCount }, () => []);
  // Keep the current reading order as the starting order within each rank.
  const reading = [...nodes].sort((a, b) =>
    direction === "TB" ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x,
  );
  for (const n of reading) layers[rank.get(n.id) ?? 0]?.push(n.id);

  const position = new Map<string, number>();
  const refresh = (): void => {
    for (const layer of layers) layer.forEach((id, i) => position.set(id, i));
  };
  refresh();
  for (let sweep = 0; sweep < 6; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const layer of order) {
      const score = (id: string): number => {
        const neighbours = (down ? incoming : outgoing).get(id) ?? [];
        if (neighbours.length === 0) return position.get(id) ?? 0;
        return neighbours.reduce((sum, n) => sum + (position.get(n) ?? 0), 0) / neighbours.length;
      };
      layer.sort((a, b) => score(a) - score(b));
      refresh();
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nodeLayers = layers.map((layer) => layer.flatMap((id) => byId.get(id) ?? []));
  const origin = boundsOf(nodes) ?? { x: 0, y: 0, width: 0, height: 0 };
  const along = (n: DiagramNode): number => (direction === "TB" ? n.height : n.width);
  const across = (n: DiagramNode): number => (direction === "TB" ? n.width : n.height);
  const breadths = nodeLayers.map((layer) =>
    layer.reduce((sum, n, i) => sum + across(n) + (i > 0 ? gap.node : 0), 0),
  );
  const widest = Math.max(...breadths);
  let rankOffset = 0;
  nodeLayers.forEach((layer, r) => {
    const depth = Math.max(...layer.map(along));
    let cursor = (widest - (breadths[r] ?? 0)) / 2;
    for (const n of layer) {
      const id = n.id;
      const centreAlong = rankOffset + depth / 2 - along(n) / 2;
      out.set(
        id,
        direction === "TB"
          ? { x: Math.round(origin.x + cursor), y: Math.round(origin.y + centreAlong) }
          : { x: Math.round(origin.x + centreAlong), y: Math.round(origin.y + cursor) },
      );
      cursor += across(n) + gap.node;
    }
    rankOffset += depth + gap.rank;
  });
  return out;
}

/** Applies a map of new positions to a diagram's nodes. */
export function withPositions(
  diagram: Diagram,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): Diagram {
  if (positions.size === 0) return diagram;
  return {
    ...diagram,
    nodes: diagram.nodes.map((n) => {
      const p = positions.get(n.id);
      return p && (p.x !== n.x || p.y !== n.y) ? { ...n, ...p } : n;
    }),
  };
}
