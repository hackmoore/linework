import type { ReactElement } from "react";
import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { usableLayerId, useEditor } from "../editor/store";
import { CONNECT, SELECT, byTool, type ToolDef } from "../editor/tools";
import { CommitInput, CommitTextarea } from "../gantt/inputs";
import {
  ChecksSection,
  GuideSection,
  PaletteButton,
  PaletteDivider,
  Section,
  TidyButtons,
} from "../kinds/KindPanels";
import type { KindUi, SelectionPanelProps } from "../kinds/ui";
import {
  C4_INFO,
  C4_TYPES,
  c4Level,
  createBoundaryNode,
  createElementNode,
  elementOf,
  elementPatch,
  LEVEL_NAMES,
  type C4Element,
  type C4Type,
} from "./model";

// ---------------------------------------------------------------- actions

function addNodeAt(node: DiagramNode): void {
  const state = useEditor.getState();
  const layerId = state.diagram ? usableLayerId(state.diagram, state.activeLayerId) : undefined;
  const placed = layerId ? { ...node, layerId } : node;
  state.commit((d) => ({
    ...d,
    // Boundaries go underneath, so the elements inside them stay clickable.
    nodes: placed.kind === "container" ? [placed, ...d.nodes] : [...d.nodes, placed],
  }));
  state.select({ nodeIds: [placed.id] });
}

export function addElement(type: C4Type, at: { x: number; y: number }): void {
  addNodeAt(
    createElementNode(
      type,
      type === "person" ? "User" : `New ${C4_INFO[type].label.toLowerCase()}`,
      at.x,
      at.y,
    ),
  );
}

export function addBoundary(at: { x: number; y: number }): void {
  addNodeAt(createBoundaryNode("Software system", at.x, at.y));
}

/** Changes C4 details on elements, restyling them to match. */
export function updateElements(ids: readonly string[], patch: Partial<C4Element>): void {
  const wanted = new Set(ids);
  useEditor.getState().commit((d) => ({
    ...d,
    nodes: d.nodes.map((n) => {
      const e = wanted.has(n.id) ? elementOf(n) : null;
      if (!e) return n;
      const next = { ...e, ...patch };
      const info = C4_INFO[next.type];
      // Switching to a shape of a different kind takes that type's size too.
      const resize = info.kind !== C4_INFO[e.type].kind ? { width: info.width, height: info.height } : {};
      return { ...n, ...elementPatch(next), ...resize };
    }),
  }));
}

function updateRelationship(edge: DiagramEdge, patch: { label?: string; technology?: string }): void {
  const technology = patch.technology ?? edge.meta?.detail ?? "";
  const { detail: _detail, ...rest } = edge.meta ?? {};
  const meta = technology.trim() ? { ...rest, detail: technology.trim() } : rest;
  useEditor.getState().updateEdges([edge.id], {
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    meta,
  });
}

// ---------------------------------------------------------------- toolbar

const ICONS: Readonly<Record<C4Type, ReactElement>> = {
  person: (
    <path d="M12 3.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM5 20.5v-3.2C5 14.9 7 13 9.4 13h5.2c2.4 0 4.4 1.9 4.4 4.3v3.2z" />
  ),
  system: <rect x="3" y="6" width="18" height="12" rx="2.5" />,
  container: (
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5zM7 10h6M7 13.5h10" />
  ),
  database: (
    <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3zM5 6c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  ),
  component: <path d="M7 5h13v14H7zM4 8h6v3H4zM4 13h6v3H4z" />,
};

function ArchitecturePalette({
  canvasCentre,
}: {
  canvasCentre: () => { x: number; y: number };
}): ReactElement {
  return (
    <>
      <PaletteDivider />
      {C4_TYPES.map((type) => (
        <PaletteButton
          key={type}
          label={`Add ${C4_INFO[type].label.toLowerCase()}`}
          onClick={() => {
            addElement(type, canvasCentre());
          }}
        >
          {ICONS[type]}
        </PaletteButton>
      ))}
      <PaletteButton
        label="Add boundary"
        onClick={() => {
          addBoundary(canvasCentre());
        }}
      >
        <rect x="3" y="4" width="18" height="16" rx="1" strokeDasharray="3 2" />
      </PaletteButton>
    </>
  );
}

const TOOLS: readonly ToolDef[] = [SELECT, CONNECT, byTool("note"), byTool("text")].filter(
  (t): t is ToolDef => t !== undefined,
);

// ---------------------------------------------------------------- inspector

function ElementSection({ nodes }: { nodes: readonly DiagramNode[] }): ReactElement | null {
  const elements = nodes.flatMap((n) => {
    const e = elementOf(n);
    return e ? [{ node: n, element: e }] : [];
  });
  const first = elements[0];
  if (!first) return null;
  const ids = elements.map((x) => x.node.id);
  const types = new Set(elements.map((x) => x.element.type));
  const type = types.size === 1 ? first.element.type : undefined;
  const only = elements.length === 1 ? first : undefined;
  const externals = new Set(elements.map((x) => x.element.external));
  return (
    <Section title={only ? C4_INFO[only.element.type].label : `${String(elements.length)} elements`}>
      <label className="inspector__field">
        <span className="inspector__label">Type</span>
        <select
          className="select"
          value={type ?? ""}
          onChange={(event) => {
            updateElements(ids, { type: event.target.value as C4Type });
          }}
        >
          {type === undefined && <option value="">Mixed</option>}
          {C4_TYPES.map((t) => (
            <option key={t} value={t}>
              {C4_INFO[t].label}
            </option>
          ))}
        </select>
      </label>
      {type !== "component" && type !== "database" && (
        <label className="kanban-settings__done">
          <input
            type="checkbox"
            checked={externals.size === 1 && first.element.external}
            ref={(el) => {
              if (el) el.indeterminate = externals.size > 1;
            }}
            onChange={(event) => {
              updateElements(ids, { external: event.target.checked });
            }}
          />
          Outside the system (external)
        </label>
      )}
      {only && (
        <>
          <label className="inspector__field">
            <span className="inspector__label">Name</span>
            <CommitInput
              key={only.node.label}
              className="input"
              label="Name"
              maxLength={200}
              value={only.node.label}
              onCommit={(label) => {
                useEditor.getState().updateNodes([only.node.id], { label: label.trim() || "Untitled" });
              }}
            />
          </label>
          {C4_INFO[only.element.type].technology && (
            <label className="inspector__field">
              <span className="inspector__label">Technology</span>
              <CommitInput
                key={only.element.technology}
                className="input"
                label="Technology"
                maxLength={200}
                placeholder="Such as React, Go or PostgreSQL"
                value={only.element.technology}
                onCommit={(technology) => {
                  updateElements(ids, { technology });
                }}
              />
            </label>
          )}
          <label className="inspector__field">
            <span className="inspector__label">Description</span>
            <CommitTextarea
              key={only.element.description}
              className="input"
              label="Description"
              value={only.element.description}
              placeholder="What it does, in a sentence"
              onCommit={(description) => {
                updateElements(ids, { description });
              }}
            />
          </label>
        </>
      )}
    </Section>
  );
}

function RelationshipSection({ edges }: { edges: readonly DiagramEdge[] }): ReactElement | null {
  const only = edges.length === 1 ? edges[0] : undefined;
  if (!only) return null;
  return (
    <Section title="Relationship">
      <label className="inspector__field">
        <span className="inspector__label">What it does</span>
        <CommitInput
          key={only.label}
          className="input"
          label="What it does"
          maxLength={500}
          placeholder="Such as Reads orders from"
          value={only.label}
          onCommit={(label) => {
            updateRelationship(only, { label: label.trim() });
          }}
        />
      </label>
      <label className="inspector__field">
        <span className="inspector__label">Technology</span>
        <CommitInput
          key={only.meta?.detail ?? ""}
          className="input"
          label="Technology"
          maxLength={200}
          placeholder="Such as JSON/HTTPS or SQL"
          value={only.meta?.detail ?? ""}
          onCommit={(technology) => {
            updateRelationship(only, { technology });
          }}
        />
      </label>
    </Section>
  );
}

function ArchitectureSelection({ nodes, edges }: SelectionPanelProps): ReactElement {
  return (
    <>
      {nodes.length > 0 && <ElementSection nodes={nodes} />}
      {edges.length > 0 && <RelationshipSection edges={edges} />}
    </>
  );
}

function ArchitectureSettings({ diagram }: { diagram: Diagram }): ReactElement {
  return (
    <>
      <Section title="Architecture diagram">
        <p className="inspector__hint">
          {diagram.nodes.length === 0
            ? "Add people and systems from the toolbar."
            : LEVEL_NAMES[c4Level(diagram)]}
        </p>
        <TidyButtons directions />
      </Section>
      <ChecksSection
        diagram={diagram}
        empty="Add people and systems from the toolbar to begin."
        allClear="No problems found. Every element is described and connected."
      />
      <GuideSection chartType="architecture" />
    </>
  );
}

export const architectureUi: KindUi = {
  tools: TOOLS,
  Palette: ArchitecturePalette,
  SelectionPanel: ArchitectureSelection,
  Settings: ArchitectureSettings,
};
