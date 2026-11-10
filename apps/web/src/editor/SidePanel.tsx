import type { ReactElement, ReactNode } from "react";
import { CommentsPanel } from "./CommentsPanel";
import { useEditor } from "./store";
import { useUi } from "./ui";

/** Right-hand panel with Properties and Comments tabs. */
export function SidePanel({
  children,
  newCommentPoint,
}: {
  children: ReactNode;
  newCommentPoint: () => { x: number; y: number };
}): ReactElement {
  const panel = useUi((s) => s.sidePanel);
  const openCount = useEditor((s) => s.diagram?.comments.filter((c) => !c.resolved).length ?? 0);
  const { setSidePanel } = useUi.getState();
  return (
    <aside className="inspector" aria-label="Side panel">
      <div className="side-tabs" role="tablist" aria-label="Panel">
        <button
          type="button"
          role="tab"
          aria-selected={panel === "properties"}
          className={`side-tabs__tab${panel === "properties" ? " side-tabs__tab--active" : ""}`}
          onClick={() => {
            setSidePanel("properties");
          }}
        >
          Properties
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panel === "comments"}
          className={`side-tabs__tab${panel === "comments" ? " side-tabs__tab--active" : ""}`}
          onClick={() => {
            setSidePanel("comments");
          }}
        >
          Comments{openCount > 0 && <span className="side-tabs__badge">{openCount}</span>}
        </button>
      </div>
      {panel === "comments" ? <CommentsPanel newCommentPoint={newCommentPoint} /> : children}
    </aside>
  );
}
