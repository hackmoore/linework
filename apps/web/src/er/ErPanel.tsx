import type { ReactElement } from "react";
import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { usableLayerId, useEditor } from "../editor/store";
import { CONNECT, SELECT, byTool, type ToolDef } from "../editor/tools";
import { CommitInput } from "../gantt/inputs";
import { ChecksSection, GuideSection, Section, TidyButtons } from "../kinds/KindPanels";
import type { KindUi, SelectionPanelProps } from "../kinds/ui";
import {
  COLUMN_FLAGS,
  parseTable,
  tableLabel,
  type ColumnFlag,
  type TableColumn,
  type TableLabel,
} from "../render/compartments";
import {
  CARDINALITIES,
  CARDINALITY_LABELS,
  cardinalityOf,
  createRelationship,
  createTableNode,
  describeRelationship,
  foreignKeyFor,
  TABLE_COLORS,
  type Cardinality,
} from "./model";

// ---------------------------------------------------------------- actions

export function updateTable(id: string, change: (table: TableLabel) => TableLabel): void {
  useEditor.getState().commit((d) => ({
    ...d,
    nodes: d.nodes.map((n) =>
      n.id === id && n.kind === "table" ? { ...n, label: tableLabel(change(parseTable(n.label))) } : n,
    ),
  }));
}

/** Adds the parent's foreign key column to the child table of a relationship, if missing. */
export function addForeignKey(edge: DiagramEdge): void {
  const d = useEditor.getState().diagram;
  const parent = d?.nodes.find((n) => n.id === edge.source);
  const child = d?.nodes.find((n) => n.id === edge.target);
  if (parent?.kind !== "table" || child?.kind !== "table") return;
  const fk = foreignKeyFor(parseTable(parent.label));
  updateTable(child.id, (t) =>
    t.columns.some((c) => c.name.toLowerCase() === fk.name.toLowerCase())
      ? t
      : { ...t, columns: [...t.columns, fk] },
  );
}

/** Tab: a new child table to the right, related one-to-many, with its foreign key. */
export function addChildTable(parentId: string): boolean {
  const state = useEditor.getState();
  const d = state.diagram;
  const parent = d?.nodes.find((n) => n.id === parentId);
  if (!d || parent?.kind !== "table") return false;
  const parentTable = parseTable(parent.label);
  const tables = d.nodes.filter((n) => n.kind === "table").length;
  const child = createTableNode(
    { name: "new_table", columns: [{ name: "id", type: "uuid", flags: ["PK"] }, foreignKeyFor(parentTable)] },
    0,
    0,
    tables,
  );
  // Beside the parent, below any tables already there.
  const x = parent.x + parent.width + 140;
  const below = d.nodes.filter(
    (n) => n.x < x + child.width && n.x + n.width > x && n.y + n.height > parent.y - 10,
  );
  const y = below.length > 0 ? Math.max(...below.map((n) => n.y + n.height)) + 40 : parent.y;
  const layerId = usableLayerId(d, state.activeLayerId);
  const placed = { ...child, x, y, ...(layerId ? { layerId } : {}) };
  const edge = createRelationship(parent.id, placed.id);
  state.commit((doc) => ({ ...doc, nodes: [...doc.nodes, placed], edges: [...doc.edges, edge] }));
  state.select({ nodeIds: [placed.id] });
  return true;
}

// ---------------------------------------------------------------- inspector

function ColumnRow({
  column,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: {
  column: TableColumn;
  index: number;
  count: number;
  onChange: (column: TableColumn) => void;
  onMove: (by: number) => void;
  onDelete: () => void;
}): ReactElement {
  const toggle = (flag: ColumnFlag): void => {
    onChange({
      ...column,
      flags: column.flags.includes(flag) ? column.flags.filter((f) => f !== flag) : [...column.flags, flag],
    });
  };
  return (
    <li className="er-column">
      <div className="er-column__fields">
        <CommitInput
          key={`n${column.name}`}
          className="input er-column__name"
          label={`Column ${String(index + 1)} name`}
          maxLength={100}
          value={column.name}
          onCommit={(name) => {
            onChange({ ...column, name: name.trim().replace(/\s+/g, "_") || "column" });
          }}
        />
        <CommitInput
          key={`t${column.type}`}
          className="input er-column__type"
          label={`Column ${String(index + 1)} type`}
          maxLength={60}
          placeholder="type"
          value={column.type}
          onCommit={(type) => {
            onChange({ ...column, type: type.trim() });
          }}
        />
      </div>
      <div className="er-column__actions">
        {COLUMN_FLAGS.map((flag) => (
          <button
            key={flag}
            type="button"
            className={`er-flag${column.flags.includes(flag) ? " er-flag--on" : ""}`}
            aria-pressed={column.flags.includes(flag)}
            title={{ PK: "Primary key", FK: "Foreign key", UQ: "Unique", NN: "Not null" }[flag]}
            onClick={() => {
              toggle(flag);
            }}
          >
            {flag}
          </button>
        ))}
        <button
          type="button"
          className="icon-btn"
          aria-label={`Move ${column.name} up`}
          disabled={index === 0}
          onClick={() => {
            onMove(-1);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Move ${column.name} down`}
          disabled={index === count - 1}
          onClick={() => {
            onMove(1);
          }}
        >
          ↓
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          aria-label={`Delete ${column.name}`}
          onClick={onDelete}
        >
          ×
        </button>
      </div>
    </li>
  );
}

function TableSection({ node }: { node: DiagramNode }): ReactElement {
  const table = parseTable(node.label);
  const setColumns = (columns: TableColumn[]): void => {
    updateTable(node.id, (t) => ({ ...t, columns }));
  };
  return (
    <Section title="Table">
      <label className="inspector__field">
        <span className="inspector__label">Name</span>
        <CommitInput
          key={table.name}
          className="input"
          label="Table name"
          maxLength={100}
          value={table.name}
          onCommit={(name) => {
            updateTable(node.id, (t) => ({ ...t, name: name.trim().replace(/\s+/g, "_") || "table" }));
          }}
        />
      </label>
      <div className="inspector__field">
        <span className="inspector__label">Colour</span>
        <div className="swatches" role="group" aria-label="Colour">
          {TABLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${node.stroke === c ? " swatch--active" : ""}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              onClick={() => {
                useEditor.getState().updateNodes([node.id], { stroke: c });
              }}
            />
          ))}
        </div>
      </div>
      <span className="inspector__label">Columns</span>
      <ul className="er-columns">
        {table.columns.map((column, i) => (
          <ColumnRow
            // Columns have no ids; the position and name keep rows stable enough while editing.
            key={`${String(i)}-${column.name}`}
            column={column}
            index={i}
            count={table.columns.length}
            onChange={(next) => {
              setColumns(table.columns.map((c, j) => (j === i ? next : c)));
            }}
            onMove={(by) => {
              const next = [...table.columns];
              const [moved] = next.splice(i, 1);
              if (moved) next.splice(i + by, 0, moved);
              setColumns(next);
            }}
            onDelete={() => {
              setColumns(table.columns.filter((_, j) => j !== i));
            }}
          />
        ))}
      </ul>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setColumns([
              ...table.columns,
              { name: `column_${String(table.columns.length + 1)}`, type: "text", flags: [] },
            ]);
          }}
        >
          + Column
        </button>
        <button
          type="button"
          className="btn btn--sm"
          title="Add a related table with a foreign key to this one (Tab)"
          onClick={() => {
            addChildTable(node.id);
          }}
        >
          + Related table
        </button>
      </div>
      <p className="inspector__hint">
        PK primary key, FK foreign key, UQ unique, NN not null. You can also double-click the table and type
        columns as “name type FLAGS”, one per line.
      </p>
    </Section>
  );
}

function CardinalitySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Cardinality;
  onChange: (value: Cardinality) => void;
}): ReactElement {
  return (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      <select
        className="select"
        value={value}
        onChange={(event) => {
          onChange(event.target.value as Cardinality);
        }}
      >
        {CARDINALITIES.map((c) => (
          <option key={c} value={c}>
            {CARDINALITY_LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );
}

function RelationshipSection({ diagram, edge }: { diagram: Diagram; edge: DiagramEdge }): ReactElement {
  const { updateEdges } = useEditor.getState();
  const nameOf = (id: string): string => {
    const n = diagram.nodes.find((x) => x.id === id);
    return n?.kind === "table" ? parseTable(n.label).name || "table" : (n?.label ?? "shape");
  };
  const source = nameOf(edge.source);
  const target = nameOf(edge.target);
  return (
    <Section title="Relationship">
      <p className="inspector__hint">{describeRelationship(edge, source, target)}</p>
      <div className="inspector__row">
        <CardinalitySelect
          label={`${source} end`}
          value={cardinalityOf(edge.arrowStart)}
          onChange={(arrowStart) => {
            updateEdges([edge.id], { arrowStart });
          }}
        />
        <CardinalitySelect
          label={`${target} end`}
          value={cardinalityOf(edge.arrowEnd)}
          onChange={(arrowEnd) => {
            updateEdges([edge.id], { arrowEnd });
          }}
        />
      </div>
      <label className="inspector__field">
        <span className="inspector__label">Verb</span>
        <CommitInput
          key={edge.label}
          className="input"
          label="Verb"
          maxLength={200}
          placeholder="Such as places or contains"
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
          title={`Add ${foreignKeyFor(parseTable(diagram.nodes.find((n) => n.id === edge.source)?.label ?? "")).name} to ${target}`}
          onClick={() => {
            addForeignKey(edge);
          }}
        >
          Add foreign key to {target}
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            useEditor.getState().commit((d) => ({
              ...d,
              edges: d.edges.map((e) =>
                e.id === edge.id ? { ...e, source: e.target, target: e.source } : e,
              ),
            }));
          }}
        >
          Swap ends
        </button>
      </div>
    </Section>
  );
}

function ErSelection({ diagram, nodes, edges }: SelectionPanelProps): ReactElement {
  const table = nodes.length === 1 && nodes[0]?.kind === "table" ? nodes[0] : undefined;
  const edge = edges.length === 1 ? edges[0] : undefined;
  return (
    <>
      {table && <TableSection node={table} />}
      {edge && <RelationshipSection diagram={diagram} edge={edge} />}
    </>
  );
}

function ErSettings({ diagram }: { diagram: Diagram }): ReactElement {
  return (
    <>
      <Section title="Entity-relationship diagram">
        <TidyButtons directions />
        <p className="inspector__hint">
          Import a schema from SQL (CREATE TABLE statements) in My diagrams, and download it again as SQL from
          Export.
        </p>
      </Section>
      <ChecksSection
        diagram={diagram}
        empty="Pick Table from the toolbar to begin."
        allClear="No problems found. Every table has a primary key."
      />
      <GuideSection chartType="er" />
    </>
  );
}

const TOOLS: readonly ToolDef[] = [
  SELECT,
  CONNECT,
  {
    tool: "table",
    label: "Table",
    shortcut: "B",
    icon: <path d="M3 5h18v14H3zM3 9.5h18M3 14h18M9 9.5V19" />,
  },
  byTool("note"),
  byTool("text"),
].filter((t): t is ToolDef => t !== undefined);

export const erUi: KindUi = {
  tools: TOOLS,
  SelectionPanel: ErSelection,
  Settings: ErSettings,
  onTab: addChildTable,
};
