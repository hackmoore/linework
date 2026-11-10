import type { ReactElement } from "react";
import type { Diagram } from "@linework/shared";
import { GanttChartContent } from "../gantt/GanttSvg";
import { AXIS_HEIGHT, computeGanttLayout, LABEL_COLUMN_WIDTH } from "../gantt/layout";
import { KanbanChartContent } from "../kanban/KanbanSvg";
import { computeKanbanLayout } from "../kanban/layout";
import { computeRoadmapLayout, LANE_COLUMN_WIDTH } from "../roadmap/layout";
import { RoadmapChartContent } from "../roadmap/RoadmapSvg";

export interface ChartDrawing {
  readonly width: number;
  readonly height: number;
  /** SVG content drawn from (0, 0) to (width, height). */
  readonly content: ReactElement;
}

/**
 * Static drawing of a structured chart (gantt, kanban, roadmap) for export, thumbnails and
 * presenting. Null for freeform diagrams, which are drawn from their shapes.
 */
export function chartDrawing(diagram: Diagram): ChartDrawing | null {
  if (diagram.chartType === "gantt" && diagram.gantt) {
    const layout = computeGanttLayout(diagram.gantt);
    return {
      width: LABEL_COLUMN_WIDTH + layout.width,
      height: AXIS_HEIGHT + layout.height,
      content: <GanttChartContent layout={layout} styleId={diagram.styleId} />,
    };
  }
  if (diagram.chartType === "kanban" && diagram.kanban) {
    const layout = computeKanbanLayout(diagram.kanban);
    return {
      width: layout.width,
      height: layout.height,
      content: <KanbanChartContent layout={layout} styleId={diagram.styleId} />,
    };
  }
  if (diagram.chartType === "roadmap" && diagram.roadmap) {
    const layout = computeRoadmapLayout(diagram.roadmap);
    return {
      width: LANE_COLUMN_WIDTH + layout.width,
      height: layout.height,
      content: <RoadmapChartContent layout={layout} styleId={diagram.styleId} />,
    };
  }
  return null;
}
