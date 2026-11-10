import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  EntityType,
  NetworkData,
  NetworkEntity,
  NetworkLink,
  StrokePattern,
} from "@linework/shared";
import { createId, DEFAULT_TEXT } from "../diagram/factory";

export interface EntityInfo {
  readonly label: string;
  readonly icon: string;
  readonly color: string;
  /** Suggested attributes, offered first when adding details. */
  readonly attributes: readonly string[];
}

export const ENTITY_INFO: Readonly<Record<EntityType, EntityInfo>> = {
  person: {
    label: "Person",
    icon: "user",
    color: "#1a56db",
    attributes: ["Date of birth", "Role", "Nationality"],
  },
  organisation: {
    label: "Organisation",
    icon: "building",
    color: "#6d28d9",
    attributes: ["Registration no.", "Country", "Sector"],
  },
  phone: {
    label: "Phone",
    icon: "phone",
    color: "#0f766e",
    attributes: ["Number", "Network", "Registered to"],
  },
  email: { label: "Email", icon: "mail", color: "#0e7490", attributes: ["Address", "Provider"] },
  account: {
    label: "Account",
    icon: "card",
    color: "#b45309",
    attributes: ["Bank", "Account no.", "Sort code"],
  },
  vehicle: {
    label: "Vehicle",
    icon: "car",
    color: "#4b5563",
    attributes: ["Registration", "Make", "Colour"],
  },
  location: {
    label: "Location",
    icon: "pin",
    color: "#be185d",
    attributes: ["Address", "Postcode", "Coordinates"],
  },
  website: { label: "Website", icon: "browser", color: "#2563eb", attributes: ["URL", "Registrar"] },
  device: { label: "Device", icon: "laptop", color: "#374151", attributes: ["Serial", "IP address"] },
  document: { label: "Document", icon: "file", color: "#57534e", attributes: ["Reference", "Date"] },
  event: { label: "Event", icon: "calendar", color: "#dc2626", attributes: ["Date", "Place"] },
  other: { label: "Other", icon: "target", color: "#6b7280", attributes: [] },
};

const TYPE_BY_ICON = new Map(
  Object.entries(ENTITY_INFO).map(([type, info]) => [info.icon, type as EntityType]),
);

/** How sure a link is, drawn as its line pattern. */
export const STRENGTHS: readonly (readonly [StrokePattern, string, string])[] = [
  ["solid", "Confirmed", "Backed by evidence"],
  ["dashed", "Unconfirmed", "Reported, not yet checked"],
  ["dotted", "Tentative", "Suspected or inferred"],
];

export const ENTITY_SIZE = { width: 140, height: 96 } as const;

export function createNetworkData(): NetworkData {
  return { entities: [], links: [] };
}

/** Shapes that stand for entities: everything except notes, text and groups. */
export function isEntityNode(node: DiagramNode): boolean {
  return node.kind !== "note" && node.kind !== "text" && node.kind !== "container";
}

/** Node styling for an entity of this type: its icon, colour and a tinted tile behind it. */
export function entityStyle(type: EntityType): Partial<DiagramNode> {
  const info = ENTITY_INFO[type];
  return {
    kind: "icon",
    icon: info.icon,
    stroke: info.color,
    fill: `${info.color}1f`,
    textColor: DEFAULT_TEXT,
  };
}

export function createEntityNode(
  type: EntityType,
  name: string,
  cx: number,
  cy: number,
  layerId: string,
): DiagramNode {
  const { width, height } = ENTITY_SIZE;
  return {
    id: createId(),
    kind: "icon",
    x: Math.round(cx - width / 2),
    y: Math.round(cy - height / 2),
    width,
    height,
    label: name,
    fill: "transparent",
    stroke: ENTITY_INFO[type].color,
    strokeWidth: 1.8,
    strokePattern: "solid",
    textColor: DEFAULT_TEXT,
    fontSize: 14,
    textAlign: "center",
    icon: ENTITY_INFO[type].icon,
    layerId,
    ...entityStyle(type),
  };
}

/** An entity's details. Shapes without stored details get a type from their icon. */
export function entityOf(diagram: Diagram, node: DiagramNode): NetworkEntity {
  const stored = diagram.network?.entities.find((e) => e.id === node.id);
  if (stored) return stored;
  const type = (node.icon ? TYPE_BY_ICON.get(node.icon) : undefined) ?? "other";
  return { id: node.id, type, attributes: [], notes: "" };
}

export function linkOf(diagram: Diagram, edge: DiagramEdge): NetworkLink {
  return diagram.network?.links.find((l) => l.id === edge.id) ?? { id: edge.id, date: null, endDate: null };
}

/** Drops details whose shape or line no longer exists. */
export function pruneNetwork(diagram: Diagram): Diagram {
  const data = diagram.network;
  if (!data) return diagram;
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const edgeIds = new Set(diagram.edges.map((e) => e.id));
  const entities = data.entities.filter((e) => nodeIds.has(e.id));
  const links = data.links.filter((l) => edgeIds.has(l.id));
  if (entities.length === data.entities.length && links.length === data.links.length) return diagram;
  return { ...diagram, network: { entities, links } };
}

export interface Neighbour {
  readonly node: DiagramNode;
  readonly edge: DiagramEdge;
  /** "out" when the link points away, "in" when it points here, "both" otherwise. */
  readonly direction: "out" | "in" | "both";
}

/** Entities linked to a node, in link order. */
export function neighbours(diagram: Diagram, nodeId: string): Neighbour[] {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  return diagram.edges.flatMap((edge) => {
    const otherId = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
    const node = otherId ? byId.get(otherId) : undefined;
    if (!node || otherId === nodeId) return [];
    const pointed = edge.arrowEnd !== "none" && edge.arrowStart === "none";
    const direction = !pointed ? "both" : edge.source === nodeId ? "out" : "in";
    return [{ node, edge, direction }];
  });
}

function adjacency(diagram: Diagram): Map<string, { node: string; edge: string }[]> {
  const ids = new Set(diagram.nodes.filter(isEntityNode).map((n) => n.id));
  const adj = new Map<string, { node: string; edge: string }[]>([...ids].map((id) => [id, []]));
  for (const e of diagram.edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    adj.get(e.source)?.push({ node: e.target, edge: e.id });
    adj.get(e.target)?.push({ node: e.source, edge: e.id });
  }
  return adj;
}

/** Number of distinct entities each entity is linked to. */
export function degrees(diagram: Diagram): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, links] of adjacency(diagram)) out.set(id, new Set(links.map((l) => l.node)).size);
  return out;
}

/**
 * Betweenness centrality (Brandes' algorithm): how often an entity lies on the shortest
 * path between two others. High scores mark brokers and go-betweens.
 */
export function betweenness(diagram: Diagram): Map<string, number> {
  const adj = adjacency(diagram);
  const ids = [...adj.keys()];
  const score = new Map(ids.map((id) => [id, 0]));
  for (const s of ids) {
    const stack: string[] = [];
    const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
    const sigma = new Map(ids.map((id) => [id, 0]));
    const dist = new Map(ids.map((id) => [id, -1]));
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue = [s];
    // The queue grows while it is read, which for-of handles.
    for (const v of queue) {
      stack.push(v);
      const dv = dist.get(v) ?? 0;
      for (const { node: w } of adj.get(v) ?? []) {
        if ((dist.get(w) ?? -1) < 0) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
        if (dist.get(w) === dv + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          preds.get(w)?.push(v);
        }
      }
    }
    const delta = new Map(ids.map((id) => [id, 0]));
    while (stack.length > 0) {
      const w = stack.pop() ?? "";
      for (const v of preds.get(w) ?? []) {
        const share = ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + share);
      }
      if (w !== s) score.set(w, (score.get(w) ?? 0) + (delta.get(w) ?? 0));
    }
  }
  // Each path was counted from both ends.
  for (const [id, value] of score) score.set(id, value / 2);
  return score;
}

/** Shortest chain of links between two entities, ignoring direction; null if unconnected. */
export function shortestPath(
  diagram: Diagram,
  from: string,
  to: string,
): { nodeIds: string[]; edgeIds: string[] } | null {
  const adj = adjacency(diagram);
  if (!adj.has(from) || !adj.has(to)) return null;
  const came = new Map<string, { node: string; edge: string } | null>([[from, null]]);
  const queue = [from];
  for (let head = 0; head < queue.length && !came.has(to); head++) {
    const v = queue[head] ?? "";
    for (const link of adj.get(v) ?? []) {
      if (came.has(link.node)) continue;
      came.set(link.node, { node: v, edge: link.edge });
      queue.push(link.node);
    }
  }
  if (!came.has(to)) return null;
  const nodeIds = [to];
  const edgeIds: string[] = [];
  for (let step = came.get(to); step; step = came.get(step.node)) {
    nodeIds.unshift(step.node);
    edgeIds.unshift(step.edge);
  }
  return { nodeIds, edgeIds };
}

/** Groups of entities linked to each other, largest first. */
export function clusters(diagram: Diagram): string[][] {
  const adj = adjacency(diagram);
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of adj.keys()) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length > 0) {
      const v = queue.pop() ?? "";
      group.push(v);
      for (const { node } of adj.get(v) ?? [])
        if (!seen.has(node)) {
          seen.add(node);
          queue.push(node);
        }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

/** Entities whose name, notes or attribute values contain the text. */
export function searchEntities(diagram: Diagram, query: string): DiagramNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return diagram.nodes.filter((n) => {
    if (!isEntityNode(n)) return false;
    const entity = entityOf(diagram, n);
    return [n.label, entity.notes, ...entity.attributes.map((a) => `${a.key} ${a.value}`)].some((s) =>
      s.toLowerCase().includes(q),
    );
  });
}
