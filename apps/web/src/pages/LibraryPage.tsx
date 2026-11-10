import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { Link, useNavigate } from "react-router";
import type { Diagram, DiagramSummary } from "@linework/shared";
import { CHART_TYPE_INFO, countLabel } from "../charts/chartTypes";
import { SiteFooter, SiteHeader } from "../components/SiteHeader";
import { createId } from "../diagram/factory";
import { getStyle } from "../diagram/styles";
import { importText } from "../share/importText";
import { deleteDiagram, listDiagrams, saveDiagram } from "../storage/localStore";

const AiDialog = lazy(async () => ({ default: (await import("../ai/AiDialog")).AiDialog }));

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function LibraryPage(): ReactElement {
  const navigate = useNavigate();
  const [diagrams, setDiagrams] = useState<DiagramSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const refresh = (): void => {
    listDiagrams().then(setDiagrams, (cause: unknown) => {
      setDiagrams([]);
      setError(cause instanceof Error ? cause.message : "Could not read local diagrams");
    });
  };

  useEffect(() => {
    document.title = "My diagrams - Linework";
    refresh();
  }, []);

  const onDelete = async (summary: DiagramSummary): Promise<void> => {
    if (!window.confirm(`Delete "${summary.title}"? This can't be undone.`)) return;
    await deleteDiagram(summary.id);
    refresh();
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const parsed = importText(await file.text(), file.name);
    if (!parsed.ok) {
      setError(`Couldn't import ${file.name}: ${parsed.error}`);
      return;
    }
    await openImported(parsed.diagram);
  };

  const openImported = async (imported: Diagram): Promise<void> => {
    // Fresh id so importing never overwrites an existing local diagram.
    const now = new Date().toISOString();
    const diagram = { ...imported, id: createId(), createdAt: now, updatedAt: now };
    await saveDiagram(diagram);
    void navigate(`/d/${diagram.id}`);
  };

  return (
    <div className="home">
      <SiteHeader />
      <main className="page-container library">
        <div className="library__header">
          <div>
            <h1>My diagrams</h1>
            <p className="library__lede">
              Stored in this browser. Export a Linework file to move one elsewhere.
            </p>
          </div>
          <div className="library__actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              Import file
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPasteOpen(true);
              }}
            >
              Paste text
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setAiOpen(true);
              }}
            >
              Generate with AI
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,.mmd,.mermaid,.txt,.csv,.xml,application/json,text/plain,text/csv,application/xml"
              hidden
              onChange={(event) => void onImport(event)}
            />
            <Link to="/new" className="btn btn--primary">
              New diagram
            </Link>
          </div>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {aiOpen && (
          <Suspense fallback={null}>
            <AiDialog
              onClose={() => {
                setAiOpen(false);
              }}
            />
          </Suspense>
        )}
        {pasteOpen && (
          <PasteImport
            onCancel={() => {
              setPasteOpen(false);
            }}
            onImport={(diagram) => void openImported(diagram)}
          />
        )}
        {diagrams === null ? (
          <p>Loading...</p>
        ) : diagrams.length === 0 ? (
          <div className="library__empty">
            <h2>No diagrams yet</h2>
            <p>Start from a blank canvas or pick a template on the home page.</p>
            <Link to="/new" className="btn btn--primary">
              Create your first diagram
            </Link>
          </div>
        ) : (
          <ul className="library__list">
            {diagrams.map((summary) => (
              <li key={summary.id} className="library__item">
                <Link to={`/d/${summary.id}`} className="library__link">
                  <strong>{summary.title || "Untitled diagram"}</strong>
                  <span>
                    {CHART_TYPE_INFO[summary.chartType].name} ·{" "}
                    {countLabel(summary.chartType, summary.itemCount)} · {getStyle(summary.styleId).name} ·
                    Edited {dateFormat.format(new Date(summary.updatedAt))}
                  </span>
                </Link>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm btn--danger"
                  aria-label={`Delete ${summary.title}`}
                  onClick={() => void onDelete(summary)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function PasteImport({
  onCancel,
  onImport,
}: {
  onCancel: () => void;
  onImport: (diagram: Diagram) => void;
}): ReactElement {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="paste-import" aria-label="Paste text to import">
      <label className="field">
        <span>Paste Mermaid (flowchart, gantt or kanban), Linework simple JSON, or a Linework file</span>
        <textarea
          className="input paste-import__text"
          rows={10}
          spellCheck={false}
          placeholder={"flowchart LR\n  A[Idea] --> B[Plan] --> C[Ship]"}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
        />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="library__actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!text.trim()}
          onClick={() => {
            const result = importText(text);
            if (result.ok) onImport(result.diagram);
            else setError(result.error);
          }}
        >
          Import
        </button>
      </div>
    </section>
  );
}
