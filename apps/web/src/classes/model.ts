import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { layeredLayout, withPositions, type LayoutDirection } from "../editor/arrange";
import type { KindImportResult, KindIssue, KindModel } from "../kinds/model";
import { classLabel, fitCompartments, parseClass, type ClassLabel } from "../render/compartments";

/*
 * UML class diagrams: "class" shapes (name, attributes and operations written in the label)
 * joined by relationships. The relationship type is read from the connector's arrowheads and
 * line style, so it survives export and import, and each type has a fixed direction:
 *
 *   inheritance   child  -> parent      solid, hollow triangle at the parent
 *   realization   class  -> interface   dashed, hollow triangle at the interface
 *   composition   whole  -> part        solid, filled diamond at the whole
 *   aggregation   whole  -> part        solid, hollow diamond at the whole
 *   association   from   -> to          solid, open arrow (or none) at the far end
 *   dependency    user   -> used        dashed, open arrow at the used class
 *
 * Multiplicities sit beside the ends in startLabel and endLabel.
 */

export const RELATIONS = [
  "association",
  "inheritance",
  "realization",
  "composition",
  "aggregation",
  "dependency",
] as const;
export type Relation = (typeof RELATIONS)[number];

export const RELATION_LABELS: Readonly<Record<Relation, string>> = {
  association: "Association",
  inheritance: "Inheritance (is a)",
  realization: "Realisation (implements)",
  composition: "Composition (owns)",
  aggregation: "Aggregation (has)",
  dependency: "Dependency (uses)",
};

export const STEREOTYPES = ["", "interface", "abstract", "enumeration"] as const;

const STEREOTYPE_COLORS: Readonly<Record<string, string>> = {
  "": "#1f2937",
  interface: "#6d28d9",
  abstract: "#1a56db",
  enumeration: "#0f766e",
};

export function relationStyle(relation: Relation): Partial<DiagramEdge> {
  const base = { arrowStart: "none", arrowEnd: "none", strokePattern: "solid" } as const;
  switch (relation) {
    case "inheritance":
      return { ...base, arrowEnd: "triangle-open" };
    case "realization":
      return { ...base, arrowEnd: "triangle-open", strokePattern: "dashed" };
    case "composition":
      return { ...base, arrowStart: "diamond" };
    case "aggregation":
      return { ...base, arrowStart: "diamond-open" };
    case "dependency":
      return { ...base, arrowEnd: "arrow", strokePattern: "dashed" };
    case "association":
      return { ...base, arrowEnd: "arrow" };
  }
}

export function relationOf(edge: Pick<DiagramEdge, "arrowStart" | "arrowEnd" | "strokePattern">): Relation {
  if (edge.arrowEnd === "triangle-open" || edge.arrowEnd === "triangle")
    return edge.strokePattern === "solid" ? "inheritance" : "realization";
  if (edge.arrowStart === "diamond") return "composition";
  if (edge.arrowStart === "diamond-open") return "aggregation";
  if (edge.strokePattern !== "solid") return "dependency";
  return "association";
}

export function relationship(
  source: string,
  target: string,
  relation: Relation,
  extra: Partial<DiagramEdge> = {},
): DiagramEdge {
  return createEdge(source, target, {
    routing: "straight",
    stroke: "#374151",
    strokeWidth: 1.5,
    ...relationStyle(relation),
    ...extra,
  });
}

export function classStyle(stereotype: string): Partial<DiagramNode> {
  return { stroke: STEREOTYPE_COLORS[stereotype] ?? "#1f2937", fill: "#ffffff", strokeWidth: 1.5 };
}

export function createClassNode(c: ClassLabel): DiagramNode {
  return fitCompartments(
    createNode("class", 0, 0, { label: classLabel(c), width: 180, ...classStyle(c.stereotype) }),
  );
}

export function classesOf(diagram: Diagram): { node: DiagramNode; cls: ClassLabel }[] {
  return diagram.nodes
    .filter((n) => n.kind === "class")
    .map((node) => ({ node, cls: parseClass(node.label) }));
}

/**
 * Layered layout with parents and interfaces above the classes that extend them, and wholes
 * above their parts.
 */
export function tidyClasses(diagram: Diagram, direction: LayoutDirection = "TB"): Diagram {
  const classes = diagram.nodes.filter((n) => n.kind === "class");
  if (classes.length === 0) return diagram;
  const links = diagram.edges.map((e) => {
    const r = relationOf(e);
    return r === "inheritance" || r === "realization" ? { source: e.target, target: e.source } : e;
  });
  return withPositions(diagram, layeredLayout(classes, links, direction, { rank: 110, node: 70 }, true));
}

export function classIssues(diagram: Diagram): KindIssue[] {
  const issues: KindIssue[] = [];
  const classes = classesOf(diagram);
  const byId = new Map(classes.map((c) => [c.node.id, c]));
  const seen = new Map<string, string>();
  for (const { node, cls } of classes) {
    if (!cls.name) {
      issues.push({ message: "A class has no name", nodeIds: [node.id] });
      continue;
    }
    const other = seen.get(cls.name);
    if (other) issues.push({ message: `Two classes are called ${cls.name}`, nodeIds: [other, node.id] });
    seen.set(cls.name, node.id);
    if (cls.stereotype === "interface" && cls.attributes.length > 0)
      issues.push({ message: `Interface ${cls.name} has attributes`, nodeIds: [node.id] });
  }
  const parents = new Map<string, string[]>();
  for (const e of diagram.edges) {
    const from = byId.get(e.source);
    const to = byId.get(e.target);
    if (!from || !to) continue;
    const r = relationOf(e);
    if (r === "realization" && to.cls.stereotype !== "interface")
      issues.push({
        message: `${from.cls.name} implements ${to.cls.name}, which isn't an interface`,
        edgeIds: [e.id],
      });
    if (r === "inheritance") parents.set(e.source, [...(parents.get(e.source) ?? []), e.target]);
  }
  // Inheritance loops: following parents leads back to where it started.
  for (const start of parents.keys()) {
    const seenIds = new Set<string>();
    const stack = [...(parents.get(start) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || seenIds.has(id)) continue;
      if (id === start) {
        issues.push({
          message: `${byId.get(start)?.cls.name ?? "A class"} inherits from itself`,
          nodeIds: [start],
        });
        break;
      }
      seenIds.add(id);
      stack.push(...(parents.get(id) ?? []));
    }
  }
  return issues;
}

// ---------------------------------------------------------------- Mermaid

const ident = (name: string): string => name.replace(/[^\w]/g, "_") || "Class";
const member = (line: string): string => line.replace(/^([+\-#~])\s+/, "$1");

const ARROWS: Readonly<Record<Relation, string>> = {
  inheritance: "<|--",
  realization: "<|..",
  composition: "*--",
  aggregation: "o--",
  association: "-->",
  dependency: "..>",
};

export function classesToMermaid(diagram: Diagram): string {
  const lines = ["classDiagram"];
  const classes = classesOf(diagram);
  const names = new Map(classes.map((c) => [c.node.id, ident(c.cls.name)]));
  for (const { node, cls } of classes) {
    lines.push(`  class ${names.get(node.id) ?? "Class"} {`);
    if (cls.stereotype) lines.push(`    <<${cls.stereotype}>>`);
    for (const a of cls.attributes) lines.push(`    ${member(a)}`);
    for (const o of cls.operations) lines.push(`    ${member(o)}`);
    lines.push("  }");
  }
  for (const e of diagram.edges) {
    const a = names.get(e.source);
    const b = names.get(e.target);
    if (!a || !b) continue;
    const r = relationOf(e);
    const plainAssociation = r === "association" && e.arrowEnd === "none";
    const arrow = plainAssociation ? "--" : ARROWS[r];
    // Inheritance and realization point at the parent, which Mermaid writes on the left.
    const [left, right, leftMult, rightMult] =
      r === "inheritance" || r === "realization"
        ? [b, a, e.endLabel, e.startLabel]
        : [a, b, e.startLabel, e.endLabel];
    const lm = leftMult ? ` "${leftMult}"` : "";
    const rm = rightMult ? ` "${rightMult}"` : "";
    const label = e.label.trim() ? ` : ${e.label.trim().replaceAll("\n", " ")}` : "";
    lines.push(`  ${left}${lm} ${arrow}${rm} ${right}${label}`);
  }
  return `${lines.join("\n")}\n`;
}

const MERMAID_RELATION =
  /^([\w.]+)\s*(?:"([^"]*)")?\s*(<\|--|<\|\.\.|--\|>|\.\.\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--|\.\.)\s*(?:"([^"]*)")?\s*([\w.]+)\s*(?::\s*(.*))?$/;

/** Reads Mermaid classDiagram text: classes with members, stereotypes and relationships. */
export function importMermaidClasses(text: string, title: string): KindImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  if (!/^classDiagram(?:-v2)?$/.test(lines[0] ?? ""))
    return { ok: false, error: "Not a Mermaid class diagram" };
  const classes = new Map<string, { stereotype: string; attributes: string[]; operations: string[] }>();
  const ensure = (name: string): { stereotype: string; attributes: string[]; operations: string[] } => {
    const existing = classes.get(name);
    if (existing) return existing;
    const created = { stereotype: "", attributes: [], operations: [] };
    classes.set(name, created);
    return created;
  };
  const addMember = (name: string, raw: string): void => {
    const c = ensure(name);
    const m = raw.trim();
    const stereo = /^<<\s*(.*?)\s*>>$/.exec(m);
    if (stereo) c.stereotype = (stereo[1] ?? "").toLowerCase();
    else if (m) (m.includes("(") ? c.operations : c.attributes).push(m.replace(/^([+\-#~])/, "$1 "));
  };
  const rels: {
    from: string;
    to: string;
    relation: Relation;
    plain: boolean;
    start: string;
    end: string;
    label: string;
  }[] = [];
  let open: string | null = null;
  for (const line of lines.slice(1)) {
    if (open) {
      if (line === "}") open = null;
      else addMember(open, line);
      continue;
    }
    const block = /^class\s+([\w.]+)(?:~[^~]*~)?\s*(?:\["[^"]*"\])?\s*(\{)?\s*$/.exec(line);
    if (block) {
      ensure(block[1] ?? "");
      if (block[2]) open = block[1] ?? null;
      continue;
    }
    const annotation = /^<<\s*(.*?)\s*>>\s*([\w.]+)$/.exec(line);
    if (annotation) {
      ensure(annotation[2] ?? "").stereotype = (annotation[1] ?? "").toLowerCase();
      continue;
    }
    const rel = parseRelation(line);
    if (rel) {
      rels.push(rel);
      ensure(rel.from);
      ensure(rel.to);
      continue;
    }
    const memberLine = /^([\w.]+)\s*:\s*(.+)$/.exec(line);
    if (memberLine) addMember(memberLine[1] ?? "", memberLine[2] ?? "");
  }
  if (classes.size === 0) return { ok: false, error: "No classes found" };
  const ids = new Map<string, string>();
  const nodes = [...classes].map(([name, c]) => {
    const node = createClassNode({ name, ...c });
    ids.set(name, node.id);
    return node;
  });
  const edges = rels.flatMap((r) => {
    const source = ids.get(r.from);
    const target = ids.get(r.to);
    if (!source || !target) return [];
    return [
      relationship(source, target, r.relation, {
        label: r.label,
        ...(r.plain ? { arrowEnd: "none" as const } : {}),
        ...(r.start ? { startLabel: r.start.slice(0, 100) } : {}),
        ...(r.end ? { endLabel: r.end.slice(0, 100) } : {}),
      }),
    ];
  });
  const base = createDiagram(title || "Imported classes", "professional", "class");
  return { ok: true, diagram: tidyClasses({ ...base, nodes, edges }) };
}

/** One Mermaid relationship line, turned the way Linework draws that relation. */
function parseRelation(line: string): {
  from: string;
  to: string;
  relation: Relation;
  plain: boolean;
  start: string;
  end: string;
  label: string;
} | null {
  const m = MERMAID_RELATION.exec(line);
  if (!m) return null;
  const [, a = "", am = "", arrow = "", bm = "", b = "", label = ""] = m;
  const forward = (relation: Relation, plain = false): ReturnType<typeof parseRelation> => ({
    from: a,
    to: b,
    relation,
    plain,
    start: am,
    end: bm,
    label: label.trim(),
  });
  const backward = (relation: Relation): ReturnType<typeof parseRelation> => ({
    from: b,
    to: a,
    relation,
    plain: false,
    start: bm,
    end: am,
    label: label.trim(),
  });
  switch (arrow) {
    case "<|--":
      return backward("inheritance");
    case "--|>":
      return forward("inheritance");
    case "<|..":
      return backward("realization");
    case "..|>":
      return forward("realization");
    case "*--":
      return forward("composition");
    case "--*":
      return backward("composition");
    case "o--":
      return forward("aggregation");
    case "--o":
      return backward("aggregation");
    case "-->":
      return forward("association");
    case "<--":
      return backward("association");
    case "..>":
      return forward("dependency");
    case "<..":
      return backward("dependency");
    case "..":
      return forward("dependency");
    default:
      return forward("association", true);
  }
}

export const classModel: KindModel = {
  nodeStyle: (kind) => (kind === "class" ? classStyle("") : {}),
  edgeDefaults: () => ({
    routing: "straight",
    stroke: "#374151",
    strokeWidth: 1.5,
    ...relationStyle("association"),
  }),
  tidy: tidyClasses,
  toMermaid: classesToMermaid,
  checks: classIssues,
  importers: [
    {
      matches: (text) => /^\s*classDiagram(?:-v2)?\s*$/m.test(text.split(/\r?\n/, 1)[0] ?? ""),
      run: importMermaidClasses,
    },
  ],
};
