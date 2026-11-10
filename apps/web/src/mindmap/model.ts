import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import type { KindIssue, KindModel } from "../kinds/model";
import { readTree, subtreeSize, treeLayout, type Tree } from "../kinds/tree";
import { center, wrapText } from "../render/geometry";

/*
 * Mind maps are a central topic with branches of subtopics, joined by curved lines from
 * parent to child. Topics carry meta.mindmap ("root" or "topic"); a main branch can carry
 * meta.color. Sizes, colours and line weights follow from the structure (see `normalizeMindmap`),
 * so they stay right as topics are added, renamed and moved.
 */

export const BRANCH_COLORS = [
  "#1a56db",
  "#0f766e",
  "#b45309",
  "#be185d",
  "#6d28d9",
  "#0e7490",
  "#4d7c0f",
  "#b91c1c",
] as const;
const ROOT_FILL = "#1f2937";
const LEVEL_GAP = 56;
const SIBLING_GAP = 14;

export function isTopic(node: DiagramNode): boolean {
  return node.meta?.mindmap === "root" || node.meta?.mindmap === "topic";
}

export function rootOf(diagram: Diagram): DiagramNode | undefined {
  return diagram.nodes.find((n) => n.meta?.mindmap === "root") ?? diagram.nodes.find(isTopic);
}

/**
 * The map's structure. Main branches are read clockwise from the top, like a clock face;
 * deeper topics top to bottom. Topics still sitting on their parent (just added) come last.
 */
export function mindmapTree(diagram: Diagram): Tree {
  const topics = diagram.nodes.filter(isTopic);
  const tree = readTree(topics, diagram.edges, (n) => center(n).y);
  const root = rootOf(diagram);
  if (!root) return tree;
  const rc = center(root);
  const byId = new Map(topics.map((n) => [n.id, n]));
  const angle = (id: string): number => {
    const n = byId.get(id);
    if (!n) return Infinity;
    const c = center(n);
    if (Math.abs(c.x - rc.x) < 4 && Math.abs(c.y - rc.y) < 4) return Infinity;
    const a = Math.atan2(c.x - rc.x, rc.y - c.y);
    return a < 0 ? a + Math.PI * 2 : a;
  };
  const branches = [...(tree.children.get(root.id) ?? [])].sort((a, b) => {
    const x = angle(a);
    const y = angle(b);
    return x === y ? 0 : x - y;
  });
  return { ...tree, children: new Map([...tree.children, [root.id, branches]]) };
}

/** How deep a topic is: 0 for the central topic, 1 for main branches. */
export function depths(diagram: Diagram, tree: Tree = mindmapTree(diagram)): Map<string, number> {
  const out = new Map<string, number>();
  const root = rootOf(diagram);
  const walk = (id: string, depth: number): void => {
    if (out.has(id) || depth > 200) return;
    out.set(id, depth);
    for (const child of tree.children.get(id) ?? []) walk(child, depth + 1);
  };
  if (root) walk(root.id, 0);
  return out;
}

const fontFor = (depth: number): number => (depth === 0 ? 20 : depth === 1 ? 16 : 14);

/** Size that fits a topic's text on up to a few lines. */
export function topicSize(label: string, depth: number): { width: number; height: number } {
  const fontSize = fontFor(depth);
  const maxWidth = depth === 0 ? 260 : 220;
  const natural = Math.max(...label.split("\n").map((l) => l.length), 4) * fontSize * 0.58 + 36;
  const width = Math.round(Math.min(maxWidth, Math.max(depth === 0 ? 140 : 80, natural)));
  const lines = wrapText(label || " ", width - 20, fontSize).length;
  return { width, height: Math.round(lines * fontSize * 1.3 + (depth === 0 ? 30 : 18)) };
}

function styleTopic(node: DiagramNode, depth: number, color: string): DiagramNode {
  const size = topicSize(node.label, depth);
  const style: Partial<DiagramNode> =
    depth === 0
      ? { fill: ROOT_FILL, stroke: ROOT_FILL, textColor: "#ffffff", strokeWidth: 2 }
      : depth === 1
        ? { fill: color, stroke: color, textColor: "#ffffff", strokeWidth: 2 }
        : { fill: `${color}1a`, stroke: color, textColor: "#1f2937", strokeWidth: 1.5 };
  const next = {
    ...node,
    ...style,
    ...size,
    kind: "terminal" as const,
    fontSize: fontFor(depth),
    textAlign: "center" as const,
    strokePattern: "solid" as const,
  };
  // Keep the topic's centre where it was as it grows or shrinks.
  next.x = Math.round(node.x + node.width / 2 - size.width / 2);
  next.y = Math.round(node.y + node.height / 2 - size.height / 2);
  const same =
    next.width === node.width &&
    next.height === node.height &&
    next.fill === node.fill &&
    next.stroke === node.stroke &&
    next.textColor === node.textColor &&
    next.kind === node.kind &&
    next.fontSize === node.fontSize &&
    next.strokeWidth === node.strokeWidth;
  return same ? node : next;
}

/** The colour of each main branch, in order, unless it has its own. */
export function branchColor(node: DiagramNode, index: number): string {
  return node.meta?.color ?? BRANCH_COLORS[index % BRANCH_COLORS.length] ?? BRANCH_COLORS[0];
}

/** Sizes and colours every topic, and colours and weights its lines, from the structure. */
export function normalizeMindmap(diagram: Diagram): Diagram {
  const root = rootOf(diagram);
  if (!root) return diagram;
  const tree = mindmapTree(diagram);
  const depth = depths(diagram, tree);
  const colorOf = new Map<string, string>();
  (tree.children.get(root.id) ?? []).forEach((branch, i) => {
    const node = diagram.nodes.find((n) => n.id === branch);
    const color = node ? branchColor(node, i) : BRANCH_COLORS[0];
    const stack = [branch];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || colorOf.has(id)) continue;
      colorOf.set(id, color);
      stack.push(...(tree.children.get(id) ?? []));
    }
  });
  const nodes = diagram.nodes.map((n) => {
    if (!isTopic(n)) return n;
    return styleTopic(n, depth.get(n.id) ?? 2, colorOf.get(n.id) ?? "#4b5563");
  });
  const edges = diagram.edges.map((e) => {
    if (tree.parent.get(e.target) !== e.source) return e;
    const d = depth.get(e.target) ?? 2;
    const stroke = colorOf.get(e.target) ?? "#4b5563";
    const strokeWidth = d <= 1 ? 4 : d === 2 ? 2.5 : 1.5;
    if (
      e.stroke === stroke &&
      e.strokeWidth === strokeWidth &&
      e.routing === "curved" &&
      e.arrowEnd === "none"
    )
      return e;
    return {
      ...e,
      stroke,
      strokeWidth,
      routing: "curved" as const,
      arrowEnd: "none" as const,
      arrowStart: "none" as const,
    };
  });
  const changed = nodes.some((n, i) => n !== diagram.nodes[i]) || edges.some((e, i) => e !== diagram.edges[i]);
  return changed ? { ...diagram, nodes, edges } : diagram;
}

export type MindmapLayout = "balanced" | "right";

/**
 * Lays the map out around its central topic: main branches to the right and left (balanced
 * by size, keeping each on the side it is already on unless `rebalance`), or all to the right.
 */
export function tidyMindmap(
  diagram: Diagram,
  layout: MindmapLayout = "balanced",
  rebalance = false,
): Diagram {
  const normalized = normalizeMindmap(diagram);
  const root = rootOf(normalized);
  if (!root) return normalized;
  const tree = mindmapTree(normalized);
  const byId = new Map(normalized.nodes.map((n) => [n.id, n]));
  const branches = [...(tree.children.get(root.id) ?? [])];
  const rc = center(root);
  const right: string[] = [];
  const left: string[] = [];
  if (layout === "right") right.push(...branches);
  else if (rebalance) {
    // The first half (by size) clockwise goes on the right, the rest on the left, so reading
    // clockwise from the top follows the branches' order.
    const total = branches.reduce((sum, b) => sum + subtreeSize(b, tree.children), 0);
    let rightSize = 0;
    for (const b of branches) {
      const size = subtreeSize(b, tree.children);
      if (right.length === 0 || (left.length === 0 && rightSize + size / 2 <= total / 2)) {
        right.push(b);
        rightSize += size;
      } else left.push(b);
    }
  } else {
    let rightSize = 0;
    let leftSize = 0;
    // Branches already on a side stay there; new ones (still centred on the central topic,
    // where they are created) go to the lighter side.
    const sideOf = (id: string): "left" | "right" | null => {
      const n = byId.get(id);
      if (!n) return null;
      const c = center(n);
      if (Math.abs(c.x - rc.x) < 4 && Math.abs(c.y - rc.y) < 4) return null;
      return c.x < rc.x ? "left" : "right";
    };
    for (const b of branches) {
      const size = subtreeSize(b, tree.children);
      const placed = sideOf(b);
      const goLeft = placed ? placed === "left" : leftSize < rightSize;
      if (goLeft) {
        left.push(b);
        leftSize += size;
      } else {
        right.push(b);
        rightSize += size;
      }
    }
  }
  const positions = new Map<string, { x: number; y: number }>();
  const side = (ids: string[], direction: "LR" | "RL"): void => {
    if (ids.length === 0) return;
    const along = direction === "LR" ? root.x + root.width + LEVEL_GAP * 1.6 : root.x - LEVEL_GAP * 1.6;
    const laid = treeLayout(
      ids,
      tree.children,
      byId,
      direction,
      { level: LEVEL_GAP, sibling: SIBLING_GAP },
      { x: along, y: 0 },
    );
    // Centre the side's main branches on the central topic.
    const tops = ids.map((id) => {
      const p = laid.get(id);
      const n = byId.get(id);
      return p && n ? p.y + n.height / 2 : 0;
    });
    const shift = rc.y - (Math.min(...tops) + Math.max(...tops)) / 2;
    for (const [id, p] of laid) positions.set(id, { x: p.x, y: Math.round(p.y + shift) });
  };
  side(right, "LR");
  // Clockwise, the left side runs bottom to top.
  side([...left].reverse(), "RL");
  return {
    ...normalized,
    nodes: normalized.nodes.map((n) => {
      const p = positions.get(n.id);
      return p ? { ...n, ...p } : n;
    }),
  };
}

export function createTopicNode(label: string, root = false): DiagramNode {
  const size = topicSize(label, root ? 0 : 2);
  return createNode("terminal", 0, 0, { label, ...size, meta: { mindmap: root ? "root" : "topic" } });
}

export function branchLine(parent: string, child: string): DiagramEdge {
  return createEdge(parent, child, { routing: "curved", arrowEnd: "none", strokeWidth: 2 });
}

export function mindmapIssues(diagram: Diagram): KindIssue[] {
  const root = rootOf(diagram);
  if (!root) return [];
  const depth = depths(diagram);
  return diagram.nodes
    .filter((n) => isTopic(n) && !depth.has(n.id))
    .map((n) => ({ message: `${n.label || "A topic"} isn't connected to the map`, nodeIds: [n.id] }));
}

// ---------------------------------------------------------------- outlines

export interface OutlineTopic {
  readonly text: string;
  readonly color?: string | undefined;
  readonly children?: readonly OutlineTopic[] | undefined;
}

/** Builds a laid-out mind map from a central topic and nested branches. */
export function buildMindmap(
  title: string,
  root: string,
  branches: readonly OutlineTopic[],
  layout: MindmapLayout = "balanced",
  styleId: "professional" | "sketch" = "professional",
): Diagram {
  const rootNode = createTopicNode(root, true);
  const nodes: DiagramNode[] = [rootNode];
  const edges: DiagramEdge[] = [];
  const add = (topic: OutlineTopic, parent: string, depth: number): void => {
    if (nodes.length >= 2_000 || depth > 50) return;
    const node = createTopicNode(topic.text);
    const withColor = topic.color ? { ...node, meta: { ...node.meta, color: topic.color } } : node;
    nodes.push(withColor);
    edges.push(branchLine(parent, node.id));
    for (const child of topic.children ?? []) add(child, node.id, depth + 1);
  };
  for (const b of branches) add(b, rootNode.id, 1);
  return tidyMindmap({ ...createDiagram(title, styleId, "mindmap"), nodes, edges }, layout, true);
}

const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;

export function looksLikeOutline(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  if (/^\s*mindmap\s*$/.test(lines[0] ?? "")) return true;
  const bullets = lines.filter((l) => BULLET.test(l)).length;
  return bullets >= 2 && bullets >= lines.length - 1;
}

/** Strips Mermaid mindmap shape brackets: root((Text)) becomes Text. */
function mermaidText(line: string): string {
  const m = /^[\w-]*\s*(?:\(\(|\)\)|\(\[|\[\[|\{\{|\(|\[|\))(.*?)(?:\)\)|\(\(|\]\)|\]\]|\}\}|\)|\]|\()$/.exec(
    line.trim(),
  );
  return (m ? (m[1] ?? "") : line.trim()).replace(/^"|"$/g, "");
}

/**
 * Reads an indented outline: Markdown bullets ("- topic", nested by indentation), a "# Title"
 * heading as the central topic, or Mermaid mindmap syntax.
 */
export function parseOutline(text: string): { root: string; branches: OutlineTopic[] } | null {
  const raw = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*%%/.test(l));
  const mermaid = /^\s*mindmap\s*$/.test(raw[0] ?? "");
  const lines = (mermaid ? raw.slice(1) : raw).filter((l) => !/^\s*::icon\(/.test(l));
  let root = "";
  interface Item { indent: number; text: string }
  const items: Item[] = [];
  for (const line of lines) {
    const heading = /^#+\s+(.*)$/.exec(line.trim());
    if (heading && !mermaid) {
      if (!root) root = heading[1]?.trim() ?? "";
      else items.push({ indent: 0, text: heading[1]?.trim() ?? "" });
      continue;
    }
    const bullet = BULLET.exec(line);
    const indent = (bullet ? (bullet[1] ?? "") : (/^\s*/.exec(line)?.[0] ?? "")).replace(
      /\t/g,
      "    ",
    ).length;
    const body = bullet ? (bullet[2] ?? "") : line.trim();
    items.push({
      indent: indent + (bullet ? 2 : 0),
      text: mermaid ? mermaidText(body) : body.replace(/\*\*|__/g, ""),
    });
  }
  if (!root) {
    const first = items.shift();
    if (!first) return null;
    root = first.text;
    // Everything else hangs off the first line, so measure indentation from just below it.
  }
  if (items.length === 0 && !root) return null;
  interface Node { text: string; children: Node[] }
  const top: Node[] = [];
  const stack: { indent: number; node: Node }[] = [];
  for (const item of items) {
    const node: Node = { text: item.text.slice(0, 500), children: [] };
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? 0) >= item.indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.node.children.push(node);
    else top.push(node);
    stack.push({ indent: item.indent, node });
  }
  return { root: root.slice(0, 500), branches: top };
}

export function mindmapToOutline(diagram: Diagram): string {
  const root = rootOf(diagram);
  if (!root) return "";
  const tree = mindmapTree(diagram);
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const lines = [`# ${root.label.replaceAll("\n", " ")}`, ""];
  const walk = (id: string, depth: number): void => {
    if (depth > 50) return;
    for (const child of tree.children.get(id) ?? []) {
      lines.push(`${"  ".repeat(depth)}- ${(byId.get(child)?.label ?? "").replaceAll("\n", " ")}`);
      walk(child, depth + 1);
    }
  };
  walk(root.id, 0);
  return `${lines.join("\n")}\n`;
}

export function mindmapToMermaid(diagram: Diagram): string {
  const root = rootOf(diagram);
  if (!root) return "mindmap\n";
  const tree = mindmapTree(diagram);
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const clean = (s: string): string => s.replaceAll("\n", " ").replace(/[()[\]{}]/g, "");
  const lines = ["mindmap", `  root((${clean(root.label)}))`];
  const walk = (id: string, depth: number): void => {
    if (depth > 50) return;
    for (const child of tree.children.get(id) ?? []) {
      lines.push(`${"  ".repeat(depth + 2)}${clean(byId.get(child)?.label ?? "")}`);
      walk(child, depth + 1);
    }
  };
  walk(root.id, 0);
  return `${lines.join("\n")}\n`;
}

export const mindmapModel: KindModel = {
  edgeDefaults: () => ({ routing: "curved", arrowEnd: "none" }),
  tidy: (d, direction) => tidyMindmap(d, direction === "LR" ? "right" : "balanced", direction === "TB"),
  normalize: normalizeMindmap,
  toMermaid: mindmapToMermaid,
  checks: mindmapIssues,
  exports: [
    {
      id: "markdown",
      label: "Markdown outline",
      hint: "Bulleted list for notes and docs",
      mime: "text/markdown",
      extension: "md",
      build: mindmapToOutline,
    },
  ],
  importers: [
    {
      matches: (text, fileName) =>
        /^\s*mindmap\s*$/m.test(text.split(/\r?\n/, 1)[0] ?? "") ||
        (/\.(md|markdown|txt)$/i.test(fileName) && looksLikeOutline(text)),
      run: (text, title) => {
        const outline = parseOutline(text);
        if (!outline) return { ok: false, error: "No topics found" };
        return { ok: true, diagram: buildMindmap(title || outline.root, outline.root, outline.branches) };
      },
    },
  ],
};
