import type { Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { createNode } from "../diagram/factory";
import type { LayoutDirection } from "../editor/arrange";
import { clusteredLayout, groupMembers } from "../kinds/groups";
import type { KindIssue, KindModel } from "../kinds/model";

/*
 * Architecture diagrams follow the C4 model (c4model.com): people and software systems at the
 * top level, containers (apps, services, databases) inside a system, and components inside a
 * container, joined by labelled relationships. Each element keeps its C4 details on the node:
 *
 *   meta.c4          person | system | container | database | component | boundary
 *   meta.external    "true" for people and systems outside the one being described
 *   meta.technology  for containers, databases and components, such as "React" or "PostgreSQL"
 *   meta.description what it does
 *   meta.subtitle    the "[Container: React]" line, kept in step with the above
 *
 * Relationships keep their technology (such as "JSON/HTTPS") in edge meta.detail.
 */

export const C4_TYPES = ["person", "system", "container", "database", "component"] as const;
export type C4Type = (typeof C4_TYPES)[number];
export type C4Kind = C4Type | "boundary";

interface C4Info {
  readonly label: string;
  readonly kind: DiagramNode["kind"];
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly width: number;
  readonly height: number;
  /** Whether a technology is part of its description. */
  readonly technology: boolean;
}

/** Standard C4 colours. */
export const C4_INFO: Readonly<Record<C4Type, C4Info>> = {
  person: {
    label: "Person",
    kind: "person",
    fill: "#08427b",
    stroke: "#052e56",
    text: "#ffffff",
    width: 200,
    height: 170,
    technology: false,
  },
  system: {
    label: "Software system",
    kind: "rounded",
    fill: "#1168bd",
    stroke: "#0b4884",
    text: "#ffffff",
    width: 240,
    height: 140,
    technology: false,
  },
  container: {
    label: "Container",
    kind: "rounded",
    fill: "#438dd5",
    stroke: "#2e6295",
    text: "#ffffff",
    width: 240,
    height: 140,
    technology: true,
  },
  database: {
    label: "Database",
    kind: "cylinder",
    fill: "#438dd5",
    stroke: "#2e6295",
    text: "#ffffff",
    width: 220,
    height: 150,
    technology: true,
  },
  component: {
    label: "Component",
    kind: "rounded",
    fill: "#85bbf0",
    stroke: "#5d82a8",
    text: "#000000",
    width: 220,
    height: 130,
    technology: true,
  },
};

const EXTERNAL = { fill: "#8a8a8a", stroke: "#6b6b6b", text: "#ffffff" } as const;
const EXTERNAL_PERSON = { fill: "#6b6b6b", stroke: "#4d4d4d", text: "#ffffff" } as const;
export const BOUNDARY_STYLE = { stroke: "#4b5563", text: "#374151" } as const;
export const RELATIONSHIP_STROKE = "#6b7280";

export interface C4Element {
  readonly type: C4Type;
  readonly external: boolean;
  readonly technology: string;
  readonly description: string;
}

export function c4KindOf(node: DiagramNode): C4Kind | null {
  const value = node.meta?.c4;
  if (value === "boundary") return "boundary";
  return (C4_TYPES as readonly string[]).includes(value ?? "") ? (value as C4Type) : null;
}

export function elementOf(node: DiagramNode): C4Element | null {
  const kind = c4KindOf(node);
  if (!kind || kind === "boundary") return null;
  return {
    type: kind,
    external: node.meta?.external === "true",
    technology: node.meta?.technology ?? "",
    description: node.meta?.description ?? "",
  };
}

/** The bracketed line under an element's name, such as "[Container: React]". */
export function c4Subtitle(e: C4Element): string {
  const tech = C4_INFO[e.type].technology && e.technology.trim() ? `: ${e.technology.trim()}` : "";
  switch (e.type) {
    case "person":
      return e.external ? "[External person]" : "[Person]";
    case "system":
      return e.external ? "[External system]" : "[Software System]";
    case "container":
      return `[${e.external ? "External container" : "Container"}${tech}]`;
    case "database":
      return `[Database${tech}]`;
    case "component":
      return `[Component${tech}]`;
  }
}

/** Node fields for an element: shape, colours and meta, keeping its position and name. */
export function elementPatch(e: C4Element): Partial<DiagramNode> {
  const info = C4_INFO[e.type];
  const colours =
    e.external && e.type !== "component" && e.type !== "database"
      ? e.type === "person"
        ? EXTERNAL_PERSON
        : EXTERNAL
      : info;
  const meta: Record<string, string> = { c4: e.type, subtitle: c4Subtitle(e) };
  if (e.external) meta.external = "true";
  if (info.technology && e.technology.trim()) meta.technology = e.technology.trim();
  if (e.description.trim()) meta.description = e.description.trim();
  return {
    kind: info.kind,
    fill: colours.fill,
    stroke: colours.stroke,
    textColor: colours.text,
    strokeWidth: 1.5,
    strokePattern: "solid",
    meta,
  };
}

export function createElementNode(
  type: C4Type,
  name: string,
  cx: number,
  cy: number,
  details: Partial<Omit<C4Element, "type">> = {},
): DiagramNode {
  const info = C4_INFO[type];
  return createNode(info.kind, cx, cy, {
    label: name,
    width: info.width,
    height: info.height,
    fontSize: 16,
    ...elementPatch({ type, external: false, technology: "", description: "", ...details }),
  });
}

export function createBoundaryNode(name: string, cx: number, cy: number): DiagramNode {
  return createNode("container", cx, cy, {
    label: name,
    width: 520,
    height: 340,
    fill: "transparent",
    stroke: BOUNDARY_STYLE.stroke,
    textColor: BOUNDARY_STYLE.text,
    strokeWidth: 1.5,
    strokePattern: "dashed",
    fontSize: 15,
    textAlign: "left",
    meta: { c4: "boundary" },
  });
}

export function relationshipDefaults(): Partial<DiagramEdge> {
  return {
    label: "Uses",
    stroke: RELATIONSHIP_STROKE,
    strokeWidth: 1.5,
    arrowEnd: "arrow",
    routing: "straight",
  };
}

/** Which C4 diagram this is, from the most detailed element in it. */
export function c4Level(diagram: Diagram): "context" | "container" | "component" {
  const kinds = new Set(diagram.nodes.map(c4KindOf));
  if (kinds.has("component")) return "component";
  if (kinds.has("container") || kinds.has("database")) return "container";
  return "context";
}

export const LEVEL_NAMES = {
  context: "System context diagram (C4 level 1)",
  container: "Container diagram (C4 level 2)",
  component: "Component diagram (C4 level 3)",
} as const;

/**
 * Lays elements out in layers along their relationships, keeping members of a boundary
 * together, then fits each boundary around its members.
 */
export function tidyArchitecture(
  diagram: Diagram,
  direction: LayoutDirection = "TB",
  /** Boundary membership, when it can't be read from positions (a diagram being built). */
  members: ReadonlyMap<string, ReadonlySet<string>> = groupMembers(diagram.nodes),
): Diagram {
  const elements = diagram.nodes.filter((n) => c4KindOf(n) !== null && c4KindOf(n) !== "boundary");
  if (elements.length === 0) return diagram;
  return clusteredLayout(diagram, elements, members, direction, { rank: 120, node: 140 });
}

const describeNode = (n: DiagramNode | undefined): string => (n?.label.split("\n")[0] ?? "") || "Untitled";

export function architectureIssues(diagram: Diagram): KindIssue[] {
  const issues: KindIssue[] = [];
  const connected = new Set(diagram.edges.flatMap((e) => [e.source, e.target]));
  for (const node of diagram.nodes) {
    const e = elementOf(node);
    if (!e) continue;
    const name = describeNode(node);
    if (!e.description) issues.push({ message: `${name} has no description`, nodeIds: [node.id] });
    if (C4_INFO[e.type].technology && !e.technology)
      issues.push({ message: `${name} has no technology`, nodeIds: [node.id] });
    if (!connected.has(node.id))
      issues.push({ message: `${name} isn't connected to anything`, nodeIds: [node.id] });
  }
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  for (const edge of diagram.edges) {
    if (edge.label.trim()) continue;
    const message = `${describeNode(byId.get(edge.source))} → ${describeNode(byId.get(edge.target))} has no label`;
    issues.push({ message, edgeIds: [edge.id] });
  }
  return issues;
}

// ---------------------------------------------------------------- Mermaid

const quote = (s: string): string => `"${s.replaceAll('"', "'").replaceAll("\n", " ")}"`;

/** Exports as Mermaid's C4 syntax, with boundaries nested as in the diagram. */
export function architectureToMermaid(diagram: Diagram): string {
  const level = c4Level(diagram);
  const header = level === "component" ? "C4Component" : level === "container" ? "C4Container" : "C4Context";
  const lines = [header, `title ${diagram.title.replaceAll("\n", " ")}`];
  const ids = new Map<string, string>();
  diagram.nodes.forEach((n, i) => ids.set(n.id, `${c4KindOf(n) === "boundary" ? "b" : "e"}${String(i + 1)}`));
  const members = groupMembers(diagram.nodes.filter((n) => c4KindOf(n) !== null));
  const inGroup = new Set([...members.values()].flatMap((s) => [...s]));
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));

  const emit = (node: DiagramNode, indent: string): void => {
    const id = ids.get(node.id) ?? node.id;
    const kind = c4KindOf(node);
    if (kind === "boundary") {
      lines.push(`${indent}System_Boundary(${id}, ${quote(node.label)}) {`);
      for (const childId of members.get(node.id) ?? []) {
        const child = byId.get(childId);
        if (child) emit(child, `${indent}  `);
      }
      lines.push(`${indent}}`);
      return;
    }
    const e = elementOf(node);
    if (!e) return;
    const ext = e.external ? "_Ext" : "";
    const name = quote(node.label);
    const desc = quote(e.description);
    const tech = quote(e.technology);
    if (e.type === "person") lines.push(`${indent}Person${ext}(${id}, ${name}, ${desc})`);
    else if (e.type === "system") lines.push(`${indent}System${ext}(${id}, ${name}, ${desc})`);
    else if (e.type === "container") lines.push(`${indent}Container${ext}(${id}, ${name}, ${tech}, ${desc})`);
    else if (e.type === "database")
      lines.push(`${indent}ContainerDb${ext}(${id}, ${name}, ${tech}, ${desc})`);
    else lines.push(`${indent}Component${ext}(${id}, ${name}, ${tech}, ${desc})`);
  };
  for (const node of diagram.nodes) {
    if (c4KindOf(node) !== null && !inGroup.has(node.id)) emit(node, "");
  }
  for (const edge of diagram.edges) {
    const from = ids.get(edge.source);
    const to = ids.get(edge.target);
    if (!from || !to) continue;
    const tech = edge.meta?.detail ? `, ${quote(edge.meta.detail)}` : "";
    lines.push(`Rel(${from}, ${to}, ${quote(edge.label || "Uses")}${tech})`);
  }
  return `${lines.join("\n")}\n`;
}

export const architectureModel: KindModel = {
  nodeStyle: (kind) => {
    if (kind !== "container") return {};
    const {
      id: _id,
      x: _x,
      y: _y,
      kind: _kind,
      layerId: _layer,
      ...style
    } = createBoundaryNode("System", 0, 0);
    return style;
  },
  edgeDefaults: () => relationshipDefaults(),
  tidy: tidyArchitecture,
  toMermaid: architectureToMermaid,
  checks: architectureIssues,
};
