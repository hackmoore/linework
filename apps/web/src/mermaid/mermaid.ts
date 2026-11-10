import {
  fromDayNumber,
  isValidIsoDate,
  toDayNumber,
  type Arrowhead,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type GanttSection,
  type GanttTask,
  type ShapeKind,
  type StrokePattern,
} from "@linework/shared";
import { createDiagram, createEdge, createNode, defaultSize } from "../diagram/factory";
import type { LayoutDirection } from "../editor/arrange";
import { createGanttData, createSection, createTask, finishToStart } from "../gantt/model";
import { autoSchedule, calendarOf, placeAt, spanOf } from "../gantt/schedule";
import { kanbanToMermaid, parseMermaidKanban } from "../kanban/io";
import { roadmapToMermaid } from "../roadmap/io";
import { tidyFlowchart } from "../flowchart/layout";
import { createFlowchartData, createFlowLane, flowNodeStyle, laneOf } from "../flowchart/model";
import { kindModel } from "../kinds/registry";
import { boundsOf } from "../render/geometry";

/*
 * Mermaid (https://mermaid.js.org) text import and export. Supports the parts of the
 * flowchart, gantt and kanban syntaxes that map onto Linework's objects; unsupported lines
 * (styling, classes, click handlers) are skipped rather than failing the import.
 */

export type MermaidResult = { ok: true; diagram: Diagram; skipped: number } | { ok: false; error: string };

function statements(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/%%.*$/, "").trim())
    .filter(Boolean);
}

export function parseMermaid(text: string): MermaidResult {
  const lines = statements(text);
  const header = lines[0]?.toLowerCase() ?? "";
  // Kanban depends on indentation (and may start with front matter), so it reads the raw text.
  if (/^kanban\b/.test(header) || (header === "---" && lines.some((l) => /^kanban\b/i.test(l)))) {
    const result = parseMermaidKanban(text);
    return result.ok ? { ...result, skipped: 0 } : result;
  }
  if (/^(flowchart|graph)\b/.test(header)) return parseFlowchart(lines);
  if (/^gantt\b/.test(header)) return parseGantt(lines);
  return {
    ok: false,
    error: "Only Mermaid flowcharts (flowchart/graph), gantt charts and kanban boards are supported",
  };
}

// ---------------------------------------------------------------- flowchart import

const SHAPES: readonly (readonly [string, string, ShapeKind])[] = [
  ["([", "])", "terminal"],
  ["[[", "]]", "subroutine"],
  ["[(", ")]", "cylinder"],
  ["((", "))", "ellipse"],
  ["{{", "}}", "hexagon"],
  ["[/", "/]", "parallelogram"],
  ["[\\", "\\]", "parallelogram"],
  ["[/", "\\]", "parallelogram"],
  ["[\\", "/]", "parallelogram"],
  ["[", "]", "rectangle"],
  ["(", ")", "rounded"],
  ["{", "}", "diamond"],
  [">", "]", "parallelogram"],
];

interface ParsedNode {
  id: string;
  label: string | null;
  kind: ShapeKind | null;
}

interface ParsedLink {
  label: string;
  pattern: StrokePattern;
  width: number;
  arrowStart: Arrowhead;
  arrowEnd: Arrowhead;
}

function cleanLabel(raw: string): string {
  let label = raw.trim();
  if (label.startsWith('"') && label.endsWith('"') && label.length >= 2) label = label.slice(1, -1);
  return label
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/#quot;/g, '"')
    .replace(/#35;/g, "#")
    .slice(0, 5_000);
}

/** Reads one node reference (`id`, `id[label]`, `id((label))`, ...) at `pos`. */
function readNode(s: string, pos: number): { node: ParsedNode; end: number } | null {
  const idMatch = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*/u.exec(s.slice(pos));
  if (!idMatch) return null;
  const id = idMatch[0];
  let end = pos + id.length;
  for (const [open, close, kind] of SHAPES) {
    if (!s.startsWith(open, end)) continue;
    const textStart = end + open.length;
    // Quoted labels may contain closing brackets.
    let closeAt: number;
    if (s[textStart] === '"') {
      const quoteEnd = s.indexOf('"', textStart + 1);
      closeAt = quoteEnd >= 0 ? s.indexOf(close, quoteEnd + 1) : -1;
    } else {
      closeAt = s.indexOf(close, textStart);
    }
    if (closeAt < 0) continue;
    return {
      node: { id, label: cleanLabel(s.slice(textStart, closeAt)), kind },
      end: closeAt + close.length,
    };
  }
  // Trailing ":::className" styling is ignored.
  const classMatch = /^:::[\w-]+/.exec(s.slice(end));
  if (classMatch) end += classMatch[0].length;
  return { node: { id, label: null, kind: null }, end };
}

/** Reads a link operator (with optional label) at `pos`. */
function readLink(s: string, pos: number): { link: ParsedLink; end: number } | null {
  const rest = s.slice(pos);
  // Label in the middle: A -- text --> B, A -. text .-> B, A == text ==> B
  const middle = /^\s*(<?)(--|==|-\.)\s+(.+?)\s+(-{2,}|={2,}|\.-|\.{1,}->|-{2,}>|={2,}>)([>ox]?)\s*/.exec(
    rest,
  );
  const plain = /^\s*(<?)(-{2,}|={2,}|-\.+-)([>ox]?)\s*(?:\|([^|]*)\|)?\s*/.exec(rest);
  let start: string;
  let body: string;
  let head: string;
  let label: string;
  let length: number;
  if (middle && !plain?.[4]) {
    start = middle[1] ?? "";
    body = (middle[2] ?? "") + (middle[4] ?? "");
    const explicitHead = middle[5] ?? "";
    head = explicitHead !== "" ? explicitHead : middle[4]?.endsWith(">") ? ">" : "";
    label = middle[3] ?? "";
    length = middle[0].length;
  } else if (plain) {
    start = plain[1] ?? "";
    body = plain[2] ?? "";
    head = plain[3] ?? "";
    label = plain[4] ?? "";
    length = plain[0].length;
  } else {
    return null;
  }
  const dotted = body.includes(".");
  const thick = body.includes("=");
  const toArrow = (c: string): Arrowhead =>
    c === ">" ? "arrow" : c === "o" ? "circle" : c === "x" ? "triangle" : "none";
  return {
    link: {
      label: cleanLabel(label),
      pattern: dotted ? "dashed" : "solid",
      width: thick ? 3 : 2,
      arrowStart: start === "<" ? "arrow" : "none",
      arrowEnd: toArrow(head),
    },
    end: pos + length,
  };
}

/** Reads `a & b & c`. */
function readNodeGroup(s: string, pos: number): { nodes: ParsedNode[]; end: number } | null {
  const nodes: ParsedNode[] = [];
  let at = pos;
  for (;;) {
    while (s[at] === " ") at++;
    const read = readNode(s, at);
    if (!read) return nodes.length > 0 ? { nodes, end: at } : null;
    nodes.push(read.node);
    at = read.end;
    const amp = /^\s*&\s*/.exec(s.slice(at));
    if (!amp) return { nodes, end: at };
    at += amp[0].length;
  }
}

function sizeFor(kind: ShapeKind, label: string): { width: number; height: number } {
  const base = defaultSize(kind);
  const longest = Math.max(...label.split("\n").map((l) => l.length), 0);
  const lines = label.split("\n").length;
  const width = Math.max(base.width, Math.min(320, longest * 9 + 40));
  const height = Math.max(base.height, lines * 22 + 30);
  return { width: Math.round(width / 10) * 10, height: Math.round(height / 10) * 10 };
}

function parseFlowchart(lines: string[]): MermaidResult {
  const header = lines[0] ?? "";
  const dirToken = /^(?:flowchart|graph)\s+(TB|TD|BT|RL|LR)/i.exec(header)?.[1]?.toUpperCase() ?? "TB";
  const direction: LayoutDirection = dirToken === "LR" || dirToken === "RL" ? "LR" : "TB";
  const nodes = new Map<string, ParsedNode>();
  const links: { from: string; to: string; link: ParsedLink }[] = [];
  const subgraphs: { title: string; members: Set<string> }[] = [];
  const stack: { title: string; members: Set<string> }[] = [];
  let skipped = 0;

  const remember = (node: ParsedNode): void => {
    const known = nodes.get(node.id);
    if (!known) nodes.set(node.id, { ...node });
    else if (node.label !== null) {
      known.label = node.label;
      known.kind = node.kind;
    }
    for (const group of stack) group.members.add(node.id);
  };

  for (const raw of lines.slice(1)) {
    for (const statement of raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const sub = /^subgraph\s+(.+)$/i.exec(statement);
      if (sub) {
        const spec = sub[1]?.trim() ?? "";
        const titled = /^[\w-]+\s*\[(.+)\]$/.exec(spec);
        const group = { title: cleanLabel(titled?.[1] ?? spec), members: new Set<string>() };
        subgraphs.push(group);
        stack.push(group);
        continue;
      }
      if (/^end$/i.test(statement)) {
        stack.pop();
        continue;
      }
      if (/^(style|classDef|class|click|linkStyle|direction)\b/i.test(statement)) {
        skipped++;
        continue;
      }
      const first = readNodeGroup(statement, 0);
      if (!first) {
        skipped++;
        continue;
      }
      first.nodes.forEach(remember);
      let previous = first.nodes;
      let at = first.end;
      let ok = true;
      while (at < statement.length) {
        const link = readLink(statement, at);
        if (!link) {
          ok = false;
          break;
        }
        const next = readNodeGroup(statement, link.end);
        if (!next) {
          ok = false;
          break;
        }
        next.nodes.forEach(remember);
        for (const from of previous)
          for (const to of next.nodes) links.push({ from: from.id, to: to.id, link: link.link });
        previous = next.nodes;
        at = next.end;
      }
      if (!ok) skipped++;
    }
  }
  if (nodes.size === 0) return { ok: false, error: "No nodes found in the flowchart" };

  const idMap = new Map<string, string>();
  const created: DiagramNode[] = [...nodes.values()].map((n) => {
    const kind = n.kind ?? "rectangle";
    const label = n.label ?? n.id;
    const node = createNode(kind, 0, 0, { ...flowNodeStyle(kind), label, ...sizeFor(kind, label) });
    idMap.set(n.id, node.id);
    return node;
  });
  const edges: DiagramEdge[] = links.flatMap(({ from, to, link }) => {
    const source = idMap.get(from);
    const target = idMap.get(to);
    if (!source || !target) return [];
    return [
      createEdge(source, target, {
        label: link.label,
        strokePattern: link.pattern,
        strokeWidth: link.width,
        arrowStart: link.arrowStart,
        arrowEnd: link.arrowEnd,
        routing: "elbow",
      }),
    ];
  });

  const base: Diagram = {
    ...createDiagram("Imported flowchart", "professional", "flowchart"),
    nodes: created,
    edges,
    flowchart: { ...createFlowchartData(direction), lanes: [] },
  };

  // Top-level subgraphs that split every node between them read as swimlanes.
  const memberIds = subgraphs.map((g) => new Set([...g.members].flatMap((id) => idMap.get(id) ?? [])));
  const nested = subgraphs.some((g, i) =>
    subgraphs.some((h, j) => i !== j && [...g.members].every((m) => h.members.has(m))),
  );
  const assigned = memberIds.reduce((n, set) => n + set.size, 0);
  const asLanes =
    subgraphs.length > 0 &&
    subgraphs.length <= 30 &&
    !nested &&
    assigned === created.length &&
    new Set(memberIds.flatMap((set) => [...set])).size === created.length;
  if (asLanes) {
    const lanes = subgraphs.map((g, i) =>
      createFlowLane(g.title.slice(0, 100) || `Lane ${String(i + 1)}`, i),
    );
    // Seed each node into its lane so tidying keeps it there.
    const starts = new Map(lanes.map((lane, i) => [lane.id, i * lane.size]));
    const nodes = created.map((n) => {
      const index = memberIds.findIndex((set) => set.has(n.id));
      const lane = lanes[index];
      const start = lane ? (starts.get(lane.id) ?? 0) : 0;
      const centre = start + (lane?.size ?? 0) / 2;
      return direction === "TB"
        ? { ...n, x: Math.round(centre - n.width / 2) }
        : { ...n, y: Math.round(centre - n.height / 2) };
    });
    const diagram = tidyFlowchart({
      ...base,
      nodes,
      flowchart: { ...createFlowchartData(direction), lanes },
    });
    return { ok: true, diagram, skipped };
  }

  let diagram = tidyFlowchart(base);
  // Other subgraphs become groups drawn around their members.
  const padding = 24;
  const containers: DiagramNode[] = [];
  for (const members of memberIds) {
    const bounds = boundsOf(diagram.nodes.filter((n) => members.has(n.id)));
    const group = subgraphs[memberIds.indexOf(members)];
    if (!bounds || !group) continue;
    containers.push(
      createNode("container", 0, 0, {
        label: group.title,
        x: bounds.x - padding,
        y: bounds.y - padding - 28,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2 + 28,
      }),
    );
  }
  diagram = { ...diagram, nodes: [...containers, ...diagram.nodes] };
  return { ok: true, diagram, skipped };
}

// ---------------------------------------------------------------- gantt import

const TAGS = new Set(["done", "active", "crit", "milestone"]);

function parseDuration(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(d|w|h)?$/i.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "d").toLowerCase();
  const days = unit === "w" ? n * 7 : unit === "h" ? n / 8 : n;
  return Math.max(1, Math.round(days));
}

function parseGantt(lines: string[]): MermaidResult {
  let title = "Imported plan";
  let skipped = 0;
  let skipWeekends = false;
  const data = createGanttData();
  const sections: GanttSection[] = [];
  let section: GanttSection | null = null;
  interface Draft {
    task: GanttTask;
    afterIds: string[];
    days: number;
    explicitStart: boolean;
  }
  const drafts: Draft[] = [];
  const byMermaidId = new Map<string, string>();

  for (const line of lines.slice(1)) {
    const lower = line.toLowerCase();
    if (lower.startsWith("title ")) {
      title = line.slice(6).trim().slice(0, 200) || title;
      continue;
    }
    if (lower.startsWith("dateformat")) {
      if (!/YYYY-MM-DD/i.test(line)) return { ok: false, error: "Only dateFormat YYYY-MM-DD is supported" };
      continue;
    }
    if (lower.startsWith("excludes")) {
      if (lower.includes("weekends")) skipWeekends = true;
      continue;
    }
    if (lower.startsWith("section ")) {
      section = createSection(line.slice(8).trim().slice(0, 200) || "Section", sections.length);
      sections.push(section);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      skipped++;
      continue;
    }
    const name = line.slice(0, colon).trim();
    const parts = line
      .slice(colon + 1)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const tags = new Set<string>();
    while (parts[0] && TAGS.has(parts[0].toLowerCase())) tags.add(parts.shift()?.toLowerCase() ?? "");
    let id: string | null = null;
    let start: string | null = null;
    let endSpec: string | null = null;
    if (parts.length >= 3) [id = null, start = null, endSpec = null] = parts;
    else if (parts.length === 2) [start = null, endSpec = null] = parts;
    else if (parts.length === 1) endSpec = parts[0] ?? null;

    const milestone = tags.has("milestone");
    const afterIds = start?.toLowerCase().startsWith("after ") ? start.slice(6).trim().split(/\s+/) : [];
    const explicitStart = start !== null && isValidIsoDate(start);
    const previous = drafts.at(-1);
    const startIso =
      explicitStart && start
        ? start
        : previous
          ? fromDayNumber(toDayNumber(previous.task.end) + 1)
          : fromDayNumber(toDayNumber(new Date().toISOString().slice(0, 10)));
    let days = 1;
    if (!milestone && endSpec) {
      if (isValidIsoDate(endSpec)) days = Math.max(1, toDayNumber(endSpec) - toDayNumber(startIso));
      else days = parseDuration(endSpec) ?? 1;
    }
    const task = createTask(
      milestone ? "milestone" : "task",
      name.slice(0, 200) || "Untitled task",
      startIso,
      days,
      section?.id ?? null,
      {
        progress: tags.has("done") ? 100 : tags.has("active") ? 50 : 0,
      },
    );
    if (id) byMermaidId.set(id, task.id);
    // Tasks without a start follow the previous task, as in Mermaid.
    const implicitAfter = !explicitStart && afterIds.length === 0 && previous ? [previous.task.id] : [];
    drafts.push({ task, afterIds: afterIds.length > 0 ? afterIds : implicitAfter, days, explicitStart });
  }
  if (drafts.length === 0) return { ok: false, error: "No tasks found in the gantt chart" };

  const calendar = { skipWeekends, holidays: [] };
  const cal = calendarOf({ calendar });
  const draftIds = new Set(drafts.map((d) => d.task.id));
  // Dependent tasks start at the earliest date in the plan; auto-schedule then pushes each
  // one to exactly where its predecessors allow (it never pulls tasks earlier).
  const earliest = Math.min(...drafts.map((d) => toDayNumber(d.task.start)));
  const tasks = drafts.map(({ task, afterIds, days }) => {
    const deps = afterIds.flatMap((ref) => {
      // Implicit "after previous" refs are already task ids; explicit ones are Mermaid ids.
      const target = byMermaidId.get(ref) ?? (draftIds.has(ref) ? ref : undefined);
      return target && target !== task.id ? [finishToStart(target)] : [];
    });
    const startIndex = deps.length > 0 ? cal.index(earliest) : spanOf(task, cal).start;
    // Durations are in working days when weekends are excluded, matching Mermaid.
    const placed = placeAt(task, startIndex, task.kind === "milestone" ? 1 : days, cal);
    return { ...placed, dependencies: [...new Map(deps.map((d) => [d.taskId, d])).values()] };
  });
  const gantt = { ...data, sections, tasks: autoSchedule(tasks, cal), calendar };
  return { ok: true, diagram: { ...createDiagram(title, "professional", "gantt"), gantt }, skipped };
}

// ---------------------------------------------------------------- export

function mermaidLabel(text: string): string {
  return `"${text.replaceAll('"', "#quot;").replaceAll("\n", "<br>")}"`;
}

const KIND_SYNTAX: Readonly<Record<ShapeKind, readonly [string, string]>> = {
  rectangle: ["[", "]"],
  rounded: ["(", ")"],
  ellipse: ["((", "))"],
  diamond: ["{", "}"],
  parallelogram: ["[/", "/]"],
  cylinder: ["[(", ")]"],
  note: ["[", "]"],
  container: ["[", "]"],
  text: ["[", "]"],
  hexagon: ["{{", "}}"],
  triangle: ["[", "]"],
  document: ["[", "]"],
  cloud: ["(", ")"],
  actor: ["([", "])"],
  icon: ["[", "]"],
  terminal: ["([", "])"],
  subroutine: ["[[", "]]"],
  table: ["[", "]"],
  class: ["[", "]"],
  initial: ["((", "))"],
  final: ["(((", ")))"],
  person: ["([", "])"],
};

function flowchartToMermaid(diagram: Diagram): string {
  const flow = diagram.chartType === "flowchart" ? diagram.flowchart : undefined;
  const lines = [flow?.direction === "LR" ? "flowchart LR" : "flowchart TD"];
  const ids = new Map<string, string>();
  const shapes = diagram.nodes.filter((n) => n.kind !== "container");
  shapes.forEach((n, i) => ids.set(n.id, `n${String(i + 1)}`));
  const containers = diagram.nodes.filter((n) => n.kind === "container");
  const inside = (n: DiagramNode, c: DiagramNode): boolean =>
    n.x >= c.x && n.y >= c.y && n.x + n.width <= c.x + c.width && n.y + n.height <= c.y + c.height;
  const placed = new Set<string>();
  const nodeLine = (n: DiagramNode, indent: string): string => {
    const [open, close] = KIND_SYNTAX[n.kind];
    return `${indent}${ids.get(n.id) ?? n.id}${open}${mermaidLabel(n.label || " ")}${close}`;
  };
  // Swimlanes export as subgraphs.
  flow?.lanes.forEach((lane, i) => {
    const members = shapes.filter((n) => !placed.has(n.id) && laneOf(flow, n) === lane.id);
    if (members.length === 0) return;
    lines.push(`  subgraph lane${String(i + 1)}[${mermaidLabel(lane.name || "Lane")}]`);
    for (const n of members) {
      lines.push(nodeLine(n, "    "));
      placed.add(n.id);
    }
    lines.push("  end");
  });
  containers.forEach((c, i) => {
    const members = shapes.filter((n) => !placed.has(n.id) && inside(n, c));
    if (members.length === 0) return;
    lines.push(`  subgraph g${String(i + 1)}[${mermaidLabel(c.label || "Group")}]`);
    for (const n of members) {
      lines.push(nodeLine(n, "    "));
      placed.add(n.id);
    }
    lines.push("  end");
  });
  for (const n of shapes) if (!placed.has(n.id)) lines.push(nodeLine(n, "  "));
  for (const e of diagram.edges) {
    const from = ids.get(e.source);
    const to = ids.get(e.target);
    if (!from || !to) continue;
    const thick = e.strokeWidth >= 3;
    const dotted = e.strokePattern !== "solid";
    const head = e.arrowEnd === "none" ? "" : e.arrowEnd === "circle" ? "o" : ">";
    const body = thick
      ? head
        ? `==${head}`
        : "==="
      : dotted
        ? head
          ? `-.-${head}`
          : "-.-"
        : head
          ? `--${head}`
          : "---";
    const start = e.arrowStart !== "none" && head === ">" ? "<" : "";
    const label = e.label ? `|${mermaidLabel(e.label)}|` : "";
    lines.push(`  ${from} ${start}${body}${label} ${to}`);
  }
  return `${lines.join("\n")}\n`;
}

function ganttToMermaid(diagram: Diagram): string {
  const gantt = diagram.gantt;
  if (!gantt) return "gantt\n";
  const cal = calendarOf(gantt);
  const lines = ["gantt", `  title ${diagram.title.replace(/[\r\n]/g, " ")}`, "  dateFormat YYYY-MM-DD"];
  if (gantt.calendar.skipWeekends) lines.push("  excludes weekends");
  const ids = new Map(gantt.tasks.map((t, i) => [t.id, `t${String(i + 1)}`]));
  const taskLine = (t: GanttTask): string => {
    const tags = [
      t.kind === "milestone" ? "milestone" : null,
      t.progress >= 100 ? "done" : t.progress > 0 ? "active" : null,
    ].filter(Boolean);
    // Mermaid can only express finish-to-start ("after"); other dependency types keep their dates.
    const fs = t.dependencies
      .filter((d) => d.type === "FS" && d.lag === 0)
      .map((d) => ids.get(d.taskId))
      .filter(Boolean);
    const start = fs.length > 0 ? `after ${fs.join(" ")}` : t.start;
    const length =
      t.kind === "milestone"
        ? "0d"
        : `${String(gantt.calendar.skipWeekends ? spanOf(t, cal).duration : toDayNumber(t.end) - toDayNumber(t.start) + 1)}d`;
    return `    ${t.name.replace(/[:#\r\n]/g, " ")} :${[...tags, ids.get(t.id), start, length].join(", ")}`;
  };
  const sectionIds = new Set(gantt.sections.map((s) => s.id));
  const loose = gantt.tasks.filter((t) => t.sectionId === null || !sectionIds.has(t.sectionId));
  if (loose.length > 0) {
    lines.push("  section Tasks");
    for (const t of loose) lines.push(taskLine(t));
  }
  for (const s of gantt.sections) {
    lines.push(`  section ${s.name.replace(/[\r\n]/g, " ")}`);
    for (const t of gantt.tasks.filter((x) => x.sectionId === s.id)) lines.push(taskLine(t));
  }
  return `${lines.join("\n")}\n`;
}

export function diagramToMermaid(diagram: Diagram): string {
  const kind = kindModel(diagram.chartType)?.toMermaid;
  if (kind) return kind(diagram);
  if (diagram.chartType === "gantt") return ganttToMermaid(diagram);
  if (diagram.chartType === "kanban") return kanbanToMermaid(diagram);
  if (diagram.chartType === "roadmap" && diagram.roadmap)
    return roadmapToMermaid(diagram.title, diagram.roadmap);
  return flowchartToMermaid(diagram);
}
