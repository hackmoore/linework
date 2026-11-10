import { useEffect, useState, type ReactElement } from "react";
import { useLocation } from "react-router";
import type { Diagram } from "@linework/shared";
import { diagramToSvg } from "../export/exporters";
import { decodeFragment } from "../share/link";

/**
 * /embed#... shows a chart read-only, sized to its frame, for iframes in wikis, Notion and
 * docs. A small link opens an editable copy.
 */
export function EmbedPage(): ReactElement {
  const location = useLocation();
  const [state, setState] = useState<{ diagram: Diagram } | { error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void decodeFragment(location.hash).then((result) => {
      if (!cancelled) setState(result.ok ? { diagram: result.diagram } : { error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [location.hash]);

  if (!state) return <div className="embed embed--message">Loading...</div>;
  if ("error" in state)
    return <div className="embed embed--message">Couldn&apos;t show this chart: {state.error}</div>;

  const { svg } = diagramToSvg(state.diagram);
  return (
    <div
      className="embed"
      style={{
        background: state.diagram.background === "transparent" ? "#ffffff" : state.diagram.background,
      }}
    >
      {/* Our own renderer's output; labels are escaped by React's static markup. */}
      <div
        className="embed__chart"
        role="img"
        aria-label={state.diagram.title}
        dangerouslySetInnerHTML={{ __html: svg.replace(/^<\?xml[^>]*>\s*/, "") }}
      />
      <a className="embed__open" href={`/open${location.hash}`} target="_blank" rel="noreferrer">
        Open in Linework
      </a>
    </div>
  );
}
