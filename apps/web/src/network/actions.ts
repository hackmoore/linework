import type {
  Diagram,
  DiagramEdge,
  EntityAttribute,
  EntityType,
  NetworkData,
  NetworkEntity,
  NetworkLink,
  StrokePattern,
} from "@linework/shared";
import { usableLayerId, useEditor } from "../editor/store";
import { layoutNetwork, type NetworkLayout } from "./layout";
import {
  createEntityNode,
  createNetworkData,
  entityOf,
  entityStyle,
  isEntityNode,
  linkOf,
  pruneNetwork,
} from "./model";

/*
 * Network map changes as pure functions of the diagram (easy to test), plus wrappers that
 * apply them to the open document as one undo step.
 */

function dataOf(d: Diagram): NetworkData {
  return d.network ?? createNetworkData();
}

/** Stores an entity's details, replacing any earlier ones. */
function putEntity(d: Diagram, entity: NetworkEntity): Diagram {
  const data = dataOf(d);
  const others = data.entities.filter((e) => e.id !== entity.id);
  return { ...d, network: { ...data, entities: [...others, entity] } };
}

function putLink(d: Diagram, link: NetworkLink): Diagram {
  const data = dataOf(d);
  const others = data.links.filter((l) => l.id !== link.id);
  const empty = link.date === null && link.endDate === null;
  return { ...d, network: { ...data, links: empty ? others : [...others, link] } };
}

/** Adds an entity centred on (cx, cy). */
export function addEntity(
  d: Diagram,
  type: EntityType,
  cx: number,
  cy: number,
  layerId: string,
  name?: string,
): { diagram: Diagram; nodeId: string } {
  const node = createEntityNode(type, name ?? "", cx, cy, layerId);
  const withNode = { ...d, nodes: [...d.nodes, node] };
  return {
    diagram: putEntity(withNode, { id: node.id, type, attributes: [], notes: "" }),
    nodeId: node.id,
  };
}

/** Changes entities' type, with the matching icon and colour. */
export function setEntityType(d: Diagram, ids: readonly string[], type: EntityType): Diagram {
  const wanted = new Set(ids);
  let next: Diagram = {
    ...d,
    nodes: d.nodes.map((n) => (wanted.has(n.id) && isEntityNode(n) ? { ...n, ...entityStyle(type) } : n)),
  };
  for (const node of next.nodes)
    if (wanted.has(node.id)) next = putEntity(next, { ...entityOf(next, node), type });
  return next;
}

export function updateEntity(
  d: Diagram,
  id: string,
  patch: Partial<Pick<NetworkEntity, "attributes" | "notes">>,
): Diagram {
  const node = d.nodes.find((n) => n.id === id);
  if (!node) return d;
  return putEntity(d, { ...entityOf(d, node), ...patch });
}

export function setLinkDates(d: Diagram, id: string, dates: Pick<NetworkLink, "date" | "endDate">): Diagram {
  const edge = d.edges.find((e) => e.id === id);
  if (!edge) return d;
  const date = dates.date;
  // An end before the start is dropped rather than rejected.
  const endDate = date && dates.endDate && dates.endDate < date ? null : dates.endDate;
  return putLink(d, { ...linkOf(d, edge), date, endDate });
}

/**
 * Merges duplicate entities into the first one: links move to it (duplicates of an existing
 * link are dropped), attributes and notes are combined, and the others are removed.
 */
export function mergeEntities(d: Diagram, ids: readonly string[]): Diagram {
  const [keepId, ...rest] = ids;
  const keep = d.nodes.find((n) => n.id === keepId);
  if (!keep || rest.length === 0) return d;
  const gone = new Set(rest);
  const entities = [keep, ...d.nodes.filter((n) => gone.has(n.id))].map((n) => entityOf(d, n));
  const attributes: EntityAttribute[] = [];
  for (const a of entities.flatMap((e) => e.attributes))
    if (!attributes.some((x) => x.key === a.key && x.value === a.value)) attributes.push(a);
  const notes = entities
    .map((e) => e.notes.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 5_000);
  const seen = new Set<string>();
  const edges: DiagramEdge[] = [];
  for (const e of d.edges) {
    const source = gone.has(e.source) ? keep.id : e.source;
    const target = gone.has(e.target) ? keep.id : e.target;
    if (source === target) continue;
    const key = `${[source, target].sort().join("\u0000")}\u0000${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(source === e.source && target === e.target ? e : { ...e, source, target });
  }
  const merged: Diagram = {
    ...d,
    nodes: d.nodes.filter((n) => !gone.has(n.id)),
    edges,
    comments: d.comments.map((c) => (c.targetId && gone.has(c.targetId) ? { ...c, targetId: keep.id } : c)),
  };
  return pruneNetwork(
    putEntity(merged, { ...entityOf(d, keep), attributes: attributes.slice(0, 40), notes }),
  );
}

// ------------------------------------------------------------ editor wrappers

function commit(recipe: (d: Diagram) => Diagram): void {
  useEditor.getState().commit(recipe);
}

export const networkActions = {
  /** Adds an entity, selects it and starts editing its name. */
  addEntity(type: EntityType, at: { x: number; y: number }): void {
    const state = useEditor.getState();
    const d = state.diagram;
    if (!d) return;
    const layerId = usableLayerId(d, state.activeLayerId) ?? d.layers[0]?.id ?? "layer-1";
    // Step new entities sideways so repeated adds don't stack exactly.
    const taken = (x: number, y: number): boolean =>
      d.nodes.some((n) => Math.abs(n.x + n.width / 2 - x) < 40 && Math.abs(n.y + n.height / 2 - y) < 40);
    const y = at.y;
    let x = at.x;
    for (let i = 0; i < 20 && taken(x, y); i++) x += 140;
    const result = addEntity(d, type, Math.round(x), Math.round(y), layerId);
    state.commit(() => result.diagram);
    state.select({ nodeIds: [result.nodeId] });
    state.startEditing({ nodeId: result.nodeId });
  },
  setType(ids: readonly string[], type: EntityType): void {
    commit((d) => setEntityType(d, ids, type));
  },
  updateEntity(id: string, patch: Partial<Pick<NetworkEntity, "attributes" | "notes">>): void {
    commit((d) => updateEntity(d, id, patch));
  },
  setLinkDates(id: string, dates: Pick<NetworkLink, "date" | "endDate">): void {
    commit((d) => setLinkDates(d, id, dates));
  },
  setStrength(ids: readonly string[], pattern: StrokePattern): void {
    useEditor.getState().updateEdges(ids, { strokePattern: pattern });
  },
  merge(ids: readonly string[]): void {
    const keep = ids[0];
    commit((d) => mergeEntities(d, ids));
    if (keep) useEditor.getState().select({ nodeIds: [keep] });
  },
  layout(layout: NetworkLayout, focusId?: string): void {
    commit((d) => layoutNetwork(d, layout, focusId));
  },
};
