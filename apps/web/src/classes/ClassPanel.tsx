import type { ReactElement } from "react";
import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { usableLayerId, useEditor } from "../editor/store";
import { CONNECT, SELECT, byTool, type ToolDef } from "../editor/tools";
import { CommitInput, CommitTextarea } from "../gantt/inputs";
import { ChecksSection, GuideSection, Section, TidyButtons } from "../kinds/KindPanels";
import type { KindUi, SelectionPanelProps } from "../kinds/ui";
import { classLabel, parseClass, type ClassLabel } from "../render/compartments";
import {
  classStyle,
  createClassNode,
  relationOf,
  relationship,
  relationStyle,
  RELATION_LABELS,
  RELATIONS,
  STEREOTYPES,
  type Relation,
} from "./model";

// ---------------------------------------------------------------- actions

export function updateClass(id: string, patch: Partial<ClassLabel>): void {
  useEditor.getState().commit((d) => ({
    ...d,
    nodes: d.nodes.map((n) => {
      if (n.id !== id || n.kind !== "class") return n;
      const next = { ...parseClass(n.label), ...patch };
      return {
        ...n,
        label: classLabel(next),
        ...(patch.stereotype !== undefined ? classStyle(next.stereotype) : {}),
      };
    }),
  }));
}

export function setRelation(edgeId: string, relation: Relation): void {
  useEditor.getState().updateEdges([edgeId], relationStyle(relation));
}

/** Tab: a new subclass below the selected class. */
export function addSubclass(parentId: string): boolean {
  const state = useEditor.getState();
  const d = state.diagram;
  const parent = d?.nodes.find((n) => n.id === parentId);
  if (!d || parent?.kind !== "class") return false;
  const node = createClassNode({ name: "NewClass", stereotype: "", attributes: [], operations: [] });
  const below = d.nodes.filter(
    (n) =>
      n.y > parent.y + parent.height &&
      n.y < parent.y + parent.height + 200 &&
      n.x + n.width > parent.x - 300,
  );
  const x = below.length > 0 ? Math.max(...below.map((n) => n.x + n.width)) + 40 : parent.x;
  const layerId = usableLayerId(d, state.activeLayerId);
  const placed = { ...node, x, y: parent.y + parent.height + 110, ...(layerId ? { layerId } : {}) };
  const isInterface = parseClass(parent.label).stereotype === "interface";
  const edge = relationship(placed.id, parent.id, isInterface ? "realization" : "inheritance");
  state.commit((doc) => ({ ...doc, nodes: [...doc.nodes, placed], edges: [...doc.edges, edge] }));
  state.select({ nodeIds: [placed.id] });
  return true;
}

// ---------------------------------------------------------------- inspector

function ClassSection({ node }: { node: DiagramNode }): ReactElement {
  const cls = parseClass(node.label);
  return (
    <Section title={cls.stereotype ? `«${cls.stereotype}»` : "Class"}>
      <label className="inspector__field">
        <span className="inspector__label">Name</span>
        <CommitInput
          key={cls.name}
          className="input"
          label="Class name"
          maxLength={100}
          value={cls.name}
          onCommit={(name) => {
            updateClass(node.id, { name: name.trim() || "ClassName" });
          }}
        />
      </label>
      <label className="inspector__field">
        <span className="inspector__label">Kind</span>
        <select
          className="select"
          value={cls.stereotype}
          onChange={(event) => {
            updateClass(node.id, { stereotype: event.target.value });
          }}
        >
          {STEREOTYPES.map((s) => (
            <option key={s} value={s}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : "Class"}
            </option>
          ))}
        </select>
      </label>
      <label className="inspector__field">
        <span className="inspector__label">{cls.stereotype === "enumeration" ? "Values" : "Attributes"}</span>
        <CommitTextarea
          key={cls.attributes.join("\n")}
          className="input input--mono"
          label="Attributes, one per line"
          value={cls.attributes.join("\n")}
          placeholder="- id: UUID"
          onCommit={(value) => {
            updateClass(node.id, {
              attributes: value
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean),
            });
          }}
        />
      </label>
      <label className="inspector__field">
        <span className="inspector__label">Operations</span>
        <CommitTextarea
          key={cls.operations.join("\n")}
          className="input input--mono"
          label="Operations, one per line"
          value={cls.operations.join("\n")}
          placeholder="+ save(): void"
          onCommit={(value) => {
            updateClass(node.id, {
              operations: value
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean),
            });
          }}
        />
      </label>
      <p className="inspector__hint">
        One per line. Start with + public, - private, # protected or ~ package. Press Tab to add a subclass.
      </p>
    </Section>
  );
}

function RelationshipSection({ diagram, edge }: { diagram: Diagram; edge: DiagramEdge }): ReactElement {
  const { updateEdges } = useEditor.getState();
  const relation = relationOf(edge);
  const name = (id: string): string => {
    const n = diagram.nodes.find((x) => x.id === id);
    return n?.kind === "class" ? parseClass(n.label).name : (n?.label ?? "");
  };
  return (
    <Section title="Relationship">
      <label className="inspector__field">
        <span className="inspector__label">Type</span>
        <select
          className="select"
          value={relation}
          onChange={(event) => {
            setRelation(edge.id, event.target.value as Relation);
          }}
        >
          {RELATIONS.map((r) => (
            <option key={r} value={r}>
              {RELATION_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <div className="inspector__row">
        <label className="inspector__field">
          <span className="inspector__label">{name(edge.source)} end</span>
          <CommitInput
            key={edge.startLabel ?? ""}
            className="input"
            label="Multiplicity at the start"
            maxLength={20}
            placeholder="1"
            value={edge.startLabel ?? ""}
            onCommit={(startLabel) => {
              updateEdges([edge.id], { startLabel: startLabel.trim() });
            }}
          />
        </label>
        <label className="inspector__field">
          <span className="inspector__label">{name(edge.target)} end</span>
          <CommitInput
            key={edge.endLabel ?? ""}
            className="input"
            label="Multiplicity at the end"
            maxLength={20}
            placeholder="0..*"
            value={edge.endLabel ?? ""}
            onCommit={(endLabel) => {
              updateEdges([edge.id], { endLabel: endLabel.trim() });
            }}
          />
        </label>
      </div>
      <label className="inspector__field">
        <span className="inspector__label">Label</span>
        <CommitInput
          key={edge.label}
          className="input"
          label="Label"
          maxLength={200}
          placeholder="Such as places"
          value={edge.label}
          onCommit={(label) => {
            updateEdges([edge.id], { label: label.trim() });
          }}
        />
      </label>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            useEditor.getState().commit((d) => ({
              ...d,
              edges: d.edges.map((e) =>
                e.id === edge.id
                  ? {
                      ...e,
                      source: e.target,
                      target: e.source,
                      startLabel: e.endLabel ?? "",
                      endLabel: e.startLabel ?? "",
                    }
                  : e,
              ),
            }));
          }}
        >
          Reverse
        </button>
      </div>
    </Section>
  );
}

function ClassSelection({ diagram, nodes, edges }: SelectionPanelProps): ReactElement {
  const cls = nodes.length === 1 && nodes[0]?.kind === "class" ? nodes[0] : undefined;
  const edge = edges.length === 1 ? edges[0] : undefined;
  return (
    <>
      {cls && <ClassSection node={cls} />}
      {edge && <RelationshipSection diagram={diagram} edge={edge} />}
    </>
  );
}

function ClassSettings({ diagram }: { diagram: Diagram }): ReactElement {
  return (
    <>
      <Section title="Class diagram">
        <TidyButtons directions hint="Parents and interfaces go above the classes that extend them." />
      </Section>
      <ChecksSection
        diagram={diagram}
        empty="Pick Class from the toolbar to begin."
        allClear="No problems found."
      />
      <GuideSection chartType="class" />
    </>
  );
}

const TOOLS: readonly ToolDef[] = [
  SELECT,
  CONNECT,
  { tool: "class", label: "Class", shortcut: "K", icon: <path d="M4 4h16v16H4zM4 9h16M4 14.5h16" /> },
  byTool("note"),
  byTool("text"),
].filter((t): t is ToolDef => t !== undefined);

export const classUi: KindUi = {
  tools: TOOLS,
  SelectionPanel: ClassSelection,
  Settings: ClassSettings,
  onTab: addSubclass,
};
