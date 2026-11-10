import type { Diagram, DiagramEdge, DiagramNode, ShapeKind } from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import type { LayoutDirection } from "../editor/arrange";
import { clusteredLayout, groupMembers, parentGroups } from "../kinds/groups";
import type { KindImportResult, KindIssue, KindModel } from "../kinds/model";
import { center, wrapText } from "../render/geometry";

/*
 * State machines (UML state diagrams): states joined by transitions labelled
 * "event [guard] / action". The shape says what a node is:
 *
 *   initial    the filled dot where the machine (or a composite state) starts
 *   final      the ringed dot where it ends
 *   rounded    a state; meta.entry, meta.do and meta.exit hold its activities
 *   diamond    a choice: the outgoing transition whose guard holds is taken
 *   container  a composite state, holding the states drawn inside it
 */

export const STATE_FILL = "#eef2ff";
export const STATE_STROKE = "#4338ca";
const TRANSITION_STROKE = "#374151";
const ACTIVITIES = ["entry", "do", "exit"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export type StateRole = "initial" | "final" | "state" | "choice" | "composite";

export function roleOf(node: DiagramNode): StateRole | null {
  switch (node.kind) {
    case "initial":
      return "initial";
    case "final":
      return "final";
    case "diamond":
      return "choice";
    case "container":
      return "composite";
    case "rounded":
      return "state";
    default:
      return null;
  }
}

export function stateStyle(kind: ShapeKind): Partial<DiagramNode> {
  switch (kind) {
    case "rounded":
      return {
        fill: STATE_FILL,
        stroke: STATE_STROKE,
        strokeWidth: 1.5,
        width: 150,
        height: 56,
        label: "State",
      };
    case "diamond":
      return { fill: "#ffffff", stroke: STATE_STROKE, strokeWidth: 1.5, width: 44, height: 44, label: "" };
    case "initial":
      return { fill: "#1f2937", stroke: "#1f2937", width: 28, height: 28, label: "" };
    case "final":
      return { fill: "#ffffff", stroke: "#1f2937", strokeWidth: 2, width: 32, height: 32, label: "" };
    case "container":
      return {
        fill: "#f8fafc",
        stroke: STATE_STROKE,
        strokeWidth: 1.5,
        strokePattern: "solid",
        textAlign: "left",
        fontSize: 15,
        label: "Composite state",
      };
    default:
      return {};
  }
}

export function createStateNode(kind: ShapeKind, label?: string): DiagramNode {
  const style = stateStyle(kind);
  return createNode(kind, 0, 0, { ...style, ...(label !== undefined ? { label } : {}) });
}

// ---------------------------------------------------------------- labels

export interface Trigger {
  readonly event: string;
  readonly guard: string;
  readonly action: string;
}

/** Reads "event [guard] / action"; every part is optional. */
export function parseTrigger(label: string): Trigger {
  const text = label.replace(/\s+/g, " ").trim();
  const m = /^([^[/]*?)\s*(?:\[([^\]]*)\])?\s*(?:\/\s*(.*))?$/.exec(text);
  return { event: m?.[1]?.trim() ?? text, guard: m?.[2]?.trim() ?? "", action: m?.[3]?.trim() ?? "" };
}

export function triggerLabel(t: Trigger): string {
  return [
    t.event.trim(),
    t.guard.trim() ? `[${t.guard.trim()}]` : "",
    t.action.trim() ? `/ ${t.action.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function activitiesOf(node: DiagramNode): Record<Activity, string> {
  return { entry: node.meta?.entry ?? "", do: node.meta?.do ?? "", exit: node.meta?.exit ?? "" };
}

/** Meta for a state's activities, shown under its name as "entry / turn on light". */
export function activitiesMeta(
  node: DiagramNode,
  patch: Partial<Record<Activity, string>>,
): Record<string, string> {
  const next = { ...activitiesOf(node), ...patch };
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.meta ?? {}))
    if (!(ACTIVITIES as readonly string[]).includes(k) && k !== "description") meta[k] = v;
  const lines: string[] = [];
  for (const a of ACTIVITIES) {
    const v = next[a].trim();
    if (!v) continue;
    meta[a] = v;
    lines.push(`${a} / ${v}`);
  }
  if (lines.length > 0) meta.description = lines.join("\n");
  return meta;
}

/** States grow to fit their name and activities. */
export function normalizeStates(diagram: Diagram): Diagram {
  const nodes = diagram.nodes.map((n) => {
    if (n.kind !== "rounded") return n;
    const activities = (n.meta?.description ?? "").split("\n").filter(Boolean);
    const small = Math.round(n.fontSize * 0.78);
    const widest = Math.max(
      n.label.length * n.fontSize * 0.62,
      ...activities.map((a) => a.length * small * 0.58),
    );
    const width = Math.round(Math.min(280, Math.max(150, widest + 32)));
    const titleLines = wrapText(n.label, width - 20, n.fontSize).length;
    const activityLines = activities.reduce((sum, a) => sum + wrapText(a, width - 20, small).length, 0);
    const height = Math.round(
      Math.max(
        56,
        titleLines * n.fontSize * 1.3 + activityLines * small * 1.3 + (activityLines > 0 ? 30 : 24),
      ),
    );
    if (n.height === height && n.width === width) return n;
    return { ...n, width, height, x: Math.round(n.x + (n.width - width) / 2) };
  });
  return nodes.some((n, i) => n !== diagram.nodes[i]) ? { ...diagram, nodes } : diagram;
}

/** The way the machine runs: across when most transitions go sideways, otherwise down. */
export function stateDirection(d: Diagram): LayoutDirection {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  let across = 0;
  let down = 0;
  for (const e of d.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t || s === t) continue;
    if (Math.abs(t.x - s.x) > Math.abs(t.y - s.y)) across++;
    else down++;
  }
  return across > down ? "LR" : "TB";
}

export function transition(source: string, target: string, label = ""): DiagramEdge {
  return createEdge(source, target, transitionDefaults(label));
}

export function transitionDefaults(label = ""): Partial<DiagramEdge> {
  return { label, routing: "elbow", arrowEnd: "arrow", stroke: TRANSITION_STROKE, strokeWidth: 1.5 };
}

// ---------------------------------------------------------------- layout and checks

export function tidyStates(
  diagram: Diagram,
  direction: LayoutDirection = "TB",
  members: ReadonlyMap<string, ReadonlySet<string>> = groupMembers(diagram.nodes),
): Diagram {
  const shapes = diagram.nodes.filter((n) => {
    const role = roleOf(n);
    return role !== null && role !== "composite";
  });
  if (shapes.length === 0) return diagram;
  return clusteredLayout(diagram, shapes, members, direction, { rank: 70, node: 60 });
}

const nameOf = (n: DiagramNode | undefined): string =>
  n
    ? n.kind === "initial"
      ? "The start"
      : n.kind === "diamond"
        ? "A choice"
        : n.label || "A state"
    : "A state";

export function stateIssues(diagram: Diagram): KindIssue[] {
  const issues: KindIssue[] = [];
  const nodes = diagram.nodes.filter((n) => roleOf(n) !== null);
  if (nodes.length === 0) return issues;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = parentGroups(groupMembers(diagram.nodes));
  const initials = nodes.filter((n) => n.kind === "initial");
  if (initials.length === 0)
    issues.push({ message: "There's no initial state. Add one where the machine starts." });
  const topInitials = initials.filter((n) => !parent.has(n.id));
  if (topInitials.length > 1)
    issues.push({ message: "There's more than one initial state", nodeIds: topInitials.map((n) => n.id) });

  const outgoing = new Map<string, DiagramEdge[]>();
  for (const e of diagram.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
  }
  // Reachable from an initial state, where entering a composite state reaches its insides
  // and a transition from a composite state can leave from any state inside it.
  const children = new Map<string, string[]>();
  for (const [child, p] of parent) children.set(p, [...(children.get(p) ?? []), child]);
  const reached = new Set<string>();
  const stack = initials.map((n) => n.id);
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || reached.has(id)) continue;
    reached.add(id);
    for (const e of outgoing.get(id) ?? []) stack.push(e.target);
    for (const c of children.get(id) ?? []) if (byId.get(c)?.kind === "initial") stack.push(c);
    const p = parent.get(id);
    if (p && byId.has(p)) stack.push(p);
  }
  const leaves = (id: string): string[] => [id, ...(children.get(id) ?? []).flatMap(leaves)];
  const hasExit = (id: string): boolean => {
    for (let p: string | undefined = id; p; p = parent.get(p))
      if ((outgoing.get(p) ?? []).length > 0) return true;
    return false;
  };
  for (const n of nodes) {
    const name = nameOf(n);
    const out = outgoing.get(n.id) ?? [];
    if (initials.length > 0 && !reached.has(n.id) && n.kind !== "initial")
      issues.push({ message: `${name} can't be reached`, nodeIds: [n.id] });
    if (n.kind === "final" && out.length > 0)
      issues.push({ message: "A final state has transitions out of it", nodeIds: [n.id] });
    if (
      (n.kind === "rounded" || n.kind === "diamond") &&
      !hasExit(n.id) &&
      !leaves(n.id).some((l) => byId.get(l)?.kind === "final")
    )
      issues.push({ message: `${name} has no way out`, nodeIds: [n.id] });
    if (n.kind === "initial" && out.length !== 1)
      issues.push({ message: "An initial state needs exactly one transition out", nodeIds: [n.id] });
    if (n.kind === "diamond") {
      const unguarded = out.filter((e) => !parseTrigger(e.label).guard && !/^else$/i.test(e.label.trim()));
      if (out.length > 0 && unguarded.length > 0)
        issues.push({
          message: "Each branch out of a choice needs a [guard]",
          nodeIds: [n.id],
          edgeIds: unguarded.map((e) => e.id),
        });
    }
    if (n.kind === "rounded" || n.kind === "container") {
      const seen = new Map<string, string>();
      for (const e of out) {
        const t = parseTrigger(e.label);
        if (!t.event || t.guard) continue;
        const other = seen.get(t.event);
        if (other)
          issues.push({
            message: `${name} has two transitions on ${t.event} with no guard`,
            edgeIds: [other, e.id],
          });
        seen.set(t.event, e.id);
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------- Mermaid

export function statesToMermaid(diagram: Diagram): string {
  const nodes = diagram.nodes.filter((n) => roleOf(n) !== null);
  const members = groupMembers(nodes);
  const parent = parentGroups(members);
  const ids = new Map<string, string>();
  nodes.forEach((n, i) => ids.set(n.id, `s${String(i + 1)}`));
  const ref = (id: string): string => {
    const kind = nodes.find((n) => n.id === id)?.kind;
    return kind === "initial" || kind === "final" ? "[*]" : (ids.get(id) ?? id);
  };
  const quote = (s: string): string => s.replaceAll('"', "'").replaceAll("\n", " ");
  const lines = ["stateDiagram-v2"];
  const emitIn = (group: string | undefined, indent: string): void => {
    for (const n of nodes) {
      if (parent.get(n.id) !== group || n.kind === "initial" || n.kind === "final") continue;
      const id = ids.get(n.id) ?? "";
      if (n.kind === "diamond") lines.push(`${indent}state ${id} <<choice>>`);
      else if (n.kind === "container") {
        lines.push(`${indent}state "${quote(n.label)}" as ${id} {`);
        emitIn(n.id, `${indent}  `);
        lines.push(`${indent}}`);
      } else {
        lines.push(`${indent}state "${quote(n.label)}" as ${id}`);
        const description = n.meta?.description;
        if (description) for (const d of description.split("\n")) lines.push(`${indent}${id} : ${quote(d)}`);
      }
    }
    // Transitions go in the innermost group holding both ends, so [*] means the right thing.
    for (const e of diagram.edges) {
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) continue;
      const home =
        s.kind === "initial"
          ? parent.get(s.id)
          : t.kind === "final"
            ? parent.get(t.id)
            : commonGroup(s.id, t.id, parent);
      if (home !== group) continue;
      const label = e.label.trim() ? ` : ${quote(e.label.trim())}` : "";
      lines.push(`${indent}${ref(s.id)} --> ${ref(t.id)}${label}`);
    }
  };
  emitIn(undefined, "  ");
  return `${lines.join("\n")}\n`;
}

function commonGroup(a: string, b: string, parent: ReadonlyMap<string, string>): string | undefined {
  const chain = new Set<string>();
  for (let p = parent.get(a); p; p = parent.get(p)) chain.add(p);
  for (let p = parent.get(b); p; p = parent.get(p)) if (chain.has(p)) return p;
  return undefined;
}

/** Reads Mermaid stateDiagram text: states, choices, composite states and transitions. */
export function importMermaidStates(text: string, title: string): KindImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  if (!/^stateDiagram(?:-v2)?$/.test(lines[0] ?? ""))
    return { ok: false, error: "Not a Mermaid state diagram" };
  const nodes: DiagramNode[] = [];
  const byName = new Map<string, DiagramNode>();
  const members = new Map<string, Set<string>>();
  const groupStack: string[] = [];
  const pseudo = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const inGroup = (node: DiagramNode): void => {
    const g = groupStack[groupStack.length - 1];
    if (!g) return;
    const set = members.get(g) ?? new Set<string>();
    set.add(node.id);
    members.set(g, set);
  };
  const state = (name: string, kind: ShapeKind = "rounded", label = name): DiagramNode => {
    const existing = byName.get(name);
    if (existing) return existing;
    const node = createStateNode(kind, label);
    nodes.push(node);
    byName.set(name, node);
    inGroup(node);
    return node;
  };
  /** [*] is a fresh initial dot as a source and a shared final dot as a target, per group. */
  const star = (asSource: boolean): DiagramNode => {
    const key = `${groupStack.join("/")}:${asSource ? "start" : "end"}`;
    const existing = pseudo.get(key);
    if (existing) return existing;
    const node = createStateNode(asSource ? "initial" : "final");
    nodes.push(node);
    pseudo.set(key, node);
    inGroup(node);
    return node;
  };
  for (const line of lines.slice(1)) {
    if (line === "}") {
      groupStack.pop();
      continue;
    }
    if (/^direction\s+/i.test(line) || /^note\b/i.test(line) || /^classDef\b|^class\b/.test(line)) continue;
    const composite = /^state\s+(?:"([^"]*)"\s+as\s+)?([\w.-]+)\s*\{$/.exec(line);
    if (composite) {
      const name = composite[2] ?? "";
      const existing = byName.get(name);
      let node = existing ?? state(name, "container", composite[1] ?? name);
      if (node.kind !== "container") {
        // Used in a transition before its block: it turns out to be a composite state.
        const converted = {
          ...node,
          ...stateStyle("container"),
          kind: "container" as const,
          label: composite[1] ?? node.label,
          width: 320,
          height: 220,
        };
        nodes[nodes.indexOf(node)] = converted;
        byName.set(name, converted);
        node = converted;
      }
      groupStack.push(node.id);
      continue;
    }
    const decl = /^state\s+(?:"([^"]*)"\s+as\s+)?([\w.-]+)\s*(<<(\w+)>>)?$/.exec(line);
    if (decl) {
      const stereo = decl[4]?.toLowerCase();
      state(decl[2] ?? "", stereo === "choice" ? "diamond" : "rounded", decl[1] ?? decl[2] ?? "");
      continue;
    }
    const arrow = /^(\[\*\]|[\w.-]+)\s*-->\s*(\[\*\]|[\w.-]+)\s*(?::\s*(.*))?$/.exec(line);
    if (arrow) {
      const from = arrow[1] === "[*]" ? star(true) : state(arrow[1] ?? "");
      const to = arrow[2] === "[*]" ? star(false) : state(arrow[2] ?? "");
      edges.push(transition(from.id, to.id, arrow[3]?.trim() ?? ""));
      continue;
    }
    const desc = /^([\w.-]+)\s*:\s*(.+)$/.exec(line);
    if (desc) {
      const node = state(desc[1] ?? "");
      const activity = /^(entry|do|exit)\s*\/\s*(.*)$/i.exec(desc[2] ?? "");
      const i = nodes.indexOf(node);
      if (activity)
        nodes[i] = {
          ...node,
          meta: activitiesMeta(node, { [(activity[1] ?? "").toLowerCase()]: activity[2] ?? "" }),
        };
      else if (node.label === desc[1]) nodes[i] = { ...node, label: desc[2] ?? "" };
      byName.set(desc[1] ?? "", nodes[i] ?? node);
    }
  }
  if (nodes.length === 0) return { ok: false, error: "No states found" };
  if (nodes.length > 2_000) return { ok: false, error: "A state machine can hold 2,000 states" };
  // Composite states go underneath the states drawn inside them.
  const ordered = [
    ...nodes.filter((n) => n.kind === "container"),
    ...nodes.filter((n) => n.kind !== "container"),
  ];
  const base = createDiagram(title || "Imported state machine", "professional", "state");
  return {
    ok: true,
    diagram: normalizeStates(tidyStates({ ...base, nodes: ordered, edges }, "TB", members)),
  };
}

export const stateModel: KindModel = {
  nodeStyle: stateStyle,
  edgeDefaults: () => transitionDefaults("event"),
  tidy: (d, direction) => tidyStates(d, direction),
  normalize: normalizeStates,
  toMermaid: statesToMermaid,
  checks: stateIssues,
  loopFlow: stateDirection,
  importers: [
    {
      matches: (text) => /^\s*stateDiagram(?:-v2)?\s*$/m.test(text.split(/\r?\n/, 1)[0] ?? ""),
      run: importMermaidStates,
    },
  ],
};

/** Where to put a new state after `from`: one step further along, beside existing ones. */
export function nextStateCentre(
  diagram: Diagram,
  from: DiagramNode,
  direction: LayoutDirection,
): { x: number; y: number } {
  const c = center(from);
  const step = direction === "TB" ? { x: 0, y: from.height / 2 + 110 } : { x: from.width / 2 + 160, y: 0 };
  let x = c.x + step.x;
  let y = c.y + step.y;
  const taken = (px: number, py: number): boolean =>
    diagram.nodes.some((n) => Math.abs(center(n).x - px) < 100 && Math.abs(center(n).y - py) < 50);
  for (let i = 0; i < 20 && taken(x, y); i++) {
    if (direction === "TB") x += 190;
    else y += 90;
  }
  return { x, y };
}
