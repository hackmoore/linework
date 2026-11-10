import { useEffect } from "react";
import { copySelection, cutSelection, paste } from "./clipboard";
import { useEditor } from "./store";
import { useUi } from "./ui";
import { TOOLS } from "./ToolPalette";
import { fitToContent, zoomBy } from "./viewport";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Global editor keyboard shortcuts. Ignored while typing in a form field. */
export function useShortcuts(getCanvasSize: () => { width: number; height: number }): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event.target)) return;
      const state = useEditor.getState();
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // Gantt charts and kanban boards only share undo/redo, select all and delete; the rest
      // is canvas-specific.
      if (state.diagram && state.diagram.chartType !== "freeform") {
        if (mod && key === "z" && !event.shiftKey) state.undo();
        else if (mod && ((key === "z" && event.shiftKey) || key === "y")) state.redo();
        else if (mod && key === "a") state.selectAll();
        else if (!mod && (key === "delete" || key === "backspace")) state.deleteSelection();
        else if (key === "escape") state.clearSelection();
        else if (!mod && !event.altKey && key === "p") useUi.getState().setPresenting(true);
        else return;
        event.preventDefault();
        return;
      }

      if (mod) {
        if (key === "c") void copySelection();
        else if (key === "x") void cutSelection();
        else if (key === "v") {
          const { width, height } = getCanvasSize();
          const vp = state.viewport;
          void paste({ x: vp.x + width / 2 / vp.zoom, y: vp.y + height / 2 / vp.zoom });
        } else if (key === "z" && !event.shiftKey) state.undo();
        else if ((key === "z" && event.shiftKey) || key === "y") state.redo();
        else if (key === "a") state.selectAll();
        else if (key === "d") state.duplicateSelection();
        else if (key === "0") fitToContent(getCanvasSize());
        else if (key === "=" || key === "+") zoomBy(1.2, getCanvasSize());
        else if (key === "-") zoomBy(1 / 1.2, getCanvasSize());
        else return;
        event.preventDefault();
        return;
      }

      if (key === "delete" || key === "backspace") {
        state.deleteSelection();
      } else if (key === "escape") {
        state.clearSelection();
        state.setTool("select");
      } else if (key === "enter") {
        const only = state.selection.nodeIds.length === 1 ? state.selection.nodeIds[0] : undefined;
        if (only) state.startEditing({ nodeId: only });
        else return;
      } else if (key.startsWith("arrow")) {
        const step = event.shiftKey ? 10 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        state.nudgeSelection(dx, dy);
      } else if (event.altKey || event.shiftKey) {
        return;
      } else if (key === "l") {
        useUi.getState().setLibraryOpen(!useUi.getState().libraryOpen);
      } else if (key === "p") {
        useUi.getState().setPresenting(true);
      } else {
        const def = TOOLS.find((t) => t.shortcut.toLowerCase() === key);
        if (!def) return;
        state.setTool(def.tool);
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [getCanvasSize]);
}
