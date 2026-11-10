import type { ReactElement, ReactNode } from "react";
import type { ChartType, Diagram } from "@linework/shared";
import { CHART_TYPE_INFO } from "../charts/chartTypes";
import type { LayoutDirection } from "../editor/arrange";
import { useEditor } from "../editor/store";
import { kindModel } from "./registry";

/* Inspector building blocks shared by the node-and-edge chart types. */

export function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="inspector__section">
      <h3 className="inspector__heading">{title}</h3>
      {children}
    </section>
  );
}

/** Runs the chart type's automatic layout as one undoable step. */
export function tidyDiagram(direction?: LayoutDirection): void {
  const state = useEditor.getState();
  const tidy = kindModel(state.diagram?.chartType)?.tidy;
  if (tidy) state.commit((d) => tidy(d, direction));
}

export function TidyButtons({
  directions,
  hint,
}: {
  /** Offer top-to-bottom and left-to-right buttons; otherwise one Tidy up button. */
  directions?: boolean;
  hint?: string;
}): ReactElement {
  return (
    <div className="inspector__field">
      <span className="inspector__label">Layout</span>
      <div className="inspector__actions">
        {directions ? (
          <>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                tidyDiagram("TB");
              }}
            >
              Top to bottom
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                tidyDiagram("LR");
              }}
            >
              Left to right
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              tidyDiagram();
            }}
          >
            Tidy up
          </button>
        )}
      </div>
      {hint && <p className="inspector__hint">{hint}</p>}
    </div>
  );
}

/** The chart type's checks, each selecting the shapes it is about when clicked. */
export function ChecksSection({
  diagram,
  empty,
  allClear,
}: {
  diagram: Diagram;
  /** Shown when the diagram has nothing in it yet. */
  empty: string;
  /** Shown when nothing is wrong. */
  allClear: string;
}): ReactElement {
  const issues = kindModel(diagram.chartType)?.checks?.(diagram) ?? [];
  return (
    <Section title={issues.length === 0 ? "Checks" : `Checks (${String(issues.length)})`}>
      {diagram.nodes.length === 0 ? (
        <p className="inspector__hint">{empty}</p>
      ) : issues.length === 0 ? (
        <p className="inspector__hint">{allClear}</p>
      ) : (
        <ul className="flow-issues">
          {issues.slice(0, 30).map((issue, i) => {
            const nodeIds = issue.nodeIds ?? [];
            const edgeIds = issue.edgeIds ?? [];
            return (
              <li key={`${String(i)}-${issue.message}`}>
                {nodeIds.length > 0 || edgeIds.length > 0 ? (
                  <button
                    type="button"
                    className="flow-issues__item"
                    onClick={() => {
                      useEditor.getState().select({ nodeIds: [...nodeIds], edgeIds: [...edgeIds] });
                    }}
                  >
                    {issue.message}
                  </button>
                ) : (
                  <span className="flow-issues__item">{issue.message}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** "Working with …": what the chart is made of, and tips. */
export function GuideSection({ chartType }: { chartType: ChartType }): ReactElement {
  const info = CHART_TYPE_INFO[chartType];
  return (
    <Section title={`Working with ${info.name.toLowerCase()}s`}>
      <dl className="guide-objects">
        {info.objects.map((o) => (
          <div key={o.name}>
            <dt>{o.name}</dt>
            <dd>{o.description}</dd>
          </div>
        ))}
      </dl>
      <ul className="guide-tips">
        {info.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </Section>
  );
}

/** A toolbar button that adds something at the middle of the canvas. */
export function PaletteButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button type="button" className="tool-button" aria-label={label} title={label} onClick={onClick}>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

export function PaletteDivider(): ReactElement {
  return <span className="tool-palette__divider" aria-hidden="true" />;
}
