import type { Arrowhead, Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { layeredLayout, withPositions, type LayoutDirection } from "../editor/arrange";
import type { KindIssue, KindModel } from "../kinds/model";
import {
  fitCompartments,
  parseTable,
  tableLabel,
  type TableColumn,
  type TableLabel,
} from "../render/compartments";
import { importSql, isSql, schemaToSql } from "./sql";

/*
 * Entity-relationship diagrams are tables ("table" shapes, columns written in the label) joined
 * by relationships whose ends show cardinality with crow's foot arrowheads. A relationship is
 * drawn from the parent (the table being referenced) to the child (the table holding the
 * foreign key), so the defaults read "one customer has zero or many orders".
 */

export const CARDINALITIES = ["one", "zero-or-one", "one-or-many", "zero-or-many"] as const;
export type Cardinality = (typeof CARDINALITIES)[number];

export const CARDINALITY_LABELS: Readonly<Record<Cardinality, string>> = {
  one: "exactly one",
  "zero-or-one": "zero or one",
  "one-or-many": "one or many",
  "zero-or-many": "zero or many",
};

export const TABLE_COLORS = ["#1a56db", "#0f766e", "#6d28d9", "#b45309", "#be185d", "#4b5563"] as const;
export const RELATIONSHIP_STROKE = "#4b5563";

export function isCardinality(value: Arrowhead): value is Cardinality {
  return (CARDINALITIES as readonly string[]).includes(value);
}

/** An arrowhead read as a cardinality; anything else counts as "exactly one". */
export function cardinalityOf(value: Arrowhead): Cardinality {
  return isCardinality(value) ? value : "one";
}

export function createTableNode(table: TableLabel, cx: number, cy: number, colorIndex = 0): DiagramNode {
  return fitCompartments(
    createNode("table", cx, cy, {
      label: tableLabel(table),
      stroke: TABLE_COLORS[colorIndex % TABLE_COLORS.length] ?? TABLE_COLORS[0],
      fill: "#ffffff",
      strokeWidth: 1.5,
      width: 220,
    }),
  );
}

export function relationshipDefaults(
  from: Cardinality = "one",
  to: Cardinality = "zero-or-many",
): Partial<DiagramEdge> {
  return {
    label: "",
    routing: "elbow",
    arrowStart: from,
    arrowEnd: to,
    stroke: RELATIONSHIP_STROKE,
    strokeWidth: 1.5,
  };
}

export function createRelationship(
  source: string,
  target: string,
  from: Cardinality = "one",
  to: Cardinality = "zero-or-many",
  label = "",
): DiagramEdge {
  return createEdge(source, target, { ...relationshipDefaults(from, to), label });
}

export function tablesOf(diagram: Diagram): { node: DiagramNode; table: TableLabel }[] {
  return diagram.nodes
    .filter((n) => n.kind === "table")
    .map((node) => ({ node, table: parseTable(node.label) }));
}

/** A plain-English reading of a relationship: "Each customers has zero or many orders". */
export function describeRelationship(edge: DiagramEdge, source: string, target: string): string {
  const to = CARDINALITY_LABELS[cardinalityOf(edge.arrowEnd)];
  const from = CARDINALITY_LABELS[cardinalityOf(edge.arrowStart)];
  const verb = edge.label.trim() || "has";
  return `Each ${source} ${verb} ${to} ${target}. Each ${target} belongs to ${from} ${source}.`;
}

/** Singular-ish form of a table name, for foreign key column names. */
export function singular(name: string): string {
  if (/ies$/i.test(name)) return name.replace(/ies$/i, "y");
  if (/(ss|us)$/i.test(name)) return name;
  if (/(ses|xes|ches|shes)$/i.test(name)) return name.replace(/es$/i, "");
  return name.replace(/s$/i, "");
}

/** The foreign key column a child table would use for a parent: "customer_id uuid FK". */
export function foreignKeyFor(parent: TableLabel): TableColumn {
  const pk = parent.columns.find((c) => c.flags.includes("PK"));
  return {
    name: `${singular(parent.name)}_${pk?.name ?? "id"}`,
    type: pk?.type ?? "",
    flags: ["FK", "NN"],
  };
}

export function tidyEr(diagram: Diagram, direction: LayoutDirection = "LR"): Diagram {
  const tables = diagram.nodes.filter((n) => n.kind === "table");
  if (tables.length === 0) return diagram;
  return withPositions(
    diagram,
    layeredLayout(tables, diagram.edges, direction, { rank: 140, node: 60 }, true),
  );
}

export function erIssues(diagram: Diagram): KindIssue[] {
  const issues: KindIssue[] = [];
  const tables = tablesOf(diagram);
  const related = new Set(diagram.edges.flatMap((e) => [e.source, e.target]));
  const seen = new Map<string, string>();
  for (const { node, table } of tables) {
    const name = table.name || "Untitled table";
    const lower = name.toLowerCase();
    const other = seen.get(lower);
    if (other) issues.push({ message: `Two tables are called ${name}`, nodeIds: [other, node.id] });
    seen.set(lower, node.id);
    if (table.columns.length === 0) issues.push({ message: `${name} has no columns`, nodeIds: [node.id] });
    else if (!table.columns.some((c) => c.flags.includes("PK")))
      issues.push({ message: `${name} has no primary key`, nodeIds: [node.id] });
    const names = table.columns.map((c) => c.name.toLowerCase());
    const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    for (const d of dupes)
      issues.push({ message: `${name} has two columns called ${d}`, nodeIds: [node.id] });
    if (table.columns.some((c) => c.flags.includes("FK")) && !related.has(node.id))
      issues.push({ message: `${name} has a foreign key but no relationship`, nodeIds: [node.id] });
  }
  const byId = new Map(tables.map((t) => [t.node.id, t.table.name]));
  for (const edge of diagram.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (!isCardinality(edge.arrowStart) || !isCardinality(edge.arrowEnd)) {
      issues.push({
        message: `${byId.get(edge.source) ?? ""} – ${byId.get(edge.target) ?? ""} is missing a cardinality`,
        edgeIds: [edge.id],
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------- Mermaid

const LEFT: Readonly<Record<Cardinality, string>> = {
  one: "||",
  "zero-or-one": "|o",
  "one-or-many": "}|",
  "zero-or-many": "}o",
};
const RIGHT: Readonly<Record<Cardinality, string>> = {
  one: "||",
  "zero-or-one": "o|",
  "one-or-many": "|{",
  "zero-or-many": "o{",
};

const entityName = (name: string): string => name.replace(/[^\w-]/g, "_") || "table";
const attrWord = (word: string): string => word.replace(/[\s,]+/g, "_").replace(/[^\w\-()[\]]/g, "") || "x";

export function erToMermaid(diagram: Diagram): string {
  const lines = ["erDiagram"];
  const tables = tablesOf(diagram);
  const names = new Map(tables.map((t) => [t.node.id, entityName(t.table.name)]));
  for (const { table } of tables) {
    lines.push(`  ${entityName(table.name)} {`);
    for (const c of table.columns) {
      const keys = c.flags
        .map((f) => (f === "UQ" ? "UK" : f))
        .filter((f) => f === "PK" || f === "FK" || f === "UK");
      lines.push(
        `    ${attrWord(c.type || "string")} ${attrWord(c.name)}${keys.length > 0 ? ` ${keys.join(", ")}` : ""}`,
      );
    }
    lines.push("  }");
  }
  for (const edge of diagram.edges) {
    const a = names.get(edge.source);
    const b = names.get(edge.target);
    if (!a || !b) continue;
    const label = edge.label.trim().replaceAll('"', "'") || "has";
    lines.push(
      `  ${a} ${LEFT[cardinalityOf(edge.arrowStart)]}--${RIGHT[cardinalityOf(edge.arrowEnd)]} ${b} : "${label}"`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export const erModel: KindModel = {
  nodeStyle: (kind) =>
    kind === "table" ? { stroke: TABLE_COLORS[0], strokeWidth: 1.5, fill: "#ffffff" } : {},
  edgeDefaults: () => relationshipDefaults(),
  tidy: tidyEr,
  toMermaid: erToMermaid,
  checks: erIssues,
  exports: [
    {
      id: "sql",
      label: "SQL",
      hint: "CREATE TABLE statements",
      mime: "application/sql",
      extension: "sql",
      build: schemaToSql,
    },
  ],
  importers: [
    {
      matches: (text, fileName) => /\.sql$/i.test(fileName) || isSql(text),
      run: (text, title) => {
        const result = importSql(text);
        if (!result.ok) return result;
        const base = createDiagram(title || "Imported schema", "professional", "er");
        return { ok: true, diagram: tidyEr({ ...base, nodes: result.nodes, edges: result.edges }) };
      },
    },
  ],
};
