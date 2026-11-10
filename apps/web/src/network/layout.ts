import type { Diagram, DiagramNode } from "@linework/shared";
import { layeredLayout, withPositions } from "../editor/arrange";
import { boundsOf } from "../render/geometry";
import { isEntityNode } from "./model";

type Positions = Map<string, { x: number; y: number }>;

/** Centre of the current entities, so a new layout stays where the user was looking. */
function anchor(nodes: readonly DiagramNode[]): { x: number; y: number } {
  const b = boundsOf(nodes);
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 };
}

/**
 * Organic (force-directed) layout, Fruchterman-Reingold style: links pull entities
 * together, every pair pushes apart, and the movement cools each round. Starts from a
 * circle in document order, so the same chart always lays out the same way.
 */
export function forceLayout(diagram: Diagram, iterations?: number): Positions {
  const nodes = diagram.nodes.filter(isEntityNode);
  const out: Positions = new Map();
  if (nodes.length === 0) return out;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const links = diagram.edges
    .map((e) => [index.get(e.source), index.get(e.target)] as const)
    .filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined && l[0] !== l[1]);
  const n = nodes.length;
  // Every round compares every pair, so big maps get fewer rounds.
  const rounds = iterations ?? (n > 1_000 ? 40 : n > 400 ? 100 : 300);
  const spacing = 230;
  const radius = Math.max(spacing, (spacing * n) / (2 * Math.PI));
  const xs = nodes.map((_, i) => radius * Math.cos((2 * Math.PI * i) / n));
  const ys = nodes.map((_, i) => radius * Math.sin((2 * Math.PI * i) / n));
  const k = spacing;
  let temperature = radius / 2;
  for (let round = 0; round < rounds; round++) {
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = (xs[i] ?? 0) - (xs[j] ?? 0);
        let ddy = (ys[i] ?? 0) - (ys[j] ?? 0);
        let dist = Math.hypot(ddx, ddy);
        if (dist < 0.01) {
          // Nudge coincident entities apart in a fixed direction.
          ddx = 0.01 * (i - j);
          ddy = 0.01;
          dist = Math.hypot(ddx, ddy);
        }
        const force = (k * k) / dist;
        dx[i] = (dx[i] ?? 0) + (ddx / dist) * force;
        dy[i] = (dy[i] ?? 0) + (ddy / dist) * force;
        dx[j] = (dx[j] ?? 0) - (ddx / dist) * force;
        dy[j] = (dy[j] ?? 0) - (ddy / dist) * force;
      }
    }
    for (const [a, b] of links) {
      const ddx = (xs[a] ?? 0) - (xs[b] ?? 0);
      const ddy = (ys[a] ?? 0) - (ys[b] ?? 0);
      const dist = Math.max(0.01, Math.hypot(ddx, ddy));
      const force = (dist * dist) / k;
      dx[a] = (dx[a] ?? 0) - (ddx / dist) * force;
      dy[a] = (dy[a] ?? 0) - (ddy / dist) * force;
      dx[b] = (dx[b] ?? 0) + (ddx / dist) * force;
      dy[b] = (dy[b] ?? 0) + (ddy / dist) * force;
    }
    for (let i = 0; i < n; i++) {
      // Gentle pull to the middle keeps unlinked groups from drifting off.
      dx[i] = (dx[i] ?? 0) - (xs[i] ?? 0) * 0.02;
      dy[i] = (dy[i] ?? 0) - (ys[i] ?? 0) * 0.02;
      const move = Math.hypot(dx[i] ?? 0, dy[i] ?? 0);
      if (move > 0) {
        const step = Math.min(move, temperature);
        xs[i] = (xs[i] ?? 0) + ((dx[i] ?? 0) / move) * step;
        ys[i] = (ys[i] ?? 0) + ((dy[i] ?? 0) / move) * step;
      }
    }
    temperature = Math.max(1, temperature * 0.97);
  }
  const centre = anchor(nodes);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  nodes.forEach((node, i) => {
    out.set(node.id, {
      x: Math.round(centre.x + (xs[i] ?? 0) - meanX - node.width / 2),
      y: Math.round(centre.y + (ys[i] ?? 0) - meanY - node.height / 2),
    });
  });
  return out;
}

/** Entities around a circle, most connected first, so hubs sit together at the top. */
export function circleLayout(diagram: Diagram): Positions {
  const nodes = diagram.nodes.filter(isEntityNode);
  const out: Positions = new Map();
  if (nodes.length === 0) return out;
  const degree = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of diagram.edges) {
    if (degree.has(e.source)) degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    if (degree.has(e.target)) degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const ordered = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  const radius = Math.max(160, (150 * nodes.length) / (2 * Math.PI));
  const centre = anchor(nodes);
  ordered.forEach((node, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / nodes.length;
    out.set(node.id, {
      x: Math.round(centre.x + radius * Math.cos(angle) - node.width / 2),
      y: Math.round(centre.y + radius * Math.sin(angle) - node.height / 2),
    });
  });
  return out;
}

/** Entities in a ring around one entity, with everything else in an outer ring. */
export function egoLayout(diagram: Diagram, centreId: string): Positions {
  const nodes = diagram.nodes.filter(isEntityNode);
  const middle = nodes.find((n) => n.id === centreId);
  const out: Positions = new Map();
  if (!middle) return out;
  const direct = new Set(
    diagram.edges.flatMap((e) =>
      e.source === centreId ? [e.target] : e.target === centreId ? [e.source] : [],
    ),
  );
  const inner = nodes.filter((n) => direct.has(n.id) && n.id !== centreId);
  const outer = nodes.filter((n) => !direct.has(n.id) && n.id !== centreId);
  const c = { x: middle.x + middle.width / 2, y: middle.y + middle.height / 2 };
  out.set(middle.id, { x: middle.x, y: middle.y });
  const ring = (ringNodes: readonly DiagramNode[], radius: number): void => {
    ringNodes.forEach((node, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / ringNodes.length;
      out.set(node.id, {
        x: Math.round(c.x + radius * Math.cos(angle) - node.width / 2),
        y: Math.round(c.y + radius * Math.sin(angle) - node.height / 2),
      });
    });
  };
  const innerRadius = Math.max(200, (150 * inner.length) / (2 * Math.PI));
  ring(inner, innerRadius);
  ring(outer, Math.max(innerRadius + 200, (140 * outer.length) / (2 * Math.PI)));
  return out;
}

export type NetworkLayout = "organic" | "circle" | "hierarchy" | "focus";

export function layoutNetwork(d: Diagram, layout: NetworkLayout, focusId?: string): Diagram {
  if (layout === "organic") return withPositions(d, forceLayout(d));
  if (layout === "circle") return withPositions(d, circleLayout(d));
  if (layout === "focus" && focusId) return withPositions(d, egoLayout(d, focusId));
  const nodes = d.nodes.filter(isEntityNode);
  return withPositions(d, layeredLayout(nodes, d.edges, "TB", { rank: 110, node: 60 }));
}
