import type { Diagram, DiagramNode } from "@linework/shared";

/**
 * Table and class shapes keep their structure in their label, so it can be typed, pasted and
 * synced like any other text:
 *
 * - a table's first line is its name and every further line is a column, written
 *   `name type FLAGS`, for example `customer_id uuid FK NN`;
 * - a class's label is split into compartments by lines of `--`: the name (with an optional
 *   `<<interface>>` stereotype line above it), then attributes, then operations.
 */

export const TABLE_HEADER = 34;
export const TABLE_ROW = 26;
export const TABLE_FONT = 13;
export const CLASS_NAME_ROW = 30;
export const CLASS_STEREOTYPE_ROW = 16;
export const CLASS_ROW = 20;
export const CLASS_PAD = 6;
export const CLASS_FONT = 13;
const CHAR = 0.58;

export const COLUMN_FLAGS = ["PK", "FK", "UQ", "NN"] as const;
export type ColumnFlag = (typeof COLUMN_FLAGS)[number];

export interface TableColumn {
  readonly name: string;
  readonly type: string;
  readonly flags: readonly ColumnFlag[];
}

export interface TableLabel {
  readonly name: string;
  readonly columns: readonly TableColumn[];
}

const FLAG_SET = new Set<string>(COLUMN_FLAGS);

export function parseColumn(line: string): TableColumn | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const flags: ColumnFlag[] = [];
  while (tokens.length > 1 && FLAG_SET.has((tokens[tokens.length - 1] ?? "").toUpperCase())) {
    flags.unshift((tokens.pop() ?? "").toUpperCase() as ColumnFlag);
  }
  const name = (tokens.shift() ?? "").replace(/:$/, "");
  return { name, type: tokens.join(" "), flags: [...new Set(flags)] };
}

export function parseTable(label: string): TableLabel {
  const [first = "", ...rest] = label.split("\n");
  return {
    name: first.trim(),
    columns: rest.map(parseColumn).filter((c): c is TableColumn => c !== null),
  };
}

export function columnLine(c: TableColumn): string {
  return [c.name.trim() || "column", c.type.trim(), ...c.flags].filter(Boolean).join(" ");
}

export function tableLabel(t: TableLabel): string {
  return [t.name.trim() || "table", ...t.columns.map(columnLine)].join("\n");
}

export interface ClassLabel {
  /** "interface", "abstract", "enumeration" and so on, without the guillemets; "" for none. */
  readonly stereotype: string;
  readonly name: string;
  readonly attributes: readonly string[];
  readonly operations: readonly string[];
}

const STEREOTYPE = /^(?:<<|«)\s*(.*?)\s*(?:>>|»)$/;

export function parseClass(label: string): ClassLabel {
  const sections: string[][] = [[]];
  for (const raw of label.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "--") sections.push([]);
    else sections[sections.length - 1]?.push(line);
  }
  const head = (sections[0] ?? []).map((l) => l.trim()).filter(Boolean);
  const stereo = head.length > 1 ? STEREOTYPE.exec(head[0] ?? "") : null;
  const clean = (lines: readonly string[] | undefined): string[] =>
    (lines ?? []).map((l) => l.trim()).filter(Boolean);
  return {
    stereotype: stereo?.[1] ?? "",
    name: (stereo ? head.slice(1) : head).join(" "),
    attributes: clean(sections[1]),
    operations: clean(sections.slice(2).flat()),
  };
}

export function classLabel(c: ClassLabel): string {
  return [
    ...(c.stereotype.trim() ? [`<<${c.stereotype.trim()}>>`] : []),
    c.name.trim() || "ClassName",
    "--",
    ...c.attributes,
    "--",
    ...c.operations,
  ].join("\n");
}

/** Height a class compartment takes: at least one empty row's worth. */
export function classSectionHeight(lines: number): number {
  return Math.max(lines, 0.6) * CLASS_ROW + CLASS_PAD * 2;
}

/** The size a table or class shape needs to show its whole label, or null for other shapes. */
export function compartmentSize(node: Pick<DiagramNode, "kind" | "label">): {
  width: number;
  height: number;
} | null {
  if (node.kind === "table") {
    const t = parseTable(node.label);
    const widest = Math.max(
      t.name.length * TABLE_FONT * 0.62 + 24,
      ...t.columns.map(
        (c) => 34 + (c.name.length + c.type.length + 3) * TABLE_FONT * CHAR + (c.flags.length > 1 ? 24 : 0),
      ),
    );
    return {
      width: Math.ceil(Math.max(160, widest)),
      height: TABLE_HEADER + Math.max(1, t.columns.length) * TABLE_ROW + 4,
    };
  }
  if (node.kind === "class") {
    const c = parseClass(node.label);
    const lines = [c.name, ...c.attributes, ...c.operations];
    const widest = Math.max(...lines.map((l) => l.length * CLASS_FONT * CHAR + 24));
    return {
      width: Math.ceil(Math.max(160, widest)),
      height:
        (c.stereotype ? CLASS_STEREOTYPE_ROW : 0) +
        CLASS_NAME_ROW +
        classSectionHeight(c.attributes.length) +
        classSectionHeight(c.operations.length),
    };
  }
  return null;
}

/** Grows or shrinks a table or class shape to fit its label; other shapes are unchanged. */
export function fitCompartments(node: DiagramNode): DiagramNode {
  const size = compartmentSize(node);
  if (!size) return node;
  const width = Math.max(node.width, size.width);
  if (width === node.width && size.height === node.height) return node;
  return { ...node, width, height: size.height };
}

/** Applies `fitCompartments` to every node, keeping the same diagram when nothing changes. */
export function fitAllCompartments(diagram: Diagram): Diagram {
  const nodes = diagram.nodes.map(fitCompartments);
  return nodes.some((n, i) => n !== diagram.nodes[i]) ? { ...diagram, nodes } : diagram;
}
