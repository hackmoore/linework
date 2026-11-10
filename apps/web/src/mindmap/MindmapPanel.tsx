import type { ReactElement } from "react";
import type { Diagram, DiagramNode } from "@linework/shared";
import { usableLayerId, useEditor } from "../editor/store";
import { CONNECT, SELECT, byTool, type ToolDef } from "../editor/tools";
import { CommitInput } from "../gantt/inputs";
import { ChecksSection, GuideSection, Section } from "../kinds/KindPanels";
import { descendants } from "../kinds/tree";
import type { KindUi, SelectionPanelProps } from "../kinds/ui";
import { center } from "../render/geometry";
import {
  BRANCH_COLORS,
  branchLine,
  createTopicNode,
  depths,
  isTopic,
  mindmapTree,
  rootOf,
  tidyMindmap,
  type MindmapLayout,
} from "./model";

// ---------------------------------------------------------------- actions

/** "right" when every main branch is to the right of the central topic, otherwise balanced. */
export function currentLayout(d: Diagram): MindmapLayout {
  const root = rootOf(d);
  if (!root) return "balanced";
  const tree = mindmapTree(d);
  const branches = (tree.children.get(root.id) ?? []).flatMap((id) => d.nodes.find((n) => n.id === id) ?? []);
  const rc = center(root);
  return branches.length >= 2 && branches.every((n) => center(n).x > rc.x) ? "right" : "balanced";
}

function addTopic(parentId: string): string | null {
  const state = useEditor.getState();
  const d = state.diagram;
  const parent = d?.nodes.find((n) => n.id === parentId);
  if (!d || !parent || !isTopic(parent)) return null;
  const layerId = usableLayerId(d, state.activeLayerId);
  const topic = createTopicNode("New topic");
  // Created on its parent's centre, which tells the layout it hasn't been placed yet.
  const c = center(parent);
  const node = {
    ...topic,
    x: Math.round(c.x - topic.width / 2),
    y: Math.round(c.y - topic.height / 2),
    ...(layerId ? { layerId } : {}),
  };
  const layout = currentLayout(d);
  state.commit((doc) =>
    tidyMindmap(
      { ...doc, nodes: [...doc.nodes, node], edges: [...doc.edges, branchLine(parentId, node.id)] },
      layout,
    ),
  );
  state.select({ nodeIds: [node.id] });
  state.startEditing({ nodeId: node.id });
  return node.id;
}

/** Tab: a new subtopic of the selected topic, ready to type. */
export function addChild(parentId: string): boolean {
  return addTopic(parentId) !== null;
}

/** Enter: a new topic next to the selected one (a main branch for the central topic). */
export function addSibling(topicId: string): boolean {
  const d = useEditor.getState().diagram;
  if (!d) return false;
  const parent = mindmapTree(d).parent.get(topicId);
  return addTopic(parent ?? topicId) !== null;
}

/** Deletes a topic and everything under it. */
export function deleteBranch(topicId: string): void {
  const d = useEditor.getState().diagram;
  if (!d) return;
  const gone = new Set([topicId, ...descendants(mindmapTree(d), topicId)]);
  const state = useEditor.getState();
  state.commit((doc) => ({
    ...doc,
    nodes: doc.nodes.filter((n) => !gone.has(n.id)),
    edges: doc.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
    comments: doc.comments.filter((c) => !c.targetId || !gone.has(c.targetId)),
  }));
  state.clearSelection();
}

export function layoutMindmap(layout: MindmapLayout): void {
  useEditor.getState().commit((d) => tidyMindmap(d, layout, true));
}

// ---------------------------------------------------------------- inspector

function TopicSection({ diagram, node }: { diagram: Diagram; node: DiagramNode }): ReactElement {
  const tree = mindmapTree(diagram);
  const depth = depths(diagram, tree).get(node.id);
  const below = descendants(tree, node.id).size;
  const { updateNodes } = useEditor.getState();
  return (
    <Section title={depth === 0 ? "Central topic" : depth === 1 ? "Main branch" : "Topic"}>
      <label className="inspector__field">
        <span className="inspector__label">Text</span>
        <CommitInput
          key={node.label}
          className="input"
          label="Topic text"
          maxLength={500}
          value={node.label}
          onCommit={(label) => {
            updateNodes([node.id], { label: label.trim() || "Topic" });
          }}
        />
      </label>
      {depth === 1 && (
        <div className="inspector__field">
          <span className="inspector__label">Branch colour</span>
          <div className="swatches" role="group" aria-label="Branch colour">
            {BRANCH_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${node.fill === c ? " swatch--active" : ""}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                onClick={() => {
                  updateNodes([node.id], { meta: { ...node.meta, color: c } });
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm"
          title="Tab"
          onClick={() => {
            addChild(node.id);
          }}
        >
          + Subtopic
        </button>
        {depth !== 0 && (
          <button
            type="button"
            className="btn btn--sm"
            title="Enter"
            onClick={() => {
              addSibling(node.id);
            }}
          >
            + Next to it
          </button>
        )}
        {depth !== 0 && (
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => {
              if (below === 0 || window.confirm(`Delete this topic and the ${String(below)} under it?`))
                deleteBranch(node.id);
            }}
          >
            Delete branch
          </button>
        )}
      </div>
      <p className="inspector__hint">Tab adds a subtopic, Enter adds one next to it. F2 edits the text.</p>
    </Section>
  );
}

function MindmapSelection({ diagram, nodes }: SelectionPanelProps): ReactElement | null {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  return only && isTopic(only) ? <TopicSection diagram={diagram} node={only} /> : null;
}

function MindmapSettings({ diagram }: { diagram: Diagram }): ReactElement {
  const topics = diagram.nodes.filter(isTopic).length;
  return (
    <>
      <Section title="Mind map">
        <p className="inspector__hint">{`${String(topics)} ${topics === 1 ? "topic" : "topics"}.`}</p>
        <div className="inspector__field">
          <span className="inspector__label">Layout</span>
          <div className="inspector__actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                layoutMindmap("balanced");
              }}
            >
              Both sides
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                layoutMindmap("right");
              }}
            >
              To the right
            </button>
          </div>
        </div>
      </Section>
      <ChecksSection
        diagram={diagram}
        empty="Every mind map starts with a central topic."
        allClear="Every topic is connected to the map."
      />
      <GuideSection chartType="mindmap" />
    </>
  );
}

const TOOLS: readonly ToolDef[] = [SELECT, CONNECT, byTool("note"), byTool("text")].filter(
  (t): t is ToolDef => t !== undefined,
);

export const mindmapUi: KindUi = {
  tools: TOOLS,
  SelectionPanel: MindmapSelection,
  Settings: MindmapSettings,
  onTab: addChild,
  onEnter: addSibling,
};
