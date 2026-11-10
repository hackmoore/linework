import type { DiagramEdge, DiagramNode, ShapeKind } from "@linework/shared";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type Box = Pick<DiagramNode, "x" | "y" | "width" | "height">;

export function center(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function rectContainsPoint(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** Bounding box of a set of boxes, or null when empty. */
export function boundsOf(boxes: readonly Box[]): Rect | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const r2 = (n: number): string => String(Math.round(n * 100) / 100);

/** SVG path outline for a shape kind. "text" has no outline and returns an empty string. */
export function shapePath(kind: ShapeKind, box: Box, cornerRadius: number): string {
  const { x, y, width: w, height: h } = box;
  const poly = (points: readonly (readonly [number, number])[]): string =>
    points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${r2(x + px * w)} ${r2(y + py * h)}`).join("") + "Z";
  switch (kind) {
    case "text":
    case "icon":
      return "";
    case "hexagon":
      return poly([
        [0.25, 0],
        [0.75, 0],
        [1, 0.5],
        [0.75, 1],
        [0.25, 1],
        [0, 0.5],
      ]);
    case "triangle":
      return poly([
        [0.5, 0],
        [1, 1],
        [0, 1],
      ]);
    case "document":
      return (
        `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h * 0.85)}` +
        `Q${r2(x + w * 0.75)} ${r2(y + h * 0.7)} ${r2(x + w / 2)} ${r2(y + h * 0.85)}` +
        `T${r2(x)} ${r2(y + h * 0.85)}Z`
      );
    case "cloud": {
      const p = (px: number, py: number): string => `${r2(x + px * w)} ${r2(y + py * h)}`;
      return (
        `M${p(0.25, 0.9)}C${p(0.02, 0.9)} ${p(0, 0.55)} ${p(0.2, 0.5)}` +
        `C${p(0.14, 0.22)} ${p(0.45, 0.08)} ${p(0.56, 0.3)}` +
        `C${p(0.68, 0.08)} ${p(0.97, 0.18)} ${p(0.88, 0.47)}` +
        `C${p(1.02, 0.55)} ${p(0.98, 0.9)} ${p(0.78, 0.9)}Z`
      );
    }
    case "actor": {
      // Stick figure in the top three quarters; the label sits underneath.
      const cx = x + w / 2;
      const r = Math.min(w, h) * 0.12;
      const headCy = y + r + 1;
      const neck = headCy + r;
      const hip = y + h * 0.52;
      return (
        `M${r2(cx - r)} ${r2(headCy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(r * 2)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-r * 2)} 0Z` +
        `M${r2(cx)} ${r2(neck)}V${r2(hip)}` +
        `M${r2(x + w * 0.18)} ${r2(neck + (hip - neck) * 0.3)}H${r2(x + w * 0.82)}` +
        `M${r2(x + w * 0.22)} ${r2(y + h * 0.76)}L${r2(cx)} ${r2(hip)}L${r2(x + w * 0.78)} ${r2(y + h * 0.76)}`
      );
    }
    case "rectangle":
    case "container":
      return `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}Z`;
    case "subroutine": {
      const inset = Math.min(12, w / 8);
      return (
        `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}Z` +
        `M${r2(x + inset)} ${r2(y)}V${r2(y + h)}M${r2(x + w - inset)} ${r2(y)}V${r2(y + h)}`
      );
    }
    case "terminal":
    case "rounded": {
      const r = kind === "terminal" ? Math.min(w, h) / 2 : Math.min(cornerRadius, w / 2, h / 2);
      return (
        `M${r2(x + r)} ${r2(y)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w)} ${r2(y + r)}` +
        `V${r2(y + h - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w - r)} ${r2(y + h)}` +
        `H${r2(x + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x)} ${r2(y + h - r)}` +
        `V${r2(y + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + r)} ${r2(y)}Z`
      );
    }
    case "ellipse": {
      const rx = w / 2;
      const ry = h / 2;
      return (
        `M${r2(x)} ${r2(y + ry)}A${r2(rx)} ${r2(ry)} 0 1 1 ${r2(x + w)} ${r2(y + ry)}` +
        `A${r2(rx)} ${r2(ry)} 0 1 1 ${r2(x)} ${r2(y + ry)}Z`
      );
    }
    case "diamond":
      return `M${r2(x + w / 2)} ${r2(y)}L${r2(x + w)} ${r2(y + h / 2)}L${r2(x + w / 2)} ${r2(y + h)}L${r2(x)} ${r2(y + h / 2)}Z`;
    case "parallelogram": {
      const skew = Math.min(w * 0.2, h * 0.6);
      return `M${r2(x + skew)} ${r2(y)}H${r2(x + w)}L${r2(x + w - skew)} ${r2(y + h)}H${r2(x)}Z`;
    }
    case "cylinder": {
      const ry = Math.min(h * 0.12, 18);
      const rx = w / 2;
      return (
        `M${r2(x)} ${r2(y + ry)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(x + w)} ${r2(y + ry)}` +
        `V${r2(y + h - ry)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(x)} ${r2(y + h - ry)}Z` +
        `M${r2(x)} ${r2(y + ry)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(x + w)} ${r2(y + ry)}`
      );
    }
    case "note": {
      const fold = Math.min(18, w / 4, h / 4);
      return (
        `M${r2(x)} ${r2(y)}H${r2(x + w - fold)}L${r2(x + w)} ${r2(y + fold)}V${r2(y + h)}H${r2(x)}Z` +
        `M${r2(x + w - fold)} ${r2(y)}V${r2(y + fold)}H${r2(x + w)}`
      );
    }
  }
}

/**
 * Point where the ray from the shape's centre towards `toward` leaves the shape outline.
 * Exact for rectangles, ellipses and diamonds; other kinds use their bounding box.
 */
export function boundaryPoint(node: DiagramNode, toward: Point): Point {
  const c = center(node);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = node.width / 2;
  const hh = node.height / 2;
  let t: number;
  if (node.kind === "ellipse") {
    t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
  } else if (node.kind === "diamond") {
    t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else {
    t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  }
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Space between a looping connector and the shapes it goes around. */
const LOOP_GAP = 28;

/**
 * Elbow route for a flowchart link that goes back against the flow (a loop to an earlier
 * step). It runs back in a channel on the source's side of both shapes and enters the
 * target's side a little after its centre, so it stays clear of forward links that use the
 * centres.
 */
function loopPoints(source: DiagramNode, target: DiagramNode, flow: "TB" | "LR"): Point[] {
  const sc = center(source);
  const tc = center(target);
  if (flow === "TB") {
    const right = sc.x >= tc.x;
    const channel = right
      ? Math.max(source.x + source.width, target.x + target.width) + LOOP_GAP
      : Math.min(source.x, target.x) - LOOP_GAP;
    const sx = right ? source.x + source.width : source.x;
    const tx = right ? target.x + target.width : target.x;
    const ty = tc.y + target.height / 4;
    return dedupe([
      { x: sx, y: sc.y },
      { x: channel, y: sc.y },
      { x: channel, y: ty },
      { x: tx, y: ty },
    ]);
  }
  const below = sc.y >= tc.y;
  const channel = below
    ? Math.max(source.y + source.height, target.y + target.height) + LOOP_GAP
    : Math.min(source.y, target.y) - LOOP_GAP;
  const sy = below ? source.y + source.height : source.y;
  const ty = below ? target.y + target.height : target.y;
  const tx = tc.x + target.width / 4;
  return dedupe([
    { x: sc.x, y: sy },
    { x: sc.x, y: channel },
    { x: tx, y: channel },
    { x: tx, y: ty },
  ]);
}

/**
 * Polyline points for an edge between two nodes. `flow` is a flowchart's direction: elbow
 * links that go back against it are routed around the side as loops.
 */
export function edgePoints(
  edge: Pick<DiagramEdge, "routing">,
  source: DiagramNode,
  target: DiagramNode,
  flow?: "TB" | "LR",
): Point[] {
  const sc = center(source);
  const tc = center(target);
  if (edge.routing === "elbow" && flow) {
    const backwards =
      flow === "TB" ? target.y + target.height <= source.y : target.x + target.width <= source.x;
    if (backwards) return loopPoints(source, target, flow);
  }
  if (edge.routing === "elbow") {
    const dx = tc.x - sc.x;
    const dy = tc.y - sc.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const sx = sc.x + Math.sign(dx) * (source.width / 2);
      const tx = tc.x - Math.sign(dx) * (target.width / 2);
      const midX = (sx + tx) / 2;
      return dedupe([
        { x: sx, y: sc.y },
        { x: midX, y: sc.y },
        { x: midX, y: tc.y },
        { x: tx, y: tc.y },
      ]);
    }
    const sy = sc.y + Math.sign(dy) * (source.height / 2);
    const ty = tc.y - Math.sign(dy) * (target.height / 2);
    const midY = (sy + ty) / 2;
    return dedupe([
      { x: sc.x, y: sy },
      { x: sc.x, y: midY },
      { x: tc.x, y: midY },
      { x: tc.x, y: ty },
    ]);
  }
  return [boundaryPoint(source, tc), boundaryPoint(target, sc)];
}

/** Edge from a node to a free point, used while dragging out a new connector. */
export function previewPoints(source: DiagramNode, to: Point): Point[] {
  return [boundaryPoint(source, to), to];
}

/** Removes repeated points and middle points of straight axis-aligned runs. */
function dedupe(points: Point[]): Point[] {
  const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
  const unique = points.filter((p, i) => {
    const prev = points[i - 1];
    return !prev || !same(prev.x, p.x) || !same(prev.y, p.y);
  });
  return unique.filter((p, i) => {
    const prev = unique[i - 1];
    const next = unique[i + 1];
    if (!prev || !next) return true;
    return !((same(prev.x, p.x) && same(p.x, next.x)) || (same(prev.y, p.y) && same(p.y, next.y)));
  });
}

/** Midpoint along a polyline by length, for edge labels. */
export function polylineMidpoint(points: readonly Point[]): Point {
  const segments: { a: Point; b: Point; len: number }[] = [];
  let total = 0;
  points.forEach((b, i) => {
    const a = points[i - 1];
    if (!a) return;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, len });
    total += len;
  });
  let remaining = total / 2;
  for (const { a, b, len } of segments) {
    if (remaining <= len && len > 0) {
      const t = remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return points[0] ?? { x: 0, y: 0 };
}

export function pointsToPath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${r2(p.x)} ${r2(p.y)}`).join("");
}

/**
 * Greedy word wrap using an average glyph width estimate; good enough for
 * diagram labels and deterministic (no DOM measuring), so export matches screen.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charWidth = fontSize * 0.56;
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      let rest = word;
      // Hard-break words longer than a full line.
      while (rest.length > maxChars) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      if (!line) line = rest;
      else if (line.length + 1 + rest.length <= maxChars) line += ` ${rest}`;
      else {
        lines.push(line);
        line = rest;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Stable 32-bit seed from a string so sketchy shapes don't jitter between renders. */
export function seedFrom(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647 || 1;
}
