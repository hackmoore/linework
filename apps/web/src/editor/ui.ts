import { create } from "zustand";

/** Editor chrome state that isn't part of the document and isn't undoable. */
export type SidePanel = "properties" | "comments";
export type Dialog = "history" | "ai" | "share" | "mermaid" | null;

interface UiState {
  readonly libraryOpen: boolean;
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
