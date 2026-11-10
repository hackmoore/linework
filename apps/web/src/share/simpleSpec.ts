import { z } from "zod";
import {
  isValidIsoDate,
  KANBAN_PRIORITIES,
  SHAPE_KINDS,
  toDayNumber,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type GanttSection,
  type GanttTask,
  type KanbanCard,
  type KanbanColumn,
  type ShapeKind,
} from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { layeredLayout, withPositions } from "../editor/arrange";
import { addDays, createGanttData, createSection, createTask, finishToStart, todayIso } from "../gantt/model";
import { autoSchedule, calendarOf, placeAt } from "../gantt/schedule";
import { createCard, createColumn, createLane } from "../kanban/model";
import { tidyFlowchart } from "../flowchart/layout";
import { createFlowchartData, createFlowLane, DEFAULT_LANE_SIZE, flowNodeStyle } from "../flowchart/model";
import { ICONS } from "../library/icons";
import { boundsOf } from "../render/geometry";

/*
 * The "simple spec": a compact, forgiving JSON format meant to be written by people and
 * LLMs. Only labels and structure are required; layout, colours and ids are filled in.
 * Documented for LLMs at /llms and /llms.txt, so keep those in sync with this file.
 */

const COLORS = {
  blue: { fill: "#e8f0fe", stroke: "#1a56db" },
  green: { fill: "#e6f4ea", stroke: "#1e7e34" },
  amber: { fill: "#fff4e0", stroke: "#b45309" },
  red: { fill: "#fde8e8", stroke: "#b91c1c" },
  purple: { fill: "#f1ebff", stroke: "#6d28d9" },
  grey: { fill: "#f3f4f6", stroke: "#4b5563" },
  yellow: { fill: "#fff3b0", stroke: "#a16207" },
} as const;
export const SPEC_COLORS = Object.keys(COLORS) as (keyof typeof COLORS)[];

const SECTION_HEX: Readonly<Record<keyof typeof COLORS, string>> = {
  blue: "#1a56db",
  green: "#1e7e34",
  amber: "#b45309",
  red: "#b91c1c",
  purple: "#6d28d9",
  grey: "#4b5563",
  yellow: "#a16207",
};

const text = (max: number): z.ZodString => z.string().max(max);
const color = z.enum(SPEC_COLORS as [keyof typeof COLORS, ...(keyof typeof COLORS)[]]).optional();
const SHAPES = SHAPE_KINDS.filter((k) => k !== "icon" && k !== "container" && k !== "text");
/** Friendlier flowchart names accepted alongside shape kinds. */
const SHAPE_ALIASES: Readonly<Record<string, ShapeKind>> = {
  start: "terminal",
  end: "terminal",
  process: "rectangle",
  step: "rectangle",
  decision: "diamond",
  io: "parallelogram",
  input: "parallelogram",
  output: "parallelogram",
  subprocess: "subroutine",
  database: "cylinder",
};
const SHAPE_NAMES = [...SHAPES, ...Object.keys(SHAPE_ALIASES)];

const flowSchema = z.object({
  type: z.enum(["flowchart", "freeform", "diagram"]),
  title: text(200).optional(),
  direction: z.enum(["TB", "LR"]).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  /** Flowchart swimlane order; lanes named on nodes but missing here are added after these. */
  lanes: z.array(text(100).min(1)).max(30).optional(),
  nodes: z
    .array(
      z.object({
        id: text(64).min(1),
        label: text(5_000).optional(),
        shape: z.enum(SHAPE_NAMES as [string, ...string[]]).optional(),
        icon: z.enum(ICONS.map((i) => i.id) as [string, ...string[]]).optional(),
        color,
        group: text(200).optional(),
        lane: text(100).min(1).optional(),
      }),
    )
    .min(1)
    .max(1_000),
  edges: z
    .array(
      z.object({
        from: text(64),
        to: text(64),
        label: text(1_000).optional(),
        style: z.enum(["solid", "dashed", "dotted"]).optional(),
        arrow: z.enum(["end", "both", "none"]).optional(),
      }),
    )
    .max(5_000)
    .optional(),
});

const date = z.string().refine(isValidIsoDate, "Use YYYY-MM-DD dates");

const ganttTaskSchema = z.object({
  id: text(64).optional(),
  name: text(200),
  start: date.optional(),
  end: date.optional(),
  days: z.number().int().min(1).max(3650).optional(),
  milestone: z.boolean().optional(),
  owner: text(100).optional(),
  progress: z.number().min(0).max(100).optional(),
  after: z.array(text(64)).max(50).optional(),
});

const ganttSchema = z.object({
  type: z.literal("gantt"),
  title: text(200).optional(),
  skipWeekends: z.boolean().optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  sections: z
    .array(z.object({ name: text(200), color, tasks: z.array(ganttTaskSchema).max(500) }))
    .min(1)
    .max(100),
});

const kanbanSchema = z.object({
  type: z.literal("kanban"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  /** Swimlane order; lanes named on cards but missing here are added after these. */
  lanes: z.array(text(100).min(1)).max(50).optional(),
  columns: z
    .array(
      z.object({
        name: text(100),
        wip: z.number().int().min(1).max(999).optional(),
        done: z.boolean().optional(),
        color,
        cards: z
          .array(
            z.object({
              title: text(500),
              description: text(5_000).optional(),
              owner: text(100).optional(),
              due: date.optional(),
              tags: z.array(text(40).min(1)).max(10).optional(),
              priority: z.enum(KANBAN_PRIORITIES).optional(),
              lane: text(100).min(1).optional(),
              color,
            }),
          )
          .max(1_000)
          .optional(),
      }),
    )
    .min(1)
    .max(50),
});

const specSchema = z.discriminatedUnion("type", [flowSchema, ganttSchema, kanbanSchema]);
export type SimpleSpec = z.input<typeof specSchema>;

export type SpecResult = { ok: true; diagram: Diagram } | { ok: false; error: string };

function describeIssue(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid chart";
  return `${first.message}${first.path.length > 0 ? ` at ${first.path.join(".")}` : ""}`;
}

export function parseSimpleSpec(input: unknown): SpecResult {
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssue(parsed.error) };
  const spec = parsed.data;
  if (spec.type === "gantt") return { ok: true, diagram: buildGantt(spec) };
  if (spec.type === "kanban") return buildKanban(spec);
  return buildFlow(spec);
}

function buildFlow(spec: z.infer<typeof flowSchema>): SpecResult {
  const isFlowchart = spec.type === "flowchart";
  const ids = new Map<string, string>();
  const nodes: DiagramNode[] = [];
  for (const n of spec.nodes) {
    if (ids.has(n.id)) return { ok: false, error: `Duplicate node id "${n.id}"` };
    const label = n.label ?? n.id;
    const named = n.shape ? (SHAPE_ALIASES[n.shape] ?? (n.shape as ShapeKind)) : null;
    const kind: ShapeKind = n.icon ? "icon" : (named ?? (isFlowchart ? "rectangle" : "rounded"));
    const longest = Math.max(...label.split("\n").map((l) => l.length));
    const size =
      kind === "icon"
        ? { width: 110, height: 100 }
        : {
            width: Math.max(140, Math.min(320, Math.round((longest * 9 + 40) / 10) * 10)),
            height: Math.max(70, label.split("\n").length * 22 + 36),
          };
    const colors = n.color ? COLORS[n.color] : null;
    const node = createNode(kind, 0, 0, {
      ...(isFlowchart ? flowNodeStyle(kind) : {}),
      label,
      ...size,
      ...(n.icon ? { icon: n.icon } : {}),
      ...(colors && kind !== "icon" ? colors : {}),
      ...(colors && kind === "icon" ? { stroke: colors.stroke } : {}),
    });
    ids.set(n.id, node.id);
    nodes.push(node);
  }
  const edges: DiagramEdge[] = [];
  for (const e of spec.edges ?? []) {
    const source = ids.get(e.from);
    const target = ids.get(e.to);
    if (!source || !target)
      return { ok: false, error: `Edge ${e.from} -> ${e.to} refers to an unknown node id` };
    edges.push(
      createEdge(source, target, {
        label: e.label ?? "",
        strokePattern: e.style ?? "solid",
        arrowEnd: e.arrow === "none" ? "none" : "arrow",
        arrowStart: e.arrow === "both" ? "arrow" : "none",
        routing: "elbow",
      }),
    );
  }
  if (isFlowchart) return buildFlowchart(spec, nodes, edges, ids);
  let diagram: Diagram = {
    ...createDiagram(spec.title ?? "Untitled diagram", spec.style ?? "professional"),
    nodes,
    edges,
  };
  diagram = withPositions(diagram, layeredLayout(nodes, edges, spec.direction ?? "TB"));

  return { ok: true, diagram: withGroups(diagram, spec, ids) };
}

/** Draws a box around each named group's members, after layout. */
function withGroups(
  diagram: Diagram,
  spec: z.infer<typeof flowSchema>,
  ids: ReadonlyMap<string, string>,
): Diagram {
  const groups = new Map<string, string[]>();
  for (const n of spec.nodes) {
    const id = ids.get(n.id);
    if (n.group && id) groups.set(n.group, [...(groups.get(n.group) ?? []), id]);
  }
  const containers: DiagramNode[] = [];
  for (const [name, members] of groups) {
    const bounds = boundsOf(diagram.nodes.filter((n) => members.includes(n.id)));
    if (!bounds) continue;
    containers.push(
      createNode("container", 0, 0, {
        label: name,
        x: bounds.x - 24,
        y: bounds.y - 52,
        width: bounds.width + 48,
        height: bounds.height + 76,
      }),
    );
  }
  return containers.length === 0 ? diagram : { ...diagram, nodes: [...containers, ...diagram.nodes] };
}

/** A flowchart: steps in swimlanes (when any are named), laid out along the direction. */
function buildFlowchart(
  spec: z.infer<typeof flowSchema>,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  ids: ReadonlyMap<string, string>,
): SpecResult {
  const direction = spec.direction ?? "TB";
  const laneNames = [...(spec.lanes ?? [])];
  for (const n of spec.nodes) if (n.lane && !laneNames.includes(n.lane)) laneNames.push(n.lane);
  if (laneNames.length > 30) return { ok: false, error: "A flowchart can have up to 30 lanes" };
  const lanes = laneNames.map((name, i) => createFlowLane(name, i));
  // Seed each step into its lane (the first lane when none is named) so tidying keeps it there.
  const laneOfNode = new Map(spec.nodes.map((n) => [ids.get(n.id), laneNames.indexOf(n.lane ?? "")]));
  const placed = nodes.map((node) => {
    if (lanes.length === 0) return node;
    const index = Math.max(0, laneOfNode.get(node.id) ?? 0);
    const centre = index * DEFAULT_LANE_SIZE + DEFAULT_LANE_SIZE / 2;
    return direction === "TB"
      ? { ...node, x: Math.round(centre - node.width / 2) }
      : { ...node, y: Math.round(centre - node.height / 2) };
  });
  const diagram = tidyFlowchart({
    ...createDiagram(spec.title ?? "Untitled flowchart", spec.style ?? "professional", "flowchart"),
    nodes: placed,
    edges,
    flowchart: { ...createFlowchartData(direction), lanes },
  });
  return { ok: true, diagram: withGroups(diagram, spec, ids) };
}

function buildGantt(spec: z.infer<typeof ganttSchema>): Diagram {
  const calendar = { skipWeekends: spec.skipWeekends ?? false, holidays: [] };
  const cal = calendarOf({ calendar });
  const sections: GanttSection[] = [];
  const tasks: GanttTask[] = [];
  const byId = new Map<string, string>();
  const pending: { task: GanttTask; after: string[] }[] = [];
  let cursor = todayIso();
  spec.sections.forEach((s, i) => {
    const section = createSection(s.name || `Phase ${String(i + 1)}`, i);
    if (s.color) section.color = SECTION_HEX[s.color];
    sections.push(section);
    for (const t of s.tasks) {
      const milestone = t.milestone ?? false;
      const start = t.start ?? cursor;
      let days = t.days ?? 5;
      if (t.end && t.end >= start) days = cal.count(toDayNumber(start), toDayNumber(t.end)) || 1;
      const draft = createTask(
        milestone ? "milestone" : "task",
        t.name || "Untitled task",
        start,
        1,
        section.id,
        {
          owner: t.owner ?? "",
          progress: milestone ? 0 : (t.progress ?? 0),
        },
      );
      const task = placeAt(draft, cal.index(toDayNumber(start)), milestone ? 1 : days, cal);
      if (t.id) byId.set(t.id, task.id);
      tasks.push(task);
      pending.push({ task, after: t.after ?? [] });
      cursor = addDays(task.end, 1);
    }
  });
  const resolved = pending.map(({ task, after }) => ({
    ...task,
    dependencies: [
      ...new Set(after.map((ref) => byId.get(ref)).filter((id): id is string => !!id && id !== task.id)),
    ].map(finishToStart),
  }));
  const gantt = { ...createGanttData(sections, autoSchedule(resolved, cal)), calendar };
  return { ...createDiagram(spec.title ?? "Untitled plan", spec.style ?? "professional", "gantt"), gantt };
}

function buildKanban(spec: z.infer<typeof kanbanSchema>): SpecResult {
  const laneNames = [...(spec.lanes ?? [])];
  for (const column of spec.columns)
    for (const card of column.cards ?? [])
      if (card.lane && !laneNames.includes(card.lane)) laneNames.push(card.lane);
  if (laneNames.length > 50) return { ok: false, error: "A board can have up to 50 lanes" };
  const lanes = laneNames.map((name) => createLane(name));
  const laneId = (name: string | undefined): string | null =>
    lanes[name ? laneNames.indexOf(name) : 0]?.id ?? null;
  const columns: KanbanColumn[] = [];
  const cards: KanbanCard[] = [];
  spec.columns.forEach((c, i) => {
    const column = createColumn(c.name || "Untitled", i, {
      wipLimit: c.wip ?? null,
      done: c.done ?? (i === spec.columns.length - 1 && /done|complete|shipped|released/i.test(c.name)),
      ...(c.color ? { color: SECTION_HEX[c.color] } : {}),
    });
    columns.push(column);
    for (const card of c.cards ?? []) {
      cards.push(
        createCard(card.title || "Untitled card", column.id, laneId(card.lane), {
          description: card.description ?? "",
          owner: card.owner ?? "",
          due: card.due ?? null,
          tags: [...new Set(card.tags ?? [])],
          priority: card.priority ?? "none",
          color: card.color ? SECTION_HEX[card.color] : null,
        }),
      );
    }
  });
  if (cards.length > 5_000) return { ok: false, error: "A board can hold 5,000 cards" };
  return {
    ok: true,
    diagram: {
      ...createDiagram(spec.title ?? "Untitled board", spec.style ?? "professional", "kanban"),
      kanban: { columns, lanes, cards },
    },
  };
}
