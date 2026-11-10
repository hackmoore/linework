import { useSyncExternalStore } from "react";

/** The name and colour shown on comments and to collaborators. Kept in this browser only. */

const NAME_KEY = "linework.displayName";
const COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function getDisplayName(): string {
  return read() || "Anonymous";
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 100));
  } catch {
    // Storage blocked: the name lasts for this page only.
  }
  for (const listener of listeners) listener();
}

/** Asks for a name the first time one is needed. Returns null if the user cancels. */
export function ensureDisplayName(): string | null {
  const existing = read();
  if (existing) return existing;
  const name = window.prompt("Your name (shown on comments and to collaborators)", "");
  if (name === null) return null;
  setDisplayName(name || "Anonymous");
  return getDisplayName();
}

export function useDisplayName(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getDisplayName,
    getDisplayName,
  );
}

/** Stable colour for a name or client id. */
export function colorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length] ?? "#2563eb";
}
