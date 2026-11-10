import type { DiagramLayer } from "@linework/shared";
import { createLayer } from "../diagram/factory";
import { useEditor } from "./store";

/** Layer actions. Layers are listed bottom to top in the document. */

export function addLayer(): string {
  const state = useEditor.getState();
  const count = state.diagram?.layers.length ?? 0;
  const layer = createLayer(`Layer ${String(count + 1)}`);
  state.commit((d) => ({ ...d, layers: [...d.layers, layer] }));
  state.setActiveLayer(layer.id);
  return layer.id;
}

export function updateLayer(id: string, patch: Partial<Omit<DiagramLayer, "id">>): void {
  useEditor
    .getState()
    .commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
}

/** Moves a layer up (towards the front) or down. */
export function moveLayer(id: string, direction: 1 | -1): void {
  useEditor.getState().commit((d) => {
    const index = d.layers.findIndex((l) => l.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= d.layers.length) return d;
    const layers = [...d.layers];
    const [moved] = layers.splice(index, 1);
    if (moved) layers.splice(target, 0, moved);
    return { ...d, layers };
  });
}

/** Deletes a layer and its shapes (and their connectors). The last layer can't be deleted. */
export function deleteLayer(id: string): void {
  const state = useEditor.getState();
  state.commit((d) => {
    if (d.layers.length <= 1) return d;
    const removed = new Set(d.nodes.filter((n) => n.layerId === id).map((n) => n.id));
    return {
      ...d,
      layers: d.layers.filter((l) => l.id !== id),
      nodes: d.nodes.filter((n) => !removed.has(n.id)),
      edges: d.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
      comments: d.comments.filter((c) => c.targetId === null || !removed.has(c.targetId)),
    };
  });
  if (state.activeLayerId === id) {
    const top = useEditor.getState().diagram?.layers.at(-1);
    if (top) state.setActiveLayer(top.id);
  }
}

export function moveSelectionToLayer(layerId: string): void {
  const state = useEditor.getState();
  const ids = new Set(state.selection.nodeIds);
  if (ids.size === 0) return;
  state.commit((d) => ({ ...d, nodes: d.nodes.map((n) => (ids.has(n.id) ? { ...n, layerId } : n)) }));
}
