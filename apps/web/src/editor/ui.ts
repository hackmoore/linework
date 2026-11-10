import { create } from "zustand";

/** Editor chrome state that isn't part of the document and isn't undoable. */
export type SidePanel = "properties" | "comments";
export type Dialog = "history" | "ai" | "share" | "mermaid" | null;

const GRID_KEY = "linework.showGrid";

/** The dotted canvas background, remembered per browser. */
function loadShowGrid(): boolean {
  try {
    return localStorage.getItem(GRID_KEY) !== "false";
  } catch {
    return true;
  }
}

interface UiState {
  readonly libraryOpen: boolean;
  readonly showGrid: boolean;
  readonly setShowGrid: (show: boolean) => void;
  readonly presenting: boolean;
  readonly sidePanel: SidePanel;
  readonly dialog: Dialog;
  readonly focusedCommentId: string | null;
  readonly focusComment: (id: string | null) => void;
  readonly setLibraryOpen: (open: boolean) => void;
  readonly setPresenting: (presenting: boolean) => void;
  readonly setSidePanel: (panel: SidePanel) => void;
  readonly openDialog: (dialog: Dialog) => void;
}

export const useUi = create<UiState>()((set) => ({
  libraryOpen: false,
  showGrid: loadShowGrid(),
  setShowGrid: (showGrid) => {
    try {
      localStorage.setItem(GRID_KEY, String(showGrid));
    } catch {
      // Private browsing: still works for this visit.
    }
    set({ showGrid });
  },
  presenting: false,
  sidePanel: "properties",
  dialog: null,
  focusedCommentId: null,
  focusComment: (focusedCommentId) => {
    set({ focusedCommentId, sidePanel: focusedCommentId ? "comments" : "properties" });
  },
  setLibraryOpen: (libraryOpen) => {
    set({ libraryOpen });
  },
  setPresenting: (presenting) => {
    set({ presenting });
  },
  setSidePanel: (sidePanel) => {
    set({ sidePanel });
  },
  openDialog: (dialog) => {
    set({ dialog });
  },
}));
