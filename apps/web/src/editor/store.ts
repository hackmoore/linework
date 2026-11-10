import { create } from "zustand";
import type { Diagram, DiagramEdge, DiagramNode, ShapeKind } from "@linework/shared";
import { createEdge, createId, createNode } from "../diagram/factory";
import { withoutTasks } from "../gantt/model";
import { withoutCards } from "../kanban/model";
import { flowEdgeDefaults, flowNodeStyle } from "../flowchart/model";
import { pruneNetwork } from "../network/model";
import { withoutItems } from "../roadmap/model";
import { fitAllCompartments } from "../render/compartments";
import { rectsIntersect, type Rect } from "../render/geometry";

export type Tool = "select" | "connect" | ShapeKind;

export interface Viewport {
  /** Diagram coordinate shown at the canvas's top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Selection {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  /** Selected gantt tasks and milestones, or roadmap items. */
  readonly taskIds: readonly string[];
  /** Selected kanban cards. */
  readonly cardIds: readonly string[];
}

const EMPTY_SELECTION: Selection = { nodeIds: [], edgeIds: [], taskIds: [], cardIds: [] };
const HISTORY_LIMIT = 100;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

type Recipe = (diagram: Diagram) => Diagram;

export interface EditorState {
  readonly diagram: Diagram | null;
  readonly past: readonly Diagram[];
  readonly future: readonly Diagram[];
  readonly selection: Selection;
  readonly tool: Tool;
  readonly viewport: Viewport;
  readonly editingNodeId: string | null;
  readonly editingEdgeId: string | null;
  /** Layer new shapes are added to. */
  readonly activeLayerId: string | null;

  readonly load: (diagram: Diagram) => void;
  /** Applies a change as one undoable step. */
  readonly commit: (recipe: Recipe) => void;
  /** Records the current document as an undo point before a series of transient updates (e.g. a drag). */
  readonly checkpoint: () => void;
  /** Applies a change without recording history; pair with checkpoint(). */
  readonly transient: (recipe: Recipe) => void;
  readonly undo: () => void;
  /**
   * Applies a collaborator's change without adding an undo step. The change is also applied
   * to undo/redo history so undoing a local edit doesn't revert someone else's work.
   * With `replace`, the result becomes the only state (used for full snapshots).
   */
  readonly applyRemote: (transform: Recipe, replace?: boolean) => void;
  readonly redo: () => void;

  readonly setTool: (tool: Tool) => void;
  readonly setViewport: (viewport: Viewport) => void;
  readonly select: (selection: Partial<Selection>) => void;
  readonly clearSelection: () => void;
  readonly selectAll: () => void;
  readonly selectInRect: (rect: Rect, additive: boolean) => void;
  readonly startEditing: (target: { nodeId: string } | { edgeId: string } | null) => void;

  readonly addNode: (
    kind: ShapeKind,
    cx: number,
    cy: number,
    overrides?: Partial<Omit<DiagramNode, "kind">>,
  ) => string;
  readonly connect: (source: string, target: string) => string | null;
  readonly updateNodes: (ids: readonly string[], patch: Partial<Omit<DiagramNode, "id">>) => void;
  readonly updateEdges: (
    ids: readonly string[],
    patch: Partial<Omit<DiagramEdge, "id" | "source" | "target">>,
  ) => void;
  readonly deleteSelection: () => void;
  readonly duplicateSelection: () => void;
  readonly nudgeSelection: (dx: number, dy: number) => void;
  readonly reorderSelection: (direction: "front" | "back") => void;
  readonly setTitle: (title: string) => void;
  readonly setStyle: (styleId: string) => void;
  readonly setBackground: (background: string) => void;
  readonly setActiveLayer: (layerId: string) => void;
}

/** Layers whose shapes can be selected and edited: visible and unlocked. */
export function editableLayerIds(diagram: Diagram): Set<string> {
  return new Set(diagram.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
}

/** The active layer if it can take new shapes, else the top editable layer, else the top layer. */
export function usableLayerId(diagram: Diagram, preferred: string | null): string | undefined {
  const editable = editableLayerIds(diagram);
  if (preferred && editable.has(preferred)) return preferred;
  return diagram.layers.findLast((l) => editable.has(l.id))?.id ?? diagram.layers.at(-1)?.id;
}

function touch(diagram: Diagram): Diagram {
  return { ...diagram, updatedAt: new Date().toISOString() };
}

/** Drops selection ids that no longer exist after undo/redo or deletion. */
function pruneSelection(selection: Selection, diagram: Diagram): Selection {
  const editable = editableLayerIds(diagram);
  const nodeIds = new Set(diagram.nodes.filter((n) => editable.has(n.layerId)).map((n) => n.id));
  const edgeIds = new Set(diagram.edges.map((e) => e.id));
  const taskIds = new Set([
    ...(diagram.gantt?.tasks.map((t) => t.id) ?? []),
    ...(diagram.roadmap?.items.map((i) => i.id) ?? []),
  ]);
  const cardIds = new Set(diagram.kanban?.cards.map((c) => c.id));
  return {
    nodeIds: selection.nodeIds.filter((id) => nodeIds.has(id)),
    edgeIds: selection.edgeIds.filter((id) => edgeIds.has(id)),
    taskIds: selection.taskIds.filter((id) => taskIds.has(id)),
    cardIds: selection.cardIds.filter((id) => cardIds.has(id)),
  };
}

export const useEditor = create<EditorState>()((set, get) => ({
  diagram: null,
  past: [],
  future: [],
  selection: EMPTY_SELECTION,
  tool: "select",
  viewport: { x: 0, y: 0, zoom: 1 },
  editingNodeId: null,
  editingEdgeId: null,
  activeLayerId: null,

  load(diagram) {
    set({
      diagram,
      past: [],
      future: [],
      selection: EMPTY_SELECTION,
      tool: "select",
      editingNodeId: null,
      editingEdgeId: null,
      activeLayerId:
        diagram.layers.findLast((l) => l.visible && !l.locked)?.id ?? diagram.layers[0]?.id ?? null,
    });
  },

  commit(recipe) {
    const { diagram, past, selection } = get();
    if (!diagram) return;
    const recipeResult = recipe(diagram);
    if (recipeResult === diagram) return;
    // Table and class shapes always fit their label.
    const next = fitAllCompartments(recipeResult);
    set({
      diagram: touch(next),
      past: [...past, diagram].slice(-HISTORY_LIMIT),
      future: [],
      // Hiding or locking a layer, or deleting things, drops them from the selection.
      selection: pruneSelection(selection, next),
    });
  },

  checkpoint() {
    const { diagram, past } = get();
    if (!diagram) return;
    set({ past: [...past, diagram].slice(-HISTORY_LIMIT), future: [] });
  },

  transient(recipe) {
    const { diagram } = get();
    if (!diagram) return;
    const next = recipe(diagram);
    if (next !== diagram) set({ diagram: touch(fitAllCompartments(next)) });
  },

  applyRemote(transform, replace = false) {
    const { diagram, past, future, selection } = get();
    if (!diagram) return;
    const next = transform(diagram);
    if (next === diagram) return;
    set({
      diagram: next,
      past: replace ? [] : past.map(transform),
      future: replace ? [] : future.map(transform),
      selection: pruneSelection(selection, next),
    });
  },

  undo() {
    const { diagram, past, future, selection } = get();
    const previous = past[past.length - 1];
    if (!diagram || !previous) return;
    set({
      diagram: previous,
      past: past.slice(0, -1),
      future: [diagram, ...future],
      selection: pruneSelection(selection, previous),
      editingNodeId: null,
      editingEdgeId: null,
    });
  },

  redo() {
    const { diagram, past, future, selection } = get();
    const next = future[0];
    if (!diagram || !next) return;
    set({
      diagram: next,
      past: [...past, diagram],
      future: future.slice(1),
      selection: pruneSelection(selection, next),
      editingNodeId: null,
      editingEdgeId: null,
    });
  },

  setTool(tool) {
    set({ tool });
  },

  setViewport(viewport) {
    set({ viewport: { ...viewport, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom)) } });
  },

  select(selection) {
    set({ selection: { ...EMPTY_SELECTION, ...selection } });
  },

  clearSelection() {
    set({ selection: EMPTY_SELECTION });
  },

  selectAll() {
    const { diagram } = get();
    if (!diagram) return;
    const editable = editableLayerIds(diagram);
    set({
      selection: {
        nodeIds: diagram.nodes.filter((n) => editable.has(n.layerId)).map((n) => n.id),
        edgeIds: diagram.edges.map((e) => e.id),
        taskIds: diagram.gantt?.tasks.map((t) => t.id) ?? diagram.roadmap?.items.map((i) => i.id) ?? [],
        cardIds: diagram.kanban?.cards.map((c) => c.id) ?? [],
      },
    });
  },

  selectInRect(rect, additive) {
    const { diagram, selection } = get();
    if (!diagram) return;
    const editable = editableLayerIds(diagram);
    const hits = diagram.nodes
      .filter((n) => editable.has(n.layerId) && rectsIntersect(rect, n))
      .map((n) => n.id);
    const nodeIds = additive ? [...new Set([...selection.nodeIds, ...hits])] : hits;
    set({ selection: { nodeIds, edgeIds: additive ? selection.edgeIds : [], taskIds: [], cardIds: [] } });
  },

  startEditing(target) {
    if (!target) set({ editingNodeId: null, editingEdgeId: null });
    else if ("nodeId" in target) set({ editingNodeId: target.nodeId, editingEdgeId: null });
    else set({ editingNodeId: null, editingEdgeId: target.edgeId });
  },

  addNode(kind, cx, cy, overrides = {}) {
    const { diagram, activeLayerId } = get();
    const layerId = diagram ? usableLayerId(diagram, activeLayerId) : undefined;
    const flowStyle = diagram?.chartType === "flowchart" ? flowNodeStyle(kind) : {};
    const node = createNode(kind, cx, cy, { ...flowStyle, ...(layerId ? { layerId } : {}), ...overrides });
    get().commit((d) => ({ ...d, nodes: [...d.nodes, node] }));
    set({ selection: { ...EMPTY_SELECTION, nodeIds: [node.id] } });
    return node.id;
  },

  connect(source, target) {
    const { diagram } = get();
    if (!diagram || source === target) return null;
    const ids = new Set(diagram.nodes.map((n) => n.id));
    if (!ids.has(source) || !ids.has(target)) return null;
    const edge = createEdge(
      source,
      target,
      diagram.chartType === "flowchart"
        ? flowEdgeDefaults(diagram, source)
        : diagram.chartType === "network"
          ? { arrowEnd: "none" }
          : {},
    );
    get().commit((d) => ({ ...d, edges: [...d.edges, edge] }));
    set({ selection: { ...EMPTY_SELECTION, edgeIds: [edge.id] } });
    return edge.id;
  },

  updateNodes(ids, patch) {
    if (ids.length === 0) return;
    const wanted = new Set(ids);
    get().commit((d) => ({ ...d, nodes: d.nodes.map((n) => (wanted.has(n.id) ? { ...n, ...patch } : n)) }));
  },

  updateEdges(ids, patch) {
    if (ids.length === 0) return;
    const wanted = new Set(ids);
    get().commit((d) => ({ ...d, edges: d.edges.map((e) => (wanted.has(e.id) ? { ...e, ...patch } : e)) }));
  },

  deleteSelection() {
    const { selection } = get();
    if (
      selection.nodeIds.length === 0 &&
      selection.edgeIds.length === 0 &&
      selection.taskIds.length === 0 &&
      selection.cardIds.length === 0
    )
      return;
    const nodeIds = new Set(selection.nodeIds);
    const edgeIds = new Set(selection.edgeIds);
    const taskIds = new Set(selection.taskIds);
    const cardIds = new Set(selection.cardIds);
    get().commit((d) =>
      pruneNetwork({
        ...d,
        // Dependencies on deleted tasks go too, so the plan stays valid.
        gantt: d.gantt && withoutTasks(d.gantt, taskIds),
        kanban: d.kanban && withoutCards(d.kanban, cardIds),
        roadmap: d.roadmap && withoutItems(d.roadmap, taskIds),
        // Comments about deleted objects go with them.
        comments: d.comments.filter(
          (c) =>
            c.targetId === null ||
            (!nodeIds.has(c.targetId) && !taskIds.has(c.targetId) && !cardIds.has(c.targetId)),
        ),
        nodes: d.nodes.filter((n) => !nodeIds.has(n.id)),
        // Edges attached to deleted nodes go too, so the document stays valid.
        edges: d.edges.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
      }),
    );
    set({ selection: EMPTY_SELECTION, editingNodeId: null, editingEdgeId: null });
  },

  duplicateSelection() {
    const { selection, diagram } = get();
    if (!diagram || selection.nodeIds.length === 0) return;
    const offset = 24;
    const idMap = new Map<string, string>();
    const selected = new Set(selection.nodeIds);
    const nodes = diagram.nodes
      .filter((n) => selected.has(n.id))
      .map((n) => {
        const id = createId();
        idMap.set(n.id, id);
        return { ...n, id, x: n.x + offset, y: n.y + offset };
      });
    // Copy edges whose both ends were duplicated.
    const edges = diagram.edges.flatMap((e) => {
      const source = idMap.get(e.source);
      const target = idMap.get(e.target);
      return source && target ? [{ ...e, id: createId(), source, target }] : [];
    });
    get().commit((d) => ({ ...d, nodes: [...d.nodes, ...nodes], edges: [...d.edges, ...edges] }));
    set({
      selection: { ...EMPTY_SELECTION, nodeIds: nodes.map((n) => n.id), edgeIds: edges.map((e) => e.id) },
    });
  },

  nudgeSelection(dx, dy) {
    const { selection } = get();
    const ids = new Set(selection.nodeIds);
    if (ids.size === 0) return;
    get().commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    }));
  },

  reorderSelection(direction) {
    const ids = new Set(get().selection.nodeIds);
    if (ids.size === 0) return;
    get().commit((d) => {
      const picked = d.nodes.filter((n) => ids.has(n.id));
      const rest = d.nodes.filter((n) => !ids.has(n.id));
      return { ...d, nodes: direction === "front" ? [...rest, ...picked] : [...picked, ...rest] };
    });
  },

  setTitle(title) {
    get().commit((d) => (d.title === title ? d : { ...d, title }));
  },

  setStyle(styleId) {
    get().commit((d) => (d.styleId === styleId ? d : { ...d, styleId }));
  },

  setActiveLayer(layerId) {
    set({ activeLayerId: layerId });
  },

  setBackground(background) {
    get().commit((d) => (d.background === background ? d : { ...d, background }));
  },
}));
