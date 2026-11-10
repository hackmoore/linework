import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import type { ColumnFlag, TableColumn, TableLabel } from "../render/compartments";
import {
  cardinalityOf,
  createRelationship,
  createTableNode,
  singular,
  tablesOf,
  type Cardinality,
} from "./model";

/*
 * SQL DDL in and out. Import reads CREATE TABLE statements (PostgreSQL, MySQL, SQLite and SQL
 * Server flavours) and ALTER TABLE ... FOREIGN KEY; foreign keys become relationships.
 * Export writes CREATE TABLE statements, with foreign keys added at the end so tables can be
 * created in any order.
 */

export function isSql(text: string): boolean {
  return /^\s*(?:--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*create\s+table\b/i.test(text);
}

const unquote = (name: string): string => {
  const last = name.trim().split(".").pop() ?? "";
  return last.replace(/^[`"[]|[`"\]]$/g, "");
};

/** Splits on commas outside parentheses. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const nameList = (text: string): string[] => text.split(",").map(unquote).filter(Boolean);

const TYPE_STOP =
  /^(?:constraint|not|null|primary|unique|references|default|check|generated|auto_increment|autoincrement|collate|identity|comment|on)$/i;

interface ParsedTable {
  name: string;
  columns: { name: string; type: string; flags: Set<ColumnFlag> }[];
  foreignKeys: { columns: string[]; table: string }[];
}

function parseColumn(def: string, table: ParsedTable): void {
  const match = /^(`[^`]+`|"[^"]+"|\[[^\]]+\]|\S+)\s*([\s\S]*)$/.exec(def);
  if (!match) return;
  const name = unquote(match[1] ?? "");
  const rest = match[2] ?? "";
  // The type runs until the first constraint keyword, keeping any (size) together.
  const tokens = rest
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .replace(/\s*,\s*/g, ",")
    .split(/\s+/);
  const typeTokens: string[] = [];
  for (const t of tokens) {
    if (!t || TYPE_STOP.test(t.split("(")[0] ?? "")) break;
    typeTokens.push(t);
  }
  const flags = new Set<ColumnFlag>();
  if (/\bprimary\s+key\b/i.test(rest)) flags.add("PK");
  if (/\bnot\s+null\b/i.test(rest)) flags.add("NN");
  if (/\bunique\b/i.test(rest)) flags.add("UQ");
  const ref = /\breferences\s+(`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w.]+)/i.exec(rest);
  if (ref) {
    flags.add("FK");
    table.foreignKeys.push({ columns: [name], table: unquote(ref[1] ?? "") });
  }
  table.columns.push({ name, type: typeTokens.join(" ").toLowerCase(), flags });
}

function applyConstraint(def: string, table: ParsedTable): boolean {
  const body = def.replace(/^constraint\s+\S+\s+/i, "");
  const pk = /^primary\s+key\s*(?:\w+\s*)?\(([^)]*)\)/i.exec(body);
  if (pk) {
    for (const col of nameList(pk[1] ?? "")) table.columns.find((c) => c.name === col)?.flags.add("PK");
    return true;
  }
  const fk = /^foreign\s+key\s*\(([^)]*)\)\s*references\s+(`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w.]+)/i.exec(body);
  if (fk) {
    const columns = nameList(fk[1] ?? "");
    for (const col of columns) table.columns.find((c) => c.name === col)?.flags.add("FK");
    table.foreignKeys.push({ columns, table: unquote(fk[2] ?? "") });
    return true;
  }
  const unique = /^unique\s*(?:key|index)?\s*(?:\w+\s*)?\(([^)]*)\)/i.exec(body);
  if (unique) {
    const cols = nameList(unique[1] ?? "");
    if (cols.length === 1) table.columns.find((c) => c.name === cols[0])?.flags.add("UQ");
    return true;
  }
  return /^(?:check|key|index|fulltext|spatial|exclude|period)\b/i.test(body);
}

export type SqlImportResult =
  { ok: true; nodes: DiagramNode[]; edges: DiagramEdge[] } | { ok: false; error: string };

export function importSql(text: string): SqlImportResult {
  const sql = text.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const tables: ParsedTable[] = [];
  const create =
    /create\s+(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?(`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w.]+)\s*\(/gi;
  for (let m = create.exec(sql); m; m = create.exec(sql)) {
    let depth = 1;
    let i = create.lastIndex;
    for (; i < sql.length && depth > 0; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") depth--;
    }
    const table: ParsedTable = { name: unquote(m[1] ?? ""), columns: [], foreignKeys: [] };
    for (const def of splitTopLevel(sql.slice(create.lastIndex, i - 1))) {
      if (!applyConstraint(def, table)) parseColumn(def, table);
    }
    tables.push(table);
    create.lastIndex = i;
  }
  if (tables.length === 0) return { ok: false, error: "No CREATE TABLE statements found" };
  if (tables.length > 1_000) return { ok: false, error: "A diagram can hold 1,000 tables" };
  const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t]));
  const alter =
    /alter\s+table\s+(?:only\s+)?(`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w.]+)\s+add\s+(?:constraint\s+\S+\s+)?(foreign\s+key\s*\([^)]*\)\s*references\s+(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w.]+))/gi;
  for (let m = alter.exec(sql); m; m = alter.exec(sql)) {
    const table = byName.get(unquote(m[1] ?? "").toLowerCase());
    if (table) applyConstraint(m[2] ?? "", table);
  }

  const nodes = tables.map((t, i) =>
    createTableNode(
      {
        name: t.name,
        columns: t.columns.map((c) => ({
          name: c.name,
          type: c.type,
          // Primary keys are already unique and not null.
          flags: [...c.flags].filter((f) => !(c.flags.has("PK") && (f === "NN" || f === "UQ"))),
        })),
      },
      0,
      0,
      i,
    ),
  );
  const nodeFor = new Map(tables.map((t, i) => [t, nodes[i]]));
  const edges: DiagramEdge[] = [];
  for (const child of tables) {
    for (const fk of child.foreignKeys) {
      const parent = byName.get(fk.table.toLowerCase());
      const source = parent && nodeFor.get(parent);
      const target = nodeFor.get(child);
      if (!source || !target) continue;
      const cols = child.columns.filter((c) => fk.columns.includes(c.name));
      const required = cols.length > 0 && cols.every((c) => c.flags.has("NN") || c.flags.has("PK"));
      const unique =
        cols.length === 1 &&
        cols.every(
          (c) =>
            c.flags.has("UQ") ||
            (c.flags.has("PK") && child.columns.filter((x) => x.flags.has("PK")).length === 1),
        );
      const from: Cardinality = required ? "one" : "zero-or-one";
      const to: Cardinality = unique ? "zero-or-one" : "zero-or-many";
      edges.push(createRelationship(source.id, target.id, from, to));
    }
  }
  return { ok: true, nodes, edges };
}

// ---------------------------------------------------------------- export

const ident = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;

function columnSql(c: TableColumn, singlePk: boolean): string {
  const parts = [ident(c.name), c.type || "text"];
  if (c.flags.includes("PK") && singlePk) parts.push("PRIMARY KEY");
  else {
    if (c.flags.includes("NN")) parts.push("NOT NULL");
    if (c.flags.includes("UQ")) parts.push("UNIQUE");
  }
  return parts.join(" ");
}

/** The parent table a foreign key column most likely points to, among related tables. */
function referencedTable(column: TableColumn, parents: readonly TableLabel[]): TableLabel | undefined {
  const name = column.name.toLowerCase();
  return (
    parents.find(
      (p) => name === `${singular(p.name)}_id`.toLowerCase() || name === `${p.name}_id`.toLowerCase(),
    ) ??
    parents.find((p) => name.startsWith(singular(p.name).toLowerCase())) ??
    (parents.length === 1 ? parents[0] : undefined)
  );
}

export function schemaToSql(diagram: Diagram): string {
  const tables = tablesOf(diagram);
  const byId = new Map(tables.map((t) => [t.node.id, t.table]));
  const out: string[] = [`-- ${diagram.title}`, ""];
  const foreignKeys: string[] = [];
  for (const { node, table } of tables) {
    const pks = table.columns.filter((c) => c.flags.includes("PK"));
    const lines = table.columns.map((c) => `  ${columnSql(c, pks.length === 1)}`);
    if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.map((c) => ident(c.name)).join(", ")})`);
    out.push(`CREATE TABLE ${ident(table.name)} (`, lines.join(",\n"), ");", "");
    // Parents: tables on the other end of a relationship whose "many" side is this table.
    const parents = diagram.edges.flatMap((e) => {
      if (e.target === node.id && e.source !== node.id) return byId.get(e.source) ?? [];
      if (e.source === node.id && e.target !== node.id && cardinalityOf(e.arrowStart).endsWith("many"))
        return byId.get(e.target) ?? [];
      return [];
    });
    for (const column of table.columns.filter((c) => c.flags.includes("FK"))) {
      const parent = referencedTable(column, parents);
      const pk = parent?.columns.find((c) => c.flags.includes("PK"));
      if (!parent || !pk) continue;
      foreignKeys.push(
        `ALTER TABLE ${ident(table.name)} ADD FOREIGN KEY (${ident(column.name)}) REFERENCES ${ident(parent.name)} (${ident(pk.name)});`,
      );
    }
  }
  return `${[...out, ...foreignKeys].join("\n").trimEnd()}\n`;
}
