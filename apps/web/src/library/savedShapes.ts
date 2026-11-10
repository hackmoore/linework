import { useSyncExternalStore } from "react";
import { z } from "zod";
import { edgeSchema, nodeSchema } from "@linework/shared";
import { createId } from "../diagram/factory";
import type { ShapeSnippet } from "../editor/clipboard";

/** The user's own reusable shapes ("My shapes"), kept in this browser. */

const STORAGE_KEY = "linework.library.v1";
const MAX_ITEMS = 200;

const savedShapeSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  nodes: z.array(nodeSchema).min(1).max(500),
  edges: z.array(edgeSchema).max(1_000),
});
export type SavedShape = z.infer<typeof savedShapeSchema>;

let cache: SavedShape[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedShape[] {
  if (cache) return cache;
  try {
    const parsed = z.array(savedShapeSchema).safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    cache = parsed.success ? parsed.data : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: SavedShape[]): void {
  cache = items;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: keep the in-memory copy for this session.
  }
  for (const listener of listeners) listener();
}

export function saveShape(name: string, snippet: ShapeSnippet): void {
  write(
    [
      { id: createId(), name: name.slice(0, 100), nodes: [...snippet.nodes], edges: [...snippet.edges] },
      ...read(),
    ].slice(0, MAX_ITEMS),
  );
}

export function deleteSavedShape(id: string): void {
  write(read().filter((s) => s.id !== id));
}

export function useSavedShapes(): readonly SavedShape[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    read,
  );
}
