import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { createId } from "../diagram/factory";
import { decodeFragment } from "../share/link";
import { saveDiagram } from "../storage/localStore";

/**
 * /open#... imports a chart from the link (share links, Mermaid, simple JSON) as a new
 * local diagram and opens it in the editor. The original link is left untouched.
 */
export function OpenPage(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (handled.current === location.hash) return;
    handled.current = location.hash;
    void (async () => {
      const result = await decodeFragment(location.hash);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Always a fresh copy, so opening a link twice never overwrites earlier edits.
      const now = new Date().toISOString();
      const diagram = { ...result.diagram, id: createId(), createdAt: now, updatedAt: now };
      try {
        await saveDiagram(diagram);
        void navigate(`/d/${diagram.id}`, { replace: true });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the chart in this browser");
      }
    })();
  }, [location.hash, navigate]);

  return (
    <div className="editor-message">
      {error ? (
        <>
          <h1>This link couldn&apos;t be opened</h1>
          <p className="error-text">{error}</p>
          <p>
            If an AI assistant made this link, paste the error back to it and ask for a corrected link. See
            the <Link to="/llms">instructions for AI assistants</Link>.
          </p>
          <div className="editor-message__actions">
            <Link to="/" className="btn">
              Home
            </Link>
            <Link to="/new" className="btn btn--primary">
              New chart
            </Link>
          </div>
        </>
      ) : (
        <p>Opening chart...</p>
      )}
    </div>
  );
}
