import { useEffect, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "react-router";
import { createId } from "../diagram/factory";
import { saveDiagram } from "../storage/localStore";
import { generateChart, loadApiKey, storeApiKey, type AiChartKind } from "./generate";

const EXAMPLES: Readonly<Record<AiChartKind, string>> = {
  gantt:
    "A 6-week plan to relaunch our marketing website: discovery, design, build, content, QA and launch. Team: Priya (design), Sam (dev), Lee (content).",
  kanban:
    "A sprint board for a 4-person mobile team: backlog, to do, in progress (limit 3), review and done. Include a couple of bugs and a release task.",
  flowchart:
    "How a support ticket is handled: the customer submits it, support triages it, engineering fixes bugs, and support replies and closes it. Use swimlanes for customer, support and engineering.",
  network:
    "Alex Reed is a director of Northgate Ltd and Brightwater Holdings. Sam Ortiz calls Alex often and was seen driving a white van registered to Northgate. Brightwater pays Sam's company, Ortiz Consulting.",
  diagram:
    "Architecture of a food delivery app: mobile app and web app, API gateway, orders, payments and notifications services, a Postgres database and a message queue.",
};

/** "Generate with AI" dialog: describe a chart, get a new diagram. Uses the user's own Anthropic API key. */
export function AiDialog({
  initialKind = "diagram",
  onClose,
}: {
  initialKind?: AiChartKind;
  onClose: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const [kind, setKind] = useState<AiChartKind>(initialKind);
  const [description, setDescription] = useState("");
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [remember, setRemember] = useState(() => loadApiKey() !== "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      abort.current?.abort();
    };
  }, [onClose]);

  const submit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    storeApiKey(remember ? apiKey : "");
    abort.current = new AbortController();
    const result = await generateChart(kind, description, apiKey, abort.current.signal);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const now = new Date().toISOString();
    const diagram = { ...result.diagram, id: createId(), createdAt: now, updatedAt: now };
    await saveDiagram(diagram);
    onClose();
    void navigate(`/d/${diagram.id}`);
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-title"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="dialog__header">
          <h2 id="ai-title">Generate with AI</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="segmented segmented--full" role="radiogroup" aria-label="Chart type">
          {(["flowchart", "gantt", "kanban", "network", "diagram"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={`segmented__option${kind === k ? " segmented__option--active" : ""}`}
              onClick={() => {
                setKind(k);
              }}
            >
              {k === "gantt"
                ? "Gantt"
                : k === "kanban"
                  ? "Kanban"
                  : k === "flowchart"
                    ? "Flowchart"
                    : "Diagram"}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Describe the chart</span>
          <textarea
            className="input"
            rows={5}
            required
            placeholder={EXAMPLES[kind]}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>
            Anthropic API key (
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
              get one
            </a>
            )
          </span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
            }}
          />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => {
              setRemember(event.target.checked);
            }}
          />
          <span>
            <strong>Remember key in this browser</strong>
            <small>
              Stored only on this device. Requests go straight to Anthropic; usage is billed to your account.
            </small>
          </span>
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="editor-message__actions dialog__footer">
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (busy) abort.current?.abort();
              else onClose();
            }}
          >
            {busy ? "Cancel" : "Close"}
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || !description.trim() || !apiKey.trim()}
          >
            {busy ? "Generating..." : "Generate chart"}
          </button>
        </div>
        <p className="inspector__hint">
          No key? Use any AI assistant instead: see <a href="/llms">instructions for AI assistants</a>.
        </p>
      </form>
    </div>
  );
}
