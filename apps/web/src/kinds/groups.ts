import type { Diagram, DiagramNode } from "@linework/shared";
import { layeredLayout, type LayoutDirection } from "../editor/arrange";
import { boundsOf, center, rectContainsPoint } from "../render/geometry";

/*
 * Groups (container shapes) such as C4 boundaries and composite states hold whatever sits
 * inside them. Membership is read from positions before an automatic layout moves things,
 * and the groups are then refitted around their members.
 */

const PAD = 28;
/** Room for the group's name along its top edge. */
const LABEL_SPACE = 30;

/**
 * Direct members of each group: shapes (and smaller groups) whose centre is inside it,
 * assigned to the smallest group that contains them.
 */
export function groupMembers(nodes: readonly DiagramNode[]): Map<string, Set<string>> {
  const groups = nodes.filter((n) => n.kind === "container");
  const byArea = [...groups].sort((a, b) => a.width * a.height - b.width * b.height);
  const members = new Map<string, Set<string>>(groups.map((g) => [g.id, new Set<string>()]));
  for (const node of nodes) {
    const c = center(node);
    const area = node.width * node.height;
    const parent = byArea.find(
      (g) => g.id !== node.id && g.width * g.height > area && rectContainsPoint(g, c),
    );
    if (parent) members.get(parent.id)?.add(node.id);
  }
  return members;
}

/** The group each shape belongs to directly, if any. */
export function parentGroups(members: ReadonlyMap<string, ReadonlySet<string>>): Map<string, string> {
  const parent = new Map<string, string>();
  for (const [group, ids] of members) for (const id of ids) parent.set(id, group);
  return parent;
}

/**
 * Resizes each group to wrap its members, innermost first. Groups with no members keep
 * their size and position.
 */
export function fitGroups(diagram: Diagram, members: ReadonlyMap<string, ReadonlySet<string>>): Diagram {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const done = new Set<string>();
  const fit = (groupId: string, depth: number): void => {
    if (done.has(groupId) || depth > 20) return;
    done.add(groupId);
    const ids = [...(members.get(groupId) ?? [])];
    for (const id of ids) if (members.has(id)) fit(id, depth + 1);
    const boxes = ids.map((id) => byId.get(id)).filter((n): n is DiagramNode => n !== undefined);
    const bounds = boundsOf(boxes);
    const group = byId.get(groupId);
    if (!bounds || !group) return;
    byId.set(groupId, {
      ...group,
      x: Math.round(bounds.x - PAD),
      y: Math.round(bounds.y - PAD - LABEL_SPACE),
      width: Math.round(bounds.width + PAD * 2),
      height: Math.round(bounds.height + PAD * 2 + LABEL_SPACE),
    });
  };
  for (const id of members.keys()) fit(id, 0);
  return { ...diagram, nodes: diagram.nodes.map((n) => byId.get(n.id) ?? n) };
}

/**
 * Layered layout that keeps groups together: each group's members are laid out first, then
 * the group is laid out as one block among its siblings, with connectors into the group
 * counting as connectors to the block. Shapes outside a group never end up inside it.
 * Returns new boxes for the laid-out shapes and their groups.
 */
export function clusteredLayout(
  diagram: Diagram,
  shapes: readonly DiagramNode[],
  members: ReadonlyMap<string, ReadonlySet<string>>,
  direction: LayoutDirection,
  gap: { rank: number; node: number },
): Diagram {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const included = new Set(shapes.map((s) => s.id));
  const parent = parentGroups(members);
  // A group takes part when something laid out is inside it, however deep.
  const active = new Set<string>();
  for (const id of included) {
    let p = parent.get(id);
    for (let i = 0; p && i < 20; i++) {
      active.add(p);
      p = parent.get(p);
    }
  }
  const childrenOf = (groupId: string | null): string[] => {
    const ids =
      groupId === null
        ? [...included, ...active].filter((id) => !parent.has(id) || !active.has(parent.get(id) ?? ""))
        : [...(members.get(groupId) ?? [])];
    return ids.filter((id) => included.has(id) || active.has(id));
  };
  /** Which child of `groupId` contains `id`, if any. */
  const childContaining = (groupId: string | null, id: string): string | undefined => {
    let current: string | undefined = id;
    for (let i = 0; current && i < 25; i++) {
      const p = parent.get(current);
      const pActive = p !== undefined && active.has(p);
      if ((groupId === null && !pActive) || p === groupId) return current;
      current = p;
    }
    return undefined;
  };

  /** Relative top-left of every descendant, and the block's size. */
  const relative = new Map<string, { x: number; y: number; width: number; height: number }>();
  const layoutGroup = (groupId: string | null, depth: number): { width: number; height: number } => {
    const children = childrenOf(groupId);
    const proxies: DiagramNode[] = [];
    for (const id of children) {
      const node = byId.get(id);
      if (!node) continue;
      if (active.has(id) && depth < 20) {
        const inner = layoutGroup(id, depth + 1);
        proxies.push({ ...node, width: inner.width + PAD * 2, height: inner.height + PAD * 2 + LABEL_SPACE });
      } else proxies.push(node);
    }
    const edges = diagram.edges.flatMap((e) => {
      const source = childContaining(groupId, e.source);
      const target = childContaining(groupId, e.target);
      return source && target && source !== target ? [{ source, target }] : [];
    });
    const placed = layeredLayout(proxies, edges, direction, gap, true);
    const boxes = proxies.map((p) => ({ ...p, ...(placed.get(p.id) ?? p) }));
    const bounds = boundsOf(boxes) ?? { x: 0, y: 0, width: 0, height: 0 };
    for (const b of boxes) {
      relative.set(b.id, { x: b.x - bounds.x, y: b.y - bounds.y, width: b.width, height: b.height });
    }
    return { width: bounds.width, height: bounds.height };
  };
  layoutGroup(null, 0);

  // Place everything from where the shapes started, nesting each group's offsets.
  const origin = boundsOf(shapes) ?? { x: 0, y: 0, width: 0, height: 0 };
  const absolute = new Map<string, { x: number; y: number; width: number; height: number }>();
  const place = (groupId: string | null, x: number, y: number, depth: number): void => {
    for (const id of childrenOf(groupId)) {
      const r = relative.get(id);
      if (!r) continue;
      const box = { x: Math.round(x + r.x), y: Math.round(y + r.y), width: r.width, height: r.height };
      absolute.set(id, box);
      if (active.has(id) && depth < 20) place(id, box.x + PAD, box.y + PAD + LABEL_SPACE, depth + 1);
    }
  };
  place(null, origin.x, origin.y, 0);
  return {
    ...diagram,
    nodes: diagram.nodes.map((n) => {
      const box = absolute.get(n.id);
      if (!box) return n;
      return active.has(n.id) ? { ...n, ...box } : { ...n, x: box.x, y: box.y };
    }),
  };
}
