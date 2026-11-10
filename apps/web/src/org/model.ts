import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import type { LayoutDirection } from "../editor/arrange";
import type { KindIssue, KindModel } from "../kinds/model";
import { boundsOf } from "../render/geometry";
import { readTree, treeLayout, type Tree } from "../kinds/tree";
import { parseCsv as csvRows } from "../gantt/io";

/*
 * Org charts are people (cards) joined by reporting lines from manager to report. A person's
 * details live on their card: the label is their name, and meta holds
 *
 *   person      "true", marking the card as a person
 *   subtitle    job title
 *   department  team or department; cards are coloured by it
 *   description the department again, shown on the card
 *   email       optional
 *   vacant      "true" for an open position
 */

export const PERSON_WIDTH = 200;
export const PERSON_HEIGHT = 80;
export const LINE_STROKE = "#9ca3af";
const NO_DEPARTMENT = "#4b5563";
export const DEPARTMENT_COLORS = [
  "#1a56db",
  "#0f766e",
  "#6d28d9",
  "#b45309",
  "#be185d",
  "#0e7490",
  "#4d7c0f",
  "#b91c1c",
] as const;

export interface Person {
  readonly name: string;
  readonly title: string;
  readonly department: string;
  readonly email: string;
  readonly vacant: boolean;
}

export function isPerson(node: DiagramNode): boolean {
  return node.meta?.person === "true";
}

export function personOf(node: DiagramNode): Person | null {
  if (!isPerson(node)) return null;
  return {
    name: node.label,
    title: node.meta?.subtitle ?? "",
    department: node.meta?.department ?? "",
    email: node.meta?.email ?? "",
    vacant: node.meta?.vacant === "true",
  };
}

/** Card fields for a person; colours are set by `colourByDepartment`. */
export function personPatch(p: Person): Partial<DiagramNode> {
  const meta: Record<string, string> = { person: "true" };
  if (p.title.trim()) meta.subtitle = p.title.trim();
  if (p.department.trim()) {
    meta.department = p.department.trim();
    meta.description = p.department.trim();
  }
  if (p.email.trim()) meta.email = p.email.trim();
  if (p.vacant) meta.vacant = "true";
  return {
    label: p.vacant && !p.name.trim() ? "Vacant" : p.name.trim() || "Unnamed",
    meta,
    strokePattern: p.vacant ? "dashed" : "solid",
  };
}

export function createPersonNode(person: Partial<Person> & { name: string }, cx = 0, cy = 0): DiagramNode {
  return createNode("rounded", cx, cy, {
    width: PERSON_WIDTH,
    height: PERSON_HEIGHT,
    fill: "#ffffff",
    stroke: NO_DEPARTMENT,
    strokeWidth: 2,
    textColor: "#1f2937",
    fontSize: 15,
    ...personPatch({ title: "", department: "", email: "", vacant: false, ...person }),
  });
}

export function reportingLine(manager: string, report: string): DiagramEdge {
  return createEdge(manager, report, reportingLineDefaults());
}

export function reportingLineDefaults(): Partial<DiagramEdge> {
  return { routing: "elbow", arrowEnd: "none", stroke: LINE_STROKE, strokeWidth: 1.5 };
}

/** Departments in order of first appearance, top of the chart first. */
export function departments(diagram: Diagram): string[] {
  const people = diagram.nodes.filter(isPerson).sort((a, b) => a.y - b.y || a.x - b.x);
  return [...new Set(people.map((n) => n.meta?.department ?? "").filter(Boolean))];
}

export function departmentColor(diagram: Diagram, department: string): string {
  const i = departments(diagram).indexOf(department);
  return i < 0 ? NO_DEPARTMENT : (DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length] ?? NO_DEPARTMENT);
}

/** Gives every person card its department's colour. */
export function colourByDepartment(diagram: Diagram): Diagram {
  const order = departments(diagram);
  return {
    ...diagram,
    nodes: diagram.nodes.map((n) => {
      if (!isPerson(n)) return n;
      const i = order.indexOf(n.meta?.department ?? "");
      const stroke =
        i < 0 ? NO_DEPARTMENT : (DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length] ?? NO_DEPARTMENT);
      return n.stroke === stroke ? n : { ...n, stroke };
    }),
  };
}

export function orgTree(diagram: Diagram): Tree {
  return readTree(diagram.nodes.filter(isPerson), diagram.edges);
}

/** Lays the chart out as a tree from the top person down (or left to right). */
export function tidyOrg(diagram: Diagram, direction: LayoutDirection = "TB"): Diagram {
  const people = diagram.nodes.filter(isPerson);
  if (people.length === 0) return diagram;
  const tree = orgTree(diagram);
  const origin = boundsOf(people) ?? { x: 0, y: 0 };
  const positions = treeLayout(
    tree.roots,
    tree.children,
    new Map(people.map((n) => [n.id, n])),
    direction,
    direction === "TB" ? { level: 56, sibling: 28 } : { level: 70, sibling: 18 },
    { x: origin.x, y: origin.y },
  );
  return colourByDepartment({
    ...diagram,
    nodes: diagram.nodes.map((n) => {
      const p = positions.get(n.id);
      return p ? { ...n, ...p } : n;
    }),
  });
}

/** The way the chart grows: left to right when most reports sit beside their manager. */
export function orgDirection(d: Diagram): LayoutDirection {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  let below = 0;
  let beside = 0;
  for (const e of d.edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b || !isPerson(a) || !isPerson(b)) continue;
    if (b.y >= a.y + a.height) below++;
    else if (b.x >= a.x + a.width) beside++;
  }
  return beside > below ? "LR" : "TB";
}

const nameOf = (n: DiagramNode | undefined): string => (n && n.label !== "" ? n.label : "Someone");

export function orgIssues(diagram: Diagram): KindIssue[] {
  const issues: KindIssue[] = [];
  const people = diagram.nodes.filter(isPerson);
  const byId = new Map(people.map((n) => [n.id, n]));
  const managers = new Map<string, string[]>();
  for (const e of diagram.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    managers.set(e.target, [...(managers.get(e.target) ?? []), e.id]);
  }
  for (const [id, lines] of managers) {
    if (lines.length > 1)
      issues.push({
        message: `${nameOf(byId.get(id))} reports to ${String(lines.length)} people`,
        nodeIds: [id],
        edgeIds: lines,
      });
  }
  const tree = orgTree(diagram);
  if (tree.roots.length > 1 && people.length > 1) {
    const loose = tree.roots.filter((r) => (tree.children.get(r) ?? []).length === 0);
    for (const id of loose)
      issues.push({ message: `${nameOf(byId.get(id))} doesn't report to anyone`, nodeIds: [id] });
  }
  // Reporting lines that loop back are ignored by the tree; point them out.
  for (const e of diagram.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (tree.parent.get(e.target) !== e.source && (managers.get(e.target) ?? []).length === 1)
      issues.push({ message: `${nameOf(byId.get(e.target))} is in a reporting loop`, edgeIds: [e.id] });
  }
  return issues;
}

// ---------------------------------------------------------------- CSV and Mermaid

const MANAGER = /^(manager|reports? ?to|line manager|supervisor|boss|parent)$/i;
const NAME = /^(name|full ?name|employee|person)$/i;

export function isOrgCsv(text: string): boolean {
  const header = csvRows(text.split(/\r?\n/, 1)[0] ?? "")[0] ?? [];
  return header.some((h) => MANAGER.test(h.trim())) && header.some((h) => NAME.test(h.trim()));
}

type ImportResult = { ok: true; diagram: Diagram } | { ok: false; error: string };

/** Builds an org chart from rows of people: Name, Title, Manager, Department, Email (any order). */
export function importOrgCsv(text: string, title: string): ImportResult {
  const rows = csvRows(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (re: RegExp): number => header.findIndex((h) => re.test(h));
  const name = col(NAME);
  const manager = col(MANAGER);
  if (name < 0 || manager < 0) return { ok: false, error: "Expected Name and Manager columns" };
  const id = col(/^(id|employee ?id|staff ?id)$/i);
  const job = col(/^(title|job ?title|role|position)$/i);
  const dept = col(/^(department|dept|team|division|group)$/i);
  const email = col(/^(e-?mail|email address)$/i);
  const people = rows
    .slice(1)
    .filter((r) => (r[name] ?? "").trim())
    .map((r) => ({
      key: (id >= 0 ? r[id] : r[name])?.trim() ?? "",
      name: r[name]?.trim() ?? "",
      manager: r[manager]?.trim() ?? "",
      title: job >= 0 ? (r[job]?.trim() ?? "") : "",
      department: dept >= 0 ? (r[dept]?.trim() ?? "") : "",
      email: email >= 0 ? (r[email]?.trim() ?? "") : "",
    }));
  if (people.length === 0) return { ok: false, error: "No people found" };
  if (people.length > 5_000) return { ok: false, error: "An org chart can hold 5,000 people" };
  return { ok: true, diagram: buildOrg(title || "Imported org chart", people) };
}

/** People keyed by id or name, with their manager's id or name. */
export function buildOrg(
  title: string,
  people: readonly (Partial<Person> & { key: string; name: string; manager: string })[],
  direction: LayoutDirection = "TB",
  styleId: "professional" | "sketch" = "professional",
): Diagram {
  const nodes = people.map((p) => createPersonNode(p));
  const byKey = new Map<string, string>();
  people.forEach((p, i) => {
    const node = nodes[i];
    if (!node) return;
    byKey.set(p.key.toLowerCase(), node.id);
    if (!byKey.has(p.name.toLowerCase())) byKey.set(p.name.toLowerCase(), node.id);
  });
  const edges = people.flatMap((p, i) => {
    const manager = p.manager ? byKey.get(p.manager.toLowerCase()) : undefined;
    const node = nodes[i];
    return manager && node && manager !== node.id ? [reportingLine(manager, node.id)] : [];
  });
  return tidyOrg({ ...createDiagram(title, styleId, "org"), nodes, edges }, direction);
}

const csvCell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export function orgToCsv(diagram: Diagram): string {
  const tree = orgTree(diagram);
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const lines = ["Name,Title,Department,Email,Manager"];
  for (const node of diagram.nodes) {
    const p = personOf(node);
    if (!p) continue;
    const manager = tree.parent.get(node.id);
    lines.push(
      [p.name, p.title, p.department, p.email, manager ? (byId.get(manager)?.label ?? "") : ""]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function orgToMermaid(diagram: Diagram): string {
  const lines = ["flowchart TD"];
  const ids = new Map<string, string>();
  const people = diagram.nodes.filter(isPerson);
  people.forEach((n, i) => ids.set(n.id, `p${String(i + 1)}`));
  for (const n of people) {
    const p = personOf(n);
    const text = [n.label, p?.title ?? ""].filter(Boolean).join("<br>").replaceAll('"', "#quot;");
    lines.push(`  ${ids.get(n.id) ?? ""}["${text}"]`);
  }
  for (const e of diagram.edges) {
    const a = ids.get(e.source);
    const b = ids.get(e.target);
    if (a && b) lines.push(`  ${a} --- ${b}`);
  }
  return `${lines.join("\n")}\n`;
}

export const orgModel: KindModel = {
  nodeStyle: () => ({}),
  edgeDefaults: () => reportingLineDefaults(),
  tidy: tidyOrg,
  toMermaid: orgToMermaid,
  checks: orgIssues,
  elbowAxis: orgDirection,
  exports: [
    {
      id: "csv",
      label: "CSV",
      hint: "People and managers for Excel or HR tools",
      mime: "text/csv",
      extension: "csv",
      build: orgToCsv,
    },
  ],
  importers: [
    {
      matches: (text, fileName) => /\.csv$/i.test(fileName) && isOrgCsv(text),
      run: importOrgCsv,
    },
  ],
};
