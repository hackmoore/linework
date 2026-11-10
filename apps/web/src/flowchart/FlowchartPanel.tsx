import type { ReactElement, ReactNode } from "react";
import type { Diagram, DiagramNode, FlowDirection, ShapeKind } from "@linework/shared";
import { CHART_TYPE_INFO } from "../charts/chartTypes";
import { useEditor } from "../editor/store";
import { CommitInput, NumberCommitInput } from "../gantt/inputs";
import { flowActions } from "./actions";
import { flowIssues, isAnnotation, LANE_COLORS, laneOf } from "./model";

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="inspector__section">
      <h3 className="inspector__heading">{title}</h3>
      {children}
    </section>
  );
}

const NEXT_STEPS: readonly (readonly [ShapeKind, string])[] = [
  ["rectangle", "Step"],
  ["diamond", "Decision"],
  ["parallelogram", "Input / output"],
  ["terminal", "End"],
];

/** Flowchart controls for selected steps: add the next step, and pick a lane. */
export function FlowStepSection({
  diagram,
  nodes,
}: {
  diagram: Diagram;
  nodes: readonly DiagramNode[];
}): ReactElement | null {
  const data = diagram.flowchart;
  const steps = nodes.filter((n) => !isAnnotation(n));
  if (!data || steps.length === 0) return null;
  const only = steps.length === 1 ? steps[0] : undefined;
  const lanes = new Set(steps.map((n) => laneOf(data, n) ?? ""));
  const lane = lanes.size === 1 ? [...lanes][0] : undefined;
  return (
    <Section title="Flow">
      {only && (
        <div className="inspector__field">
          <span className="inspector__label">Add next step</span>
          <div className="inspector__actions">
            {NEXT_STEPS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  flowActions.addNextStep(only.id, kind);
                }}
              >
                + {label}
              </button>
            ))}
          </div>
          <p className="inspector__hint">Press Tab to add a step after the selected one.</p>
        </div>
      )}
      {data.lanes.length > 0 && (
        <label className="inspector__field">
          <span className="inspector__label">Lane</span>
          <select
            className="select"
            value={lane ?? ""}
            onChange={(event) => {
              if (event.target.value)
                flowActions.moveToLane(
                  steps.map((n) => n.id),
                  event.target.value,
                );
            }}
          >
            {(lane === undefined || lane === "") && (
              <option value="">{lane === "" ? "Outside lanes" : "Mixed"}</option>
            )}
            {data.lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name || "Untitled lane"}
              </option>
            ))}
          </select>
        </label>
      )}
    </Section>
  );
}

/** Flowchart settings shown when nothing is selected: direction, layout, swimlanes and checks. */
export function FlowchartSettings({ diagram }: { diagram: Diagram }): ReactElement | null {
  const data = diagram.flowchart;
  if (!data) return null;
  const issues = flowIssues(diagram);
  const info = CHART_TYPE_INFO.flowchart;
  const directions: readonly (readonly [FlowDirection, string])[] = [
    ["TB", "Top to bottom"],
    ["LR", "Left to right"],
  ];
  return (
    <>
      <Section title="Flowchart">
        <div className="inspector__field">
          <span className="inspector__label">Direction</span>
          <div className="segmented segmented--full" role="radiogroup" aria-label="Direction">
            {directions.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={data.direction === id}
                className={`segmented__option${data.direction === id ? " segmented__option--active" : ""}`}
                onClick={() => {
                  flowActions.setDirection(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            disabled={diagram.nodes.length === 0}
            onClick={() => {
              flowActions.tidy();
            }}
          >
            Tidy up layout
          </button>
        </div>
      </Section>
      <Section title="Swimlanes">
        {data.lanes.length === 0 ? (
          <p className="inspector__hint">
            Add swimlanes to show who does each step, such as one lane per person, team or system.
          </p>
        ) : (
          <ul className="kanban-settings">
            {data.lanes.map((lane, i) => (
              <li key={lane.id} className="kanban-settings__item">
                <div className="kanban-settings__row">
                  <select
                    className="kanban-settings__color"
                    aria-label={`Colour of ${lane.name}`}
                    value={lane.color}
                    style={{ background: lane.color }}
                    onChange={(event) => {
                      flowActions.updateLane(lane.id, { color: event.target.value });
                    }}
                  >
                    {[...new Set([lane.color, ...LANE_COLORS])].map((c) => (
                      <option key={c} value={c} style={{ background: c }}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <CommitInput
                    key={lane.name}
                    className="input kanban-settings__name"
                    label="Lane name"
                    maxLength={100}
                    value={lane.name}
                    onCommit={(name) => {
                      flowActions.updateLane(lane.id, { name: name.trim() || "Untitled lane" });
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move ${lane.name} ${data.direction === "TB" ? "left" : "up"}`}
                    disabled={i === 0}
                    onClick={() => {
                      flowActions.moveLane(lane.id, -1);
                    }}
                  >
                    {data.direction === "TB" ? "←" : "↑"}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move ${lane.name} ${data.direction === "TB" ? "right" : "down"}`}
                    disabled={i === data.lanes.length - 1}
                    onClick={() => {
                      flowActions.moveLane(lane.id, 1);
                    }}
                  >
                    {data.direction === "TB" ? "→" : "↓"}
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`Delete ${lane.name}`}
                    onClick={() => {
                      const count = diagram.nodes.filter(
                        (n) => !isAnnotation(n) && laneOf(data, n) === lane.id,
                      ).length;
                      const neighbour = data.lanes[i === 0 ? 1 : i - 1];
                      const message =
                        count === 0 || !neighbour
                          ? null
                          : `Delete ${lane.name}? Its ${String(count)} steps move to ${neighbour.name}.`;
                      if (!message || window.confirm(message)) flowActions.deleteLane(lane.id);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="kanban-settings__row kanban-settings__row--sub">
                  <label className="kanban-settings__wip">
                    {data.direction === "TB" ? "Width" : "Height"}
                    <NumberCommitInput
                      key={lane.size}
                      className="input flow-settings__size"
                      label={`Size of ${lane.name}`}
                      min={120}
                      max={4000}
                      value={lane.size}
                      onCommit={(size) => {
                        flowActions.resizeLane(lane.id, size);
                      }}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            disabled={data.lanes.length >= 30}
            onClick={() => {
              flowActions.addLane();
            }}
          >
            + Add swimlane
          </button>
        </div>
      </Section>
      <Section title={issues.length === 0 ? "Checks" : `Checks (${String(issues.length)})`}>
        {diagram.nodes.length === 0 ? (
          <p className="inspector__hint">Pick Start / end from the toolbar to begin.</p>
        ) : issues.length === 0 ? (
          <p className="inspector__hint">No problems found. Every step leads somewhere.</p>
        ) : (
          <ul className="flow-issues">
            {issues.slice(0, 20).map((issue, i) => (
              <li key={`${issue.nodeId ?? "chart"}-${String(i)}`}>
                {issue.nodeId ? (
                  <button
                    type="button"
                    className="flow-issues__item"
                    onClick={() => {
                      if (issue.nodeId) useEditor.getState().select({ nodeIds: [issue.nodeId] });
                    }}
                  >
                    {issue.message}
                  </button>
                ) : (
                  <span className="flow-issues__item">{issue.message}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Working with flowcharts">
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
    </>
  );
}
