import type { ComponentType } from "react";
import type { ChartType, Diagram, DiagramEdge, DiagramNode } from "@linework/shared";
import { architectureUi } from "../architecture/ArchitecturePanel";
import type { ToolDef } from "../editor/tools";

export interface SelectionPanelProps {
  readonly diagram: Diagram;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

/** The editor side of a node-and-edge chart type: toolbox, inspector panels and keys. */
export interface KindUi {
  readonly tools: readonly ToolDef[];
  /** Extra toolbar buttons, such as one per C4 element type. */
  readonly Palette?: ComponentType<{ canvasCentre: () => { x: number; y: number } }>;
  /** Shown above the shape and connector properties when something is selected. */
  readonly SelectionPanel?: ComponentType<SelectionPanelProps>;
  /** Shown when nothing is selected, above the appearance settings. */
  readonly Settings?: ComponentType<{ diagram: Diagram }>;
  /** Tab and Enter with one shape selected. Return true when handled. */
  readonly onTab?: (nodeId: string) => boolean;
  readonly onEnter?: (nodeId: string) => boolean;
}

const UIS: Partial<Record<ChartType, KindUi>> = {
  architecture: architectureUi,
};

export function kindUi(chartType: ChartType | undefined): KindUi | undefined {
  return chartType ? UIS[chartType] : undefined;
}
