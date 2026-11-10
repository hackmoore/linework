import type { ReactElement } from "react";
import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { usableLayerId, useEditor } from "../editor/store";
import { CONNECT, SELECT, byTool, type ToolDef } from "../editor/tools";
import { CommitInput } from "../gantt/inputs";
import { ChecksSection, GuideSection, Section, TidyButtons } from "../kinds/KindPanels";
import type { KindUi, SelectionPanelProps } from "../kinds/ui";
import {
  activitiesMeta,
  activitiesOf,
  createStateNode,
  nextStateCentre,
  parseTrigger,
  transition,
  triggerLabel,
  type Activity,
  type Trigger,
} from "./model";

// ---------------------------------------------------------------- actions

export function updateTrigger(edge: DiagramEdge, patch: Partial<Trigger>): void {
  useEditor
    .getState()
    .updateEdges([edge.id], { label: triggerLabel({ ...parseTrigger(edge.label), ...patch }) });
}

export function updateActivities(node: DiagramNode, patch: Partial<Record<Activity, string>>): void {
  useEditor.getState().updateNodes([node.id], { meta: activitiesMeta(node, patch) });
}

/** Tab: a new state after the selected one, joined by a transition, ready to name. */
export function addNextState(fromId: string): boolean {
  const state = useEditor.getState();
  const d = state.diagram;
  const from = d?.nodes.find((n) => n.id === fromId);
  if (!d || !from || from.kind === "final" || !["initial", "rounded", "diamond"].includes(from.kind))
    return false;
  // Follow the way the machine already runs: mostly downwards or mostly across.
  const across = d.edges.filter((e) => {
    const s = d.nodes.find((n) => n.id === e.source);
    const t = d.nodes.find((n) => n.id === e.target);
    return s && t && Math.abs(t.x - s.x) > Math.abs(t.y - s.y);
  }).length;
  const direction = across > d.edges.length / 2 ? "LR" : "TB";
  const at = nextStateCentre(d, from, direction);
  const node = createStateNode("rounded", "New state");
  const layerId = usableLayerId(d, state.activeLayerId);
  const placed = {
    ...node,
    x: Math.round(at.x - node.width / 2),
    y: Math.round(at.y - node.height / 2),
    ...(layerId ? { layerId } : {}),
  };
  const edge = transition(
    from.id,
    placed.id,
    from.kind === "initial" ? "" : from.kind === "diamond" ? "[condition]" : "event",
  );
  state.commit((doc) => ({ ...doc, nodes: [...doc.nodes, placed], edges: [...doc.edges, edge] }));
  state.select({ nodeIds: [placed.id] });
  state.startEditing({ nodeId: placed.id });
  return true;
}

/** A transition from a state back to itself, drawn as a loop. */
export function addSelfTransition(nodeId: string): void {
  const state = useEditor.getState();
  const edge = transition(nodeId, nodeId, "event");
  state.commit((d) => ({ ...d, edges: [...d.edges, edge] }));
  state.select({ edgeIds: [edge.id] });
}

// ---------------------------------------------------------------- inspector

function StateSection({ node }: { node: DiagramNode }): ReactElement {
  const activities = activitiesOf(node);
  const activity = (a: Activity, label: string, placeholder: string): ReactElement => (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      <CommitInput
        key={activities[a]}
        className="input"
        label={label}
        maxLength={200}
        placeholder={placeholder}
        value={activities[a]}
        onCommit={(value) => {
          updateActivities(node, { [a]: value });
        }}
      />
    </label>
  );
  return (
    <Section title={node.kind === "container" ? "Composite state" : "State"}>
      <label className="inspector__field">
        <span className="inspector__label">Name</span>
        <CommitInput
          key={node.label}
          className="input"
          label="State name"
          maxLength={200}
          value={node.label}
          onCommit={(label) => {
            useEditor.getState().updateNodes([node.id], { label: label.trim() || "State" });
          }}
        />
      </label>
      {node.kind === "rounded" && (
        <>
          {activity("entry", "On entry", "Such as start timer")}
          {activity("do", "While in this state", "Such as poll the sensor")}
          {activity("exit", "On exit", "Such as stop timer")}
          <div className="inspector__actions">
            <button
              type="button"
              className="btn btn--sm"
              title="Tab"
              onClick={() => {
                addNextState(node.id);
              }}
            >
              + Next state
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                addSelfTransition(node.id);
              }}
            >
              + Self-transition
            </button>
          </div>
        </>
      )}
      {node.kind === "container" && (
        <p className="inspector__hint">
          Draw states inside it, with their own initial state. Tidy up keeps them inside.
        </p>
      )}
    </Section>
  );
}

function TransitionSection({ edge }: { edge: DiagramEdge }): ReactElement {
  const t = parseTrigger(edge.label);
  const field = (key: keyof Trigger, label: string, placeholder: string): ReactElement => (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      <CommitInput
        key={t[key]}
        className="input"
        label={label}
        maxLength={200}
        placeholder={placeholder}
        value={t[key]}
        onCommit={(value) => {
          updateTrigger(edge, { [key]: value });
        }}
      />
    </label>
  );
  return (
    <Section title="Transition">
      {field("event", "Event", "Such as button pressed")}
      {field("guard", "Guard", "A condition, such as balance > 0")}
      {field("action", "Action", "Such as send receipt")}
      <p className="inspector__hint">
        Shown as “event [guard] / action”. Double-click the line to type it directly.
      </p>
    </Section>
  );
}

function StateSelection({ nodes, edges }: SelectionPanelProps): ReactElement {
  const node =
    nodes.length === 1 && (nodes[0]?.kind === "rounded" || nodes[0]?.kind === "container")
      ? nodes[0]
      : undefined;
  const edge = edges.length === 1 ? edges[0] : undefined;
  return (
    <>
      {node && <StateSection node={node} />}
      {edge && <TransitionSection edge={edge} />}
    </>
  );
}

function StateSettings({ diagram }: { diagram: Diagram }): ReactElement {
  return (
    <>
      <Section title="State machine">
        <TidyButtons directions />
      </Section>
      <ChecksSection
        diagram={diagram}
        empty="Pick Initial state from the toolbar to begin."
        allClear="No problems found. Every state can be reached and left."
      />
      <GuideSection chartType="state" />
    </>
  );
}

const TOOLS: readonly ToolDef[] = [
  SELECT,
  CONNECT,
  {
    tool: "initial",
    label: "Initial state",
    shortcut: "I",
    icon: <circle cx="12" cy="12" r="6" fill="currentColor" />,
  },
  {
    tool: "rounded",
    label: "State",
    shortcut: "S",
    icon: <rect x="3" y="6" width="18" height="12" rx="4" />,
  },
  { tool: "diamond", label: "Choice", shortcut: "D", icon: <path d="M12 4l8 8-8 8-8-8z" /> },
  {
    tool: "final",
    label: "Final state",
    shortcut: "F",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      </>
    ),
  },
  { tool: "container", label: "Composite state", shortcut: "G", icon: <path d="M3 4h18v16H3zM3 8.5h18" /> },
  byTool("note"),
  byTool("text"),
].filter((t): t is ToolDef => t !== undefined);

export const stateUi: KindUi = {
  tools: TOOLS,
  SelectionPanel: StateSelection,
  Settings: StateSettings,
  onTab: addNextState,
};
