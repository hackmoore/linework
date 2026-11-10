import { useCallback, useEffect, useState, type ReactElement } from "react";
import { deleteVersion, listVersions, saveVersion, type DiagramVersion } from "../storage/localStore";
import { itemCount as countItems } from "@linework/shared";
import { countLabel } from "../charts/chartTypes";
import { useEditor } from "./store";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function itemCount(version: DiagramVersion): string {
  return countLabel(version.diagram.chartType, countItems(version.diagram));
}

/**
 * Version history: automatic snapshots (every 10 minutes of editing) and named versions.
 * Restoring is a normal edit, so it can itself be undone.
 */
export function HistoryDialog({ onClose }: { onClose: () => void }): ReactElement {
  const diagramId = useEditor((s) => s.diagram?.id);
  const [versions, setVersions] = useState<DiagramVersion[] | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!diagramId) return;
    listVersions(diagramId).then(setVersions, () => {
      setError("Couldn't read version history");
    });
  }, [diagramId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const saveNow = async (): Promise<void> => {
    const diagram = useEditor.getState().diagram;
    if (!diagram) return;
    await saveVersion(diagram, label.trim() || "Saved version", false);
    setLabel("");
    refresh();
  };

  const restore = (version: DiagramVersion): void => {
    // Keep this document's identity; take everything else from the version.
    useEditor
      .getState()
      .commit((d) => ({ ...version.diagram, id: d.id, createdAt: d.createdAt, updatedAt: d.updatedAt }));
    onClose();
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="dialog__header">
          <h2 id="history-title">Version history</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="dialog__row"
          onSubmit={(event) => {
            event.preventDefault();
            void saveNow();
          }}
        >
          <input
            className="input"
            placeholder="Name this version (optional)"
            aria-label="Version name"
            maxLength={100}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
          <button type="submit" className="btn btn--primary btn--sm">
            Save version
          </button>
        </form>
        <p className="inspector__hint">
          Snapshots are also taken automatically every 10 minutes while you edit. They stay in this browser.
        </p>
        {error && <p className="error-text">{error}</p>}
        {versions === null ? (
          <p>Loading...</p>
        ) : versions.length === 0 ? (
          <p className="inspector__hint">No versions yet.</p>
        ) : (
          <ul className="version-list">
            {versions.map((v) => (
              <li key={v.id} className="version-list__item">
                <div>
                  <strong>{v.label || "Automatic snapshot"}</strong>
                  <span>
                    {timeFormat.format(new Date(v.createdAt))} · {itemCount(v)}
                  </span>
                </div>
                <div className="version-list__actions">
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      restore(v);
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--danger"
                    aria-label={`Delete version from ${timeFormat.format(new Date(v.createdAt))}`}
                    onClick={() => {
                      void deleteVersion(v.id).then(refresh);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
