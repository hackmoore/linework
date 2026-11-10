import type { ChartType, Diagram, DiagramEdge, DiagramNode, ShapeKind } from "@linework/shared";
import type { LayoutDirection } from "../editor/arrange";

/*
 * Node-and-edge chart types (architecture, entity-relationship, org, mind map, class and
 * state diagrams) run on the shared canvas. Each one describes what makes it different here,
 * so the store, layout, import and export code can stay generic.
 *
 * Each type's model lives in its own folder and is listed in kinds/registry.ts. Models must
 * stay free of the editor store and React, because the store imports them. Editor actions and
 * panels for each type are listed in kinds/ui.tsx instead.
 */

export interface KindExport {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly mime: string;
  /** File extension, without the dot. */
  readonly extension: string;
  readonly build: (diagram: Diagram) => string;
}

export type KindImportResult = { ok: true; diagram: Diagram } | { ok: false; error: string };

export interface KindImporter {
  /** Whether this importer understands the text, judging by content and file name. */
  readonly matches: (text: string, fileName: string) => boolean;
  readonly run: (text: string, title: string) => KindImportResult;
}

/** A problem worth fixing, shown under Checks. Selecting it selects the shapes involved. */
export interface KindIssue {
  readonly message: string;
  readonly nodeIds?: readonly string[];
  readonly edgeIds?: readonly string[];
}

export interface KindModel {
  /** Styling for a shape added with a toolbar tool. */
  readonly nodeStyle?: (kind: ShapeKind) => Partial<DiagramNode>;
  /** Defaults for a new connector drawn from `source` to `target`. */
  readonly edgeDefaults?: (diagram: Diagram, source: string, target: string) => Partial<DiagramEdge>;
  /** Automatic layout. Direction is a hint from the inspector's layout buttons. */
  readonly tidy?: (diagram: Diagram, direction?: LayoutDirection) => Diagram;
  readonly toMermaid?: (diagram: Diagram) => string;
  readonly exports?: readonly KindExport[];
  readonly importers?: readonly KindImporter[];
  readonly checks?: (diagram: Diagram) => readonly KindIssue[];
  /** Which way elbow connectors leave their source, such as always down in an org chart. */
  readonly elbowAxis?: (diagram: Diagram) => "TB" | "LR";
}

/** Chart types drawn on the canvas, as opposed to gantt charts, kanban boards and roadmaps. */
export function isCanvasChart(chartType: ChartType): boolean {
  return chartType !== "gantt" && chartType !== "kanban" && chartType !== "roadmap";
}
