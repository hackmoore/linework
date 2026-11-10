import { z } from "zod";
import { edgeSchema, nodeSchema, type DiagramEdge, type DiagramNode } from "@linework/shared";
import { createId } from "../diagram/factory";
import { boundsOf, center } from "../render/geometry";
import { useEditor, usableLayerId } from "./store";

const CLIPBOARD_TYPE = "linework/shapes";
const PASTE_OFFSET = 24;

const payloadSchema = z.object({
  type: z.literal(CLIPBOARD_TYPE),
  nodes: z.array(nodeSchema).max(5_000),
  edges: z.array(edgeSchema).max(10_000),
});

export interface ShapeSnippet {
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

// Fallback when the system clipboard is unavailable or denied.
let memoryClipboard: ShapeSnippet | null = null;
let pasteCount = 0;

/** The selected shapes plus connectors whose both ends are selected. */
export function selectedSnippet(): ShapeSnippet | null {
  const { diagram, selection } = useEditor.getState();
  if (!diagram || selection.nodeIds.length === 0) return null;
  const ids = new Set(selection.nodeIds);
  return {
    nodes: diagram.nodes.filter((n) => ids.has(n.id)),
    edges: diagram.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

export async function copySelection(): Promise<boolean> {
  const snippet = selectedSnippet();
  if (!snippet) return false;
  memoryClipboard = snippet;
  pasteCount = 0;
  try {
    await navigator.clipboard.writeText(JSON.stringify({ type: CLIPBOARD_TYPE, ...snippet }));
  } catch {
    // Clipboard permission denied: in-app paste still works from memory.
  }
  return true;
}

export async function cutSelection(): Promise<void> {
  if (await copySelection()) useEditor.getState().deleteSelection();
}

/** Parses clipboard text: Linework shapes, or null. */
export function parseSnippet(text: string): ShapeSnippet | null {
  try {
    const result = payloadSchema.safeParse(JSON.parse(text));
    return result.success ? { nodes: result.data.nodes, edges: result.data.edges } : null;
  } catch {
    return null;
  }
}

/**
 * Inserts a snippet with fresh ids on the active layer. With `at`, the snippet is centred
 * there; otherwise it is offset from its original position so repeated pastes cascade.
 */
export function insertSnippet(snippet: ShapeSnippet, at?: { x: number; y: number }): void {
  const state = useEditor.getState();
  const diagram = state.diagram;
  if (!diagram || snippet.nodes.length === 0) return;
  const layerId = usableLayerId(diagram, state.activeLayerId);
  const bounds = boundsOf(snippet.nodes);
  let dx = PASTE_OFFSET * pasteCount;
  let dy = PASTE_OFFSET * pasteCount;
  if (at && bounds) {
    const c = center(bounds);
    dx = Math.round(at.x - c.x);
    dy = Math.round(at.y - c.y);
  }
  const idMap = new Map<string, string>();
  const nodes = snippet.nodes.map((n) => {
    const id = createId();
    idMap.set(n.id, id);
    return { ...n, id, x: n.x + dx, y: n.y + dy, layerId: layerId ?? n.layerId };
  });
  const edges = snippet.edges.flatMap((e) => {
    const source = idMap.get(e.source);
    const target = idMap.get(e.target);
    return source && target ? [{ ...e, id: createId(), source, target }] : [];
  });
  state.commit((d) => ({ ...d, nodes: [...d.nodes, ...nodes], edges: [...d.edges, ...edges] }));
  state.select({ nodeIds: nodes.map((n) => n.id), edgeIds: edges.map((e) => e.id) });
}

/** Pastes Linework shapes, or plain text as a text shape at `textAt`. */
export async function paste(textAt: { x: number; y: number }): Promise<void> {
  let text: string | null;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    text = null;
  }
  const fromSystem = text ? parseSnippet(text) : null;
  if (fromSystem) {
    pasteCount += 1;
    insertSnippet(fromSystem);
    return;
  }
  if (text?.trim()) {
    const id = useEditor
      .getState()
      .addNode("text", textAt.x, textAt.y, { label: text.trim().slice(0, 5_000) });
    useEditor.getState().select({ nodeIds: [id] });
    return;
  }
  if (memoryClipboard) {
    pasteCount += 1;
    insertSnippet(memoryClipboard);
  }
}
