import {
  DEFAULT_LAYER_ID,
  DIAGRAM_FORMAT_VERSION,
  type DiagramLayer,
  type ChartType,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type ShapeKind,
} from "@linework/shared";
import type { StyleId } from "./styles";

export function createId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

export const DEFAULT_STROKE = "#1f2937";
export const DEFAULT_TEXT = "#1f2937";
export const NOTE_FILL = "#fff3b0";

const DEFAULT_SIZE: Readonly<Record<ShapeKind, readonly [number, number]>> = {
  rectangle: [160, 80],
  rounded: [160, 80],
  ellipse: [140, 90],
  diamond: [150, 100],
  parallelogram: [170, 80],
  cylinder: [120, 110],
  note: [150, 130],
  container: [320, 220],
  text: [160, 40],
  hexagon: [150, 90],
  triangle: [120, 100],
  document: [150, 100],
  cloud: [170, 110],
  actor: [70, 110],
  icon: [96, 96],
  terminal: [150, 60],
  subroutine: [170, 80],
};

export const DEFAULT_LABEL: Readonly<Record<ShapeKind, string>> = {
  rectangle: "Step",
  rounded: "Start",
  ellipse: "Event",
  diamond: "Decision?",
  parallelogram: "Input",
  cylinder: "Database",
  note: "Note",
  container: "Group",
  text: "Text",
  hexagon: "Preparation",
  triangle: "Triangle",
  document: "Document",
  cloud: "Internet",
  actor: "User",
  icon: "Icon",
  terminal: "Start",
  subroutine: "Subprocess",
};

export function defaultSize(kind: ShapeKind): { width: number; height: number } {
  const [width, height] = DEFAULT_SIZE[kind];
  return { width, height };
}

/** Builds a node centred on (cx, cy) with sensible defaults for its kind. */
export function createNode(
  kind: ShapeKind,
  cx: number,
  cy: number,
  overrides: Partial<Omit<DiagramNode, "kind">> = {},
): DiagramNode {
  const size = defaultSize(kind);
  const width = overrides.width ?? size.width;
  const height = overrides.height ?? size.height;
  return {
    id: createId(),
    kind,
    x: Math.round(cx - width / 2),
    y: Math.round(cy - height / 2),
    width,
    height,
    label: DEFAULT_LABEL[kind],
    fill: kind === "note" ? NOTE_FILL : "transparent",
    stroke: kind === "text" ? "#00000000" : DEFAULT_STROKE,
    strokeWidth: kind === "text" ? 0 : kind === "icon" ? 1.8 : 2,
    strokePattern: kind === "container" ? "dashed" : "solid",
    textColor: DEFAULT_TEXT,
    fontSize: kind === "container" ? 15 : 16,
    textAlign: "center",
    icon: null,
    layerId: DEFAULT_LAYER_ID,
    ...overrides,
  };
}

export function createEdge(
  source: string,
  target: string,
  overrides: Partial<DiagramEdge> = {},
): DiagramEdge {
  return {
    id: createId(),
    source,
    target,
    label: "",
    routing: "straight",
    arrowStart: "none",
    arrowEnd: "arrow",
    stroke: DEFAULT_STROKE,
    strokeWidth: 2,
    strokePattern: "solid",
    ...overrides,
  };
}

export function createDiagram(
  title: string,
  styleId: StyleId = "professional",
  chartType: ChartType = "freeform",
): Diagram {
  const now = new Date().toISOString();
  return {
    version: DIAGRAM_FORMAT_VERSION,
    id: createId(),
    chartType,
    title,
    styleId,
    background: "#ffffff",
    nodes: [],
    edges: [],
    layers: [createLayer("Layer 1", DEFAULT_LAYER_ID)],
    comments: [],
    ...(chartType === "flowchart"
      ? { flowchart: { direction: "TB" as const, laneStart: 0, lanes: [] } }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function createLayer(name: string, id: string = createId()): DiagramLayer {
  return { id, name, visible: true, locked: false };
}
