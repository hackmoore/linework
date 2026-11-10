import type { DiagramEdge, DiagramNode } from "@linework/shared";

/*
 * Tree layout for org charts and mind maps. Each node's children are laid out side by side,
 * and the node is centred on them, so subtrees never overlap. "Along" is the direction the
 * tree grows (down, right or left) and "across" is the direction siblings are spread in.
 */

export type TreeDirection = "TB" | "LR" | "RL";

export interface Tree {
  readonly roots: readonly string[];
  readonly children: ReadonlyMap<string, readonly string[]>;
  readonly parent: ReadonlyMap<string, string>;
}

/**
 * Reads a forest from connectors between the given nodes: each node's parent is the source
 * of its first incoming connector. Connectors that would make a loop are ignored. Children
 * keep the order of their current position across the tree.
 */
export function readTree(
  nodes: readonly DiagramNode[],
  edges: readonly Pick<DiagramEdge, "source" | "target">[],
  across: (n: DiagramNode) => number = (n) => n.x + n.width / 2,
): Tree {
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = new Map<string, string>();
  const ancestors = (id: string): Set<string> => {
    const seen = new Set<string>();
    for (let p = parent.get(id); p && !seen.has(p); p = parent.get(p)) seen.add(p);
    return seen;
  };
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target || parent.has(e.target)) continue;
    // Skip connectors that would make the target its own ancestor.
    if (e.target === e.source || ancestors(e.source).has(e.target)) continue;
    parent.set(e.target, e.source);
  }
  const children = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const [child, p] of parent) children.get(p)?.push(child);
  const pos = (id: string): number => {
    const n = byId.get(id);
    return n ? across(n) : 0;
  };
  for (const list of children.values()) list.sort((a, b) => pos(a) - pos(b));
  const roots = nodes
    .filter((n) => !parent.has(n.id))
    .map((n) => n.id)
    .sort((a, b) => pos(a) - pos(b));
  return { roots, children, parent };
}

/** Every node under `id`, not including it. */
export function descendants(tree: Tree, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [...(tree.children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || out.has(next)) continue;
    out.add(next);
    stack.push(...(tree.children.get(next) ?? []));
  }
  return out;
}

export interface TreeGap {
  /** Between a parent and its children. */
  readonly level: number;
  /** Between neighbouring siblings and subtrees. */
  readonly sibling: number;
}

/**
 * Positions (top-left corners) for the subtrees under `roots`, laid side by side. The first
 * root's top-left corner lands at `origin`.
 */
export function treeLayout(
  roots: readonly string[],
  children: ReadonlyMap<string, readonly string[]>,
  byId: ReadonlyMap<string, DiagramNode>,
  direction: TreeDirection,
  gap: TreeGap,
  origin: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  const vertical = direction === "TB";
  const alongSize = (n: DiagramNode): number => (vertical ? n.height : n.width);
  const acrossSize = (n: DiagramNode): number => (vertical ? n.width : n.height);
  const breadth = new Map<string, number>();
  const visiting = new Set<string>();
  const measure = (id: string): number => {
    const node = byId.get(id);
    if (!node || visiting.has(id)) return 0;
    visiting.add(id);
    const kids = (children.get(id) ?? []).filter((k) => byId.has(k));
    const kidsBreadth = kids.reduce((sum, k, i) => sum + measure(k) + (i > 0 ? gap.sibling : 0), 0);
    const b = Math.max(acrossSize(node), kidsBreadth);
    breadth.set(id, b);
    return b;
  };
  const out = new Map<string, { x: number; y: number }>();
  /** `along` is the near edge of the node along the growth direction; `start` its band's start. */
  const place = (id: string, along: number, start: number, depth: number): void => {
    const node = byId.get(id);
    if (!node || out.has(id) || depth > 200) return;
    const b = breadth.get(id) ?? acrossSize(node);
    const cross = start + (b - acrossSize(node)) / 2;
    const alongPos = direction === "RL" ? along - alongSize(node) : along;
    out.set(
      id,
      vertical
        ? { x: Math.round(cross), y: Math.round(alongPos) }
        : { x: Math.round(alongPos), y: Math.round(cross) },
    );
    const kids = (children.get(id) ?? []).filter((k) => byId.has(k));
    const kidsBreadth = kids.reduce(
      (sum, k, i) => sum + (breadth.get(k) ?? 0) + (i > 0 ? gap.sibling : 0),
      0,
    );
    let cursor = start + (b - kidsBreadth) / 2;
    const next =
      direction === "RL" ? along - alongSize(node) - gap.level : along + alongSize(node) + gap.level;
    for (const k of kids) {
      place(k, next, cursor, depth + 1);
      cursor += (breadth.get(k) ?? 0) + gap.sibling;
    }
  };
  let cursor = vertical ? origin.x : origin.y;
  const along = vertical ? origin.y : origin.x;
  for (const root of roots) {
    measure(root);
    place(root, along, cursor, 0);
    cursor += (breadth.get(root) ?? 0) + gap.sibling * 2;
  }
  return out;
}

/** Total breadth a set of subtrees would take, for balancing two sides of a mind map. */
export function subtreeSize(id: string, children: ReadonlyMap<string, readonly string[]>): number {
  const seen = new Set<string>();
  const count = (n: string): number => {
    if (seen.has(n)) return 0;
    seen.add(n);
    const kids = children.get(n) ?? [];
    return kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + count(k), 0);
  };
  return count(id);
}
