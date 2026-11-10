import {
  parseDiagram,
  type Diagram,
  type GanttData,
  type GanttDependency,
  type FlowchartData,
  type NetworkData,
  type KanbanData,
} from "@linework/shared";

/*
 * Element-level patches for live collaboration. Each change sends only the objects that
 * changed, so two people editing different shapes or tasks never overwrite each other;
 * when two people change the same object, the last change to arrive wins.
 */

interface Item {
  readonly id: string;
}

export interface CollectionPatch {
  readonly upsert: readonly Item[];
  readonly remove: readonly string[];
  /** Full id order, sent when order changed (z-order, task order). */
  readonly order?: readonly string[];
}

export interface DiagramPatch {
  readonly set: Readonly<Record<string, unknown>>;
  readonly collections: Readonly<Record<string, CollectionPatch>>;
}

const SCALARS = ["title", "styleId", "background", "chartType"] as const;
const GANTT_SCALARS = [
  "scale",
  "autoSchedule",
  "showToday",
  "showCriticalPath",
  "calendar",
  "baseline",
] as const;
type CollectionName =
  | "nodes"
  | "edges"
  | "layers"
  | "comments"
  | "gantt.tasks"
  | "gantt.sections"
  | "kanban.columns"
  | "kanban.lanes"
  | "kanban.cards"
  | "flowchart.lanes"
  | "network.entities"
  | "network.links";
const COLLECTIONS: readonly CollectionName[] = [
  "nodes",
  "edges",
  "layers",
  "comments",
  "gantt.tasks",
  "gantt.sections",
  "kanban.columns",
  "kanban.lanes",
  "kanban.cards",
  "flowchart.lanes",
  "network.entities",
  "network.links",
];
const FLOWCHART_SCALARS = ["direction", "laneStart"] as const;

function getCollection(d: Diagram, name: CollectionName): readonly Item[] {
  switch (name) {
    case "gantt.tasks":
      return d.gantt?.tasks ?? [];
    case "gantt.sections":
      return d.gantt?.sections ?? [];
    case "kanban.columns":
      return d.kanban?.columns ?? [];
    case "kanban.lanes":
      return d.kanban?.lanes ?? [];
    case "kanban.cards":
      return d.kanban?.cards ?? [];
    case "flowchart.lanes":
      return d.flowchart?.lanes ?? [];
    case "network.entities":
      return d.network?.entities ?? [];
    case "network.links":
      return d.network?.links ?? [];
    default:
      return d[name];
  }
}

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

export function diffDiagrams(prev: Diagram, next: Diagram): DiagramPatch | null {
  const set: Record<string, unknown> = {};
  for (const key of SCALARS) if (!same(prev[key], next[key])) set[key] = next[key];
  if (next.gantt) {
    for (const key of GANTT_SCALARS)
      if (!prev.gantt || !same(prev.gantt[key], next.gantt[key])) set[`gantt.${key}`] = next.gantt[key];
  }
  if (next.flowchart) {
    for (const key of FLOWCHART_SCALARS)
      if (!prev.flowchart || !same(prev.flowchart[key], next.flowchart[key]))
        set[`flowchart.${key}`] = next.flowchart[key];
  }
  const collections: Record<string, CollectionPatch> = {};
  for (const name of COLLECTIONS) {
    const before = getCollection(prev, name);
    const after = getCollection(next, name);
    if (before === after) continue;
    const beforeById = new Map(before.map((i) => [i.id, i]));
    const afterIds = new Set(after.map((i) => i.id));
    const upsert = after.filter((i) => !same(beforeById.get(i.id), i));
    const remove = before.filter((i) => !afterIds.has(i.id)).map((i) => i.id);
    // Order matters (z-order, task rows). Send it when surviving items were reordered or
    // when new items were inserted anywhere other than the end.
    const keptAfter = after.filter((i) => beforeById.has(i.id)).map((i) => i.id);
    const keptBefore = before.filter((i) => afterIds.has(i.id)).map((i) => i.id);
    const firstNew = after.findIndex((i) => !beforeById.has(i.id));
    const newOnlyAtEnd = firstNew < 0 || after.slice(firstNew).every((i) => !beforeById.has(i.id));
    const orderChanged = keptAfter.join("\u0000") !== keptBefore.join("\u0000") || !newOnlyAtEnd;
    if (upsert.length === 0 && remove.length === 0 && !orderChanged) continue;
    collections[name] = orderChanged ? { upsert, remove, order: after.map((i) => i.id) } : { upsert, remove };
  }
  return Object.keys(set).length === 0 && Object.keys(collections).length === 0 ? null : { set, collections };
}

function applyCollection<T extends Item>(items: readonly T[], patch: CollectionPatch | undefined): T[] {
  if (!patch) return [...items];
  const removed = new Set(patch.remove);
  const byId = new Map(items.filter((i) => !removed.has(i.id)).map((i) => [i.id, i]));
  for (const item of patch.upsert as readonly T[]) if (!removed.has(item.id)) byId.set(item.id, item);
  if (!patch.order) {
    // Keep local order; new items go at the end.
    const known = items.flatMap((i) => byId.get(i.id) ?? []);
    const added = [...byId.values()].filter((i) => !items.some((x) => x.id === i.id));
    return [...known, ...added];
  }
  const ordered = patch.order.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  // Objects added locally that the sender didn't know about stay at the end.
  const orderIds = new Set(patch.order);
  return [...ordered, ...[...byId.values()].filter((i) => !orderIds.has(i.id))];
}

/** Applies a patch and repairs anything concurrent edits could have broken. */
export function applyPatch(doc: Diagram, patch: DiagramPatch): Diagram {
  const s = patch.set;
  let next: Diagram = { ...doc };
  for (const key of SCALARS) if (key in s) next = { ...next, [key]: s[key] };
  next = {
    ...next,
    nodes: applyCollection(doc.nodes, patch.collections.nodes),
    edges: applyCollection(doc.edges, patch.collections.edges),
    layers: applyCollection(doc.layers, patch.collections.layers),
    comments: applyCollection(doc.comments, patch.collections.comments),
  };
  const ganttTouched =
    COLLECTIONS.some((c) => c.startsWith("gantt.") && c in patch.collections) ||
    GANTT_SCALARS.some((k) => `gantt.${k}` in s);
  if (doc.gantt || ganttTouched) {
    const base: GanttData = doc.gantt ?? {
      sections: [],
      tasks: [],
      scale: "day",
      autoSchedule: true,
      showToday: true,
      showCriticalPath: false,
      calendar: { skipWeekends: false, holidays: [] },
      baseline: null,
    };
    let gantt: GanttData = {
      ...base,
      tasks: applyCollection(base.tasks, patch.collections["gantt.tasks"]),
      sections: applyCollection(base.sections, patch.collections["gantt.sections"]),
    };
    for (const key of GANTT_SCALARS) if (`gantt.${key}` in s) gantt = { ...gantt, [key]: s[`gantt.${key}`] };
    next = { ...next, gantt };
  }
  if (doc.kanban || COLLECTIONS.some((c) => c.startsWith("kanban.") && c in patch.collections)) {
    const base: KanbanData = doc.kanban ?? { columns: [], lanes: [], cards: [] };
    next = {
      ...next,
      kanban: {
        columns: applyCollection(base.columns, patch.collections["kanban.columns"]),
        lanes: applyCollection(base.lanes, patch.collections["kanban.lanes"]),
        cards: applyCollection(base.cards, patch.collections["kanban.cards"]),
      },
    };
  }
  const flowTouched =
    "flowchart.lanes" in patch.collections || FLOWCHART_SCALARS.some((k) => `flowchart.${k}` in s);
  if (doc.flowchart || flowTouched) {
    const base: FlowchartData = doc.flowchart ?? { direction: "TB", laneStart: 0, lanes: [] };
    let flowchart: FlowchartData = {
      ...base,
      lanes: applyCollection(base.lanes, patch.collections["flowchart.lanes"]),
    };
    for (const key of FLOWCHART_SCALARS)
      if (`flowchart.${key}` in s) flowchart = { ...flowchart, [key]: s[`flowchart.${key}`] };
    next = { ...next, flowchart };
  }
  if (doc.network || COLLECTIONS.some((c) => c.startsWith("network.") && c in patch.collections)) {
    const base: NetworkData = doc.network ?? { entities: [], links: [] };
    next = {
      ...next,
      network: {
        entities: applyCollection(base.entities, patch.collections["network.entities"]),
        links: applyCollection(base.links, patch.collections["network.links"]),
      },
    };
  }
  return repair(next);
}

/** Drops references to deleted objects and dependency cycles, so the result always validates. */
export function repair(d: Diagram): Diagram {
  const layers =
    d.layers.length > 0 ? d.layers : [{ id: "layer-1", name: "Layer 1", visible: true, locked: false }];
  const layerIds = new Set(layers.map((l) => l.id));
  const fallbackLayer = layers[0]?.id ?? "layer-1";
  const nodes = d.nodes.map((n) => (layerIds.has(n.layerId) ? n : { ...n, layerId: fallbackLayer }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = d.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  let gantt = d.gantt;
  if (gantt) {
    const sectionIds = new Set(gantt.sections.map((s) => s.id));
    const taskIds = new Set(gantt.tasks.map((t) => t.id));
    const accepted = new Map<string, GanttDependency[]>();
    const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
      if (from === to) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (accepted.get(from) ?? []).some((dep) => reaches(dep.taskId, to, seen));
    };
    const tasks = gantt.tasks.map((t) => {
      const deps: GanttDependency[] = [];
      accepted.set(t.id, deps);
      for (const dep of t.dependencies) {
        if (
          taskIds.has(dep.taskId) &&
          dep.taskId !== t.id &&
          !deps.some((x) => x.taskId === dep.taskId) &&
          !reaches(dep.taskId, t.id)
        )
          deps.push(dep);
      }
      return {
        ...t,
        sectionId: t.sectionId !== null && !sectionIds.has(t.sectionId) ? null : t.sectionId,
        dependencies: deps,
      };
    });
    gantt = { ...gantt, tasks };
  }
  let kanban = d.kanban;
  if (kanban) {
    // A card whose column was deleted concurrently moves to the first column; one whose
    // lane was deleted leaves the lanes.
    const firstColumn = kanban.columns[0]?.id;
    const columnIds = new Set(kanban.columns.map((c) => c.id));
    const laneIds = new Set(kanban.lanes.map((l) => l.id));
    const cards = kanban.cards.flatMap((c) => {
      const columnId = columnIds.has(c.columnId) ? c.columnId : firstColumn;
      if (!columnId) return [];
      const laneId = c.laneId !== null && !laneIds.has(c.laneId) ? null : c.laneId;
      return columnId === c.columnId && laneId === c.laneId ? [c] : [{ ...c, columnId, laneId }];
    });
    kanban = { ...kanban, cards };
  }
  // Details of entities or links deleted concurrently go with them.
  const edgeIds = new Set(edges.map((e) => e.id));
  const network = d.network && {
    entities: d.network.entities.filter((e) => nodeIds.has(e.id)),
    links: d.network.links.filter((l) => edgeIds.has(l.id)),
  };
  return {
    ...d,
    layers,
    nodes,
    edges,
    ...(gantt ? { gantt } : {}),
    ...(kanban ? { kanban } : {}),
    ...(network ? { network } : {}),
  };
}

/** Validates an incoming full document. */
export function acceptSnapshot(input: unknown): Diagram | null {
  const parsed = parseDiagram(input);
  return parsed.ok ? parsed.value : null;
}
