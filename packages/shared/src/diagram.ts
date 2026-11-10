import { z } from "zod";
import { flowchartDataSchema, validateFlowchart } from "./flowchart.js";
import { ganttDataSchema, validateGantt } from "./gantt.js";
import { kanbanDataSchema, validateKanban } from "./kanban.js";
import { networkDataSchema, validateNetwork } from "./network.js";
import { roadmapDataSchema, validateRoadmap } from "./roadmap.js";
import { migrateDiagram } from "./migrate.js";

/** Current on-disk document format version; bump with a migration when the shape changes. */
export const DIAGRAM_FORMAT_VERSION = 2;

/**
 * What a document is. Each chart type has its own objects and editor:
 * freeform diagrams, flowcharts and network maps use nodes and edges (flowcharts add
 * direction and swimlanes in `flowchart`, network maps add entity and link details in
 * `network`); gantt charts, kanban boards and roadmaps use the `gantt`, `kanban` and `roadmap`
 * payloads. Architecture, entity-relationship, org, mind map, class and state diagrams are
 * nodes and edges too, with the details they need kept on the shapes themselves (`meta`, and
 * compartments written into table and class labels).
 */
export const CHART_TYPES = [
  "freeform",
  "gantt",
  "kanban",
  "flowchart",
  "network",
  "roadmap",
  "architecture",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const SHAPE_KINDS = [
  "rectangle",
  "rounded",
  "ellipse",
  "diamond",
  "parallelogram",
  "cylinder",
  "note",
  "container",
  "text",
  "hexagon",
  "triangle",
  "document",
  "cloud",
  "actor",
  /** A library icon (see `icon`) with its label underneath. */
  "icon",
  /** Flowchart start or end: a pill with fully rounded ends. */
  "terminal",
  /** Flowchart subprocess (predefined process): a box with double side edges. */
  "subroutine",
  /** Database table: the first label line is its name, each further line a column. */
  "table",
  /** UML class: label sections (name, attributes, operations) separated by "--" lines. */
  "class",
  /** State machine initial state: a filled circle. */
  "initial",
  /** State machine final state: a ringed circle. */
  "final",
  /** C4 person: a head above a rounded body, with the label in the body. */
  "person",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const ARROWHEADS = [
  "none",
  "arrow",
  "triangle",
  "circle",
  "diamond",
  /** Hollow triangle: UML inheritance and realisation. */
  "triangle-open",
  /** Hollow diamond: UML aggregation. */
  "diamond-open",
  /** Crow's foot cardinalities for entity-relationship diagrams. */
  "one",
  "zero-or-one",
  "one-or-many",
  "zero-or-many",
  "many",
] as const;
export type Arrowhead = (typeof ARROWHEADS)[number];

export const EDGE_ROUTINGS = ["straight", "elbow", "curved"] as const;
export type EdgeRouting = (typeof EDGE_ROUTINGS)[number];

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const STROKE_PATTERNS = ["solid", "dashed", "dotted"] as const;
export type StrokePattern = (typeof STROKE_PATTERNS)[number];

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected #RRGGBB or #RRGGBBAA");
/** Fill colour, or "transparent" for an unfilled shape. */
const fillColor = z.union([hexColor, z.literal("transparent")]);
const id = z.string().min(1).max(64);
const finite = z.number();

/**
 * Extra details a chart type keeps on a shape or connector, such as a C4 element's type and
 * technology or a person's job title. Rendered as a subtitle (`subtitle`, `detail`) and body
 * text (`description`) when present.
 */
export const metaSchema = z
  .record(z.string().min(1).max(40), z.string().max(2_000))
  .refine((m) => Object.keys(m).length <= 30, "Too many details");
export type ShapeMeta = z.infer<typeof metaSchema>;

export const nodeSchema = z.object({
  id,
  kind: z.enum(SHAPE_KINDS),
  x: finite,
  y: finite,
  width: finite.min(1).max(20_000),
  height: finite.min(1).max(20_000),
  label: z.string().max(5_000),
  fill: fillColor,
  stroke: hexColor,
  strokeWidth: finite.min(0).max(20),
  strokePattern: z.enum(STROKE_PATTERNS),
  textColor: hexColor,
  fontSize: finite.min(6).max(200),
  textAlign: z.enum(TEXT_ALIGNS),
  /** Library icon id for "icon" nodes; null otherwise. */
  icon: z.string().max(64).nullable(),
  layerId: id,
  meta: metaSchema.optional(),
});
export type DiagramNode = z.infer<typeof nodeSchema>;

export const edgeSchema = z.object({
  id,
  source: id,
  target: id,
  label: z.string().max(1_000),
  routing: z.enum(EDGE_ROUTINGS),
  arrowStart: z.enum(ARROWHEADS),
  arrowEnd: z.enum(ARROWHEADS),
  stroke: hexColor,
  strokeWidth: finite.min(0.5).max(20),
  strokePattern: z.enum(STROKE_PATTERNS),
  /** Text beside each end, such as a multiplicity ("1", "0..*") or a role. */
  startLabel: z.string().max(100).optional(),
  endLabel: z.string().max(100).optional(),
  meta: metaSchema.optional(),
});
export type DiagramEdge = z.infer<typeof edgeSchema>;

export const layerSchema = z.object({
  id,
  name: z.string().max(100),
  visible: z.boolean(),
  /** Locked layers are drawn but their shapes can't be selected or moved. */
  locked: z.boolean(),
});
export type DiagramLayer = z.infer<typeof layerSchema>;

export const commentReplySchema = z.object({
  id,
  author: z.string().max(100),
  text: z.string().max(5_000),
  createdAt: z.iso.datetime(),
});

export const commentSchema = z.object({
  id,
  /** Node or gantt task the comment is about, or null for a comment pinned to a canvas point. */
  targetId: id.nullable(),
  x: finite,
  y: finite,
  author: z.string().max(100),
  text: z.string().max(5_000),
  createdAt: z.iso.datetime(),
  resolved: z.boolean(),
  replies: z.array(commentReplySchema).max(200),
});
export type DiagramComment = z.infer<typeof commentSchema>;

export const diagramSchema = z
  .object({
    version: z.literal(DIAGRAM_FORMAT_VERSION),
    id,
    chartType: z.enum(CHART_TYPES),
    title: z.string().max(200),
    styleId: z.string().min(1).max(64),
    background: fillColor,
    nodes: z.array(nodeSchema).max(5_000),
    edges: z.array(edgeSchema).max(10_000),
    /** Bottom to top. Always at least one. */
    layers: z.array(layerSchema).min(1).max(50),
    comments: z.array(commentSchema).max(2_000),
    gantt: ganttDataSchema.optional(),
    kanban: kanbanDataSchema.optional(),
    flowchart: flowchartDataSchema.optional(),
    network: networkDataSchema.optional(),
    roadmap: roadmapDataSchema.optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((diagram, ctx) => {
    // Every edge must reference nodes that exist in the same document.
    const nodeIds = new Set(diagram.nodes.map((n) => n.id));
    const layerIds = new Set(diagram.layers.map((l) => l.id));
    diagram.nodes.forEach((node, index) => {
      if (!layerIds.has(node.layerId)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", index, "layerId"],
          message: "Node references a missing layer",
        });
      }
    });
    diagram.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        ctx.addIssue({ code: "custom", path: ["edges", index], message: "Edge references a missing node" });
      }
    });
    if (diagram.chartType === "gantt") {
      if (!diagram.gantt) {
        ctx.addIssue({ code: "custom", path: ["gantt"], message: "Gantt chart is missing its data" });
        return;
      }
      for (const [path, message] of validateGantt(diagram.gantt)) {
        ctx.addIssue({ code: "custom", path: ["gantt", ...path], message });
      }
    }
    if (diagram.chartType === "kanban") {
      if (!diagram.kanban) {
        ctx.addIssue({ code: "custom", path: ["kanban"], message: "Kanban board is missing its data" });
        return;
      }
      for (const [path, message] of validateKanban(diagram.kanban)) {
        ctx.addIssue({ code: "custom", path: ["kanban", ...path], message });
      }
    }
    if (diagram.chartType === "flowchart") {
      if (!diagram.flowchart) {
        ctx.addIssue({ code: "custom", path: ["flowchart"], message: "Flowchart is missing its data" });
        return;
      }
      for (const [path, message] of validateFlowchart(diagram.flowchart)) {
        ctx.addIssue({ code: "custom", path: ["flowchart", ...path], message });
      }
    }
    if (diagram.chartType === "network") {
      if (!diagram.network) {
        ctx.addIssue({ code: "custom", path: ["network"], message: "Network map is missing its data" });
        return;
      }
      for (const [path, message] of validateNetwork(diagram.network)) {
        ctx.addIssue({ code: "custom", path: ["network", ...path], message });
      }
    }
    if (diagram.chartType === "roadmap") {
      if (!diagram.roadmap) {
        ctx.addIssue({ code: "custom", path: ["roadmap"], message: "Roadmap is missing its data" });
        return;
      }
      for (const [path, message] of validateRoadmap(diagram.roadmap)) {
        ctx.addIssue({ code: "custom", path: ["roadmap", ...path], message });
      }
    }
  });
export type Diagram = z.infer<typeof diagramSchema>;

/** Lightweight listing record so libraries don't need to load full documents. */
export interface DiagramSummary {
  readonly id: string;
  readonly title: string;
  readonly styleId: string;
  readonly chartType: ChartType;
  /** Shapes in a freeform diagram or flowchart, tasks in a gantt chart, cards on a kanban board. */
  readonly itemCount: number;
  readonly updatedAt: string;
}

/** What the chart is made of: shapes, gantt tasks or kanban cards. */
export function itemCount(diagram: Diagram): number {
  switch (diagram.chartType) {
    case "gantt":
      return diagram.gantt?.tasks.length ?? 0;
    case "kanban":
      return diagram.kanban?.cards.length ?? 0;
    case "roadmap":
      return diagram.roadmap?.items.length ?? 0;
    default:
      return diagram.nodes.length;
  }
}

export function summarize(diagram: Diagram): DiagramSummary {
  return {
    id: diagram.id,
    title: diagram.title,
    styleId: diagram.styleId,
    chartType: diagram.chartType,
    itemCount: itemCount(diagram),
    updatedAt: diagram.updatedAt,
  };
}

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Validates untrusted input (files, network, storage) into a Diagram, upgrading older formats first. */
export function parseDiagram(input: unknown): ParseResult<Diagram> {
  const result = diagramSchema.safeParse(migrateDiagram(input));
  if (result.success) return { ok: true, value: result.data };
  const first = result.error.issues[0];
  const where = first && first.path.length > 0 ? ` at ${first.path.join(".")}` : "";
  return { ok: false, error: `${first?.message ?? "Invalid diagram"}${where}` };
}
