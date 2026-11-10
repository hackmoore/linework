import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router";
import { Logo } from "../components/Logo";
import { getDiagram, maybeAutoVersion, saveDiagram } from "../storage/localStore";
import { GanttEditor } from "../gantt/GanttEditor";
import { GanttInspector } from "../gantt/GanttInspector";
import { KanbanEditor } from "../kanban/KanbanEditor";
import { KanbanInspector } from "../kanban/KanbanInspector";
import { Canvas } from "./Canvas";
import { ExportMenu } from "./ExportMenu";
import { LiveControls } from "../collab/LiveControls";
import { parseRoomSecret } from "../collab/crypto";
import { startSession, stopSession } from "../collab/session";
import { Inspector } from "./Inspector";
import { SidePanel } from "./SidePanel";
import { HistoryDialog } from "./HistoryDialog";
import { useEditor } from "./store";
import { ToolPalette } from "./ToolPalette";
import { Presentation } from "./Presentation";
import { useUi } from "./ui";
import { LibraryPanel, placeLibraryItem } from "../library/LibraryPanel";
import { useSavedShapes } from "../library/savedShapes";
import { useShortcuts } from "./useShortcuts";
import { fitToContent, zoomBy } from "./viewport";

const AUTOSAVE_DELAY_MS = 400;

type LoadState = { status: "loading" } | { status: "ready" } | { status: "missing" };
type SaveState = "saved" | "saving" | "error";

export function EditorPage(): ReactElement {
  const { id } = useParams();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const canvasHost = useRef<HTMLDivElement>(null);
  const chartType = useEditor((s) => s.diagram?.chartType);
  const libraryOpen = useUi((s) => s.libraryOpen);
  const presenting = useUi((s) => s.presenting);
  const dialog = useUi((s) => s.dialog);
  const { setLibraryOpen, setPresenting } = useUi.getState();
  // Only subscribe to the whole document while presenting.
  const diagram = useEditor((s) => (presenting ? s.diagram : null));
  const savedShapes = useSavedShapes();

  const getCanvasSize = useCallback(() => {
    const rect = canvasHost.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  useShortcuts(getCanvasSize);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getDiagram(id).then((diagram) => {
      if (cancelled) return;
      if (!diagram) {
        setLoad({ status: "missing" });
        return;
      }
      useEditor.getState().load(diagram);
      setLoad({ status: "ready" });
      // A live link (#room=...&key=...) connects this document to the session.
      const secret = parseRoomSecret(window.location.hash);
      if (secret) {
        void startSession(secret, false).then((session) => {
          session.attach();
        });
      }
      requestAnimationFrame(() => {
        fitToContent(getCanvasSize());
      });
    });
    return () => {
      cancelled = true;
    };
  }, [id, getCanvasSize]);

  // Leaving the editor ends any live session.
  useEffect(() => stopSession, []);

  // Debounced autosave whenever the document object changes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSaved = useEditor.getState().diagram;
    const unsubscribe = useEditor.subscribe((state) => {
      const diagram = state.diagram;
      if (!diagram || diagram === lastSaved) return;
      setSaveState("saving");
      clearTimeout(timer);
      timer = setTimeout(() => {
        lastSaved = diagram;
        saveDiagram(diagram).then(
          () => {
            if (useEditor.getState().diagram === diagram) setSaveState("saved");
            // Automatic version history; failures here never block saving.
            maybeAutoVersion(diagram).catch(() => undefined);
          },
          () => {
            setSaveState("error");
          },
        );
      }, AUTOSAVE_DELAY_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
      // Flush a pending change when leaving the editor.
      const pending = useEditor.getState().diagram;
      if (pending && pending !== lastSaved) void saveDiagram(pending);
    };
  }, []);

  if (load.status === "missing") {
    return (
      <div className="editor-message">
        <h1>Diagram not found</h1>
        <p>It may have been deleted, or it was saved in a different browser.</p>
        <div className="editor-message__actions">
          <Link to="/diagrams" className="btn">
            My diagrams
          </Link>
          <Link to="/new" className="btn btn--primary">
            New diagram
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <EditorHeader saveState={saveState} />
      {load.status !== "ready" ? (
        <p className="editor__loading">Loading...</p>
      ) : chartType === "gantt" ? (
        <div className="editor__body">
          <GanttEditor />
          <SidePanel newCommentPoint={() => ({ x: 0, y: 0 })}>
            <GanttInspector />
          </SidePanel>
        </div>
      ) : chartType === "kanban" ? (
        <div className="editor__body">
          <KanbanEditor />
          <SidePanel newCommentPoint={() => ({ x: 0, y: 0 })}>
            <KanbanInspector />
          </SidePanel>
        </div>
      ) : (
        <div className="editor__body">
          <ToolPalette
            canvasCentre={() => {
              const { width, height } = getCanvasSize();
              const vp = useEditor.getState().viewport;
              return { x: vp.x + width / 2 / vp.zoom, y: vp.y + height / 2 / vp.zoom };
            }}
          />
          {libraryOpen && (
            <LibraryPanel
              onClose={() => {
                setLibraryOpen(false);
              }}
              onPlace={(item) => {
                const { width, height } = getCanvasSize();
                const vp = useEditor.getState().viewport;
                placeLibraryItem(
                  item,
                  { x: vp.x + width / 2 / vp.zoom, y: vp.y + height / 2 / vp.zoom },
                  savedShapes,
                );
              }}
            />
          )}
          <div className="editor__canvas" ref={canvasHost}>
            <Canvas />
            <ZoomControls getCanvasSize={getCanvasSize} />
          </div>
          <SidePanel
            newCommentPoint={() => {
              const { width, height } = getCanvasSize();
              const vp = useEditor.getState().viewport;
              return { x: vp.x + width / 2 / vp.zoom, y: vp.y + height / 2 / vp.zoom };
            }}
          >
            <Inspector />
          </SidePanel>
        </div>
      )}
      {dialog === "history" && (
        <HistoryDialog
          onClose={() => {
            useUi.getState().openDialog(null);
          }}
        />
      )}
      {presenting && diagram && (
        <Presentation
          diagram={diagram}
          onExit={() => {
            setPresenting(false);
          }}
        />
      )}
    </div>
  );
}

function EditorHeader({ saveState }: { saveState: SaveState }): ReactElement {
  const title = useEditor((s) => s.diagram?.title ?? "");
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { undo, redo, setTitle } = useEditor.getState();
  useEffect(() => {
    document.title = title ? `${title} - Linework` : "Linework";
  }, [title]);

  return (
    <header className="editor__header">
      <Link to="/diagrams" className="editor__brand" aria-label="My diagrams">
        <Logo size={26} withWordmark={false} />
      </Link>
      {/* Keyed by title so undo/redo resets the draft. */}
      <TitleInput key={title} title={title} onCommit={setTitle} />
      <span className={`save-status save-status--${saveState}`} role="status">
        {saveState === "saved" ? "Saved locally" : saveState === "saving" ? "Saving..." : "Save failed"}
      </span>
      <div className="editor__header-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          title="Version history"
          onClick={() => {
            useUi.getState().openDialog("history");
          }}
        >
          History
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          title="Present full screen (P)"
          onClick={() => {
            useUi.getState().setPresenting(true);
          }}
        >
          Present
        </button>
        <LiveControls />
        <ExportMenu />
      </div>
    </header>
  );
}

function TitleInput({ title, onCommit }: { title: string; onCommit: (title: string) => void }): ReactElement {
  const [draft, setDraft] = useState(title);
  return (
    <input
      className="editor__title"
      aria-label="Diagram title"
      value={draft}
      maxLength={200}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        const next = draft.trim() || "Untitled diagram";
        setDraft(next);
        onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function ZoomControls({
  getCanvasSize,
}: {
  getCanvasSize: () => { width: number; height: number };
}): ReactElement {
  const zoom = useEditor((s) => s.viewport.zoom);
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        aria-label="Zoom out"
        onClick={() => {
          zoomBy(1 / 1.2, getCanvasSize());
        }}
      >
        -
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm zoom-controls__value"
        title="Fit to content (Ctrl+0)"
        onClick={() => {
          fitToContent(getCanvasSize());
        }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        aria-label="Zoom in"
        onClick={() => {
          zoomBy(1.2, getCanvasSize());
        }}
      >
        +
      </button>
    </div>
  );
}
