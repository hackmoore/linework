import { useMemo, type ReactElement } from "react";
import { itemCount, type Diagram } from "@linework/shared";
import { chartDrawing } from "../charts/ChartSvg";
import { DiagramContent } from "../render/DiagramSvg";
import { boundsOf } from "../render/geometry";
import { buildTemplate } from "../templates/build";
import type { TemplateId } from "../templates/catalog";

interface TemplateThumbnailProps {
  readonly templateId: TemplateId;
}

/** Blank gantt and kanban templates show the "new" placeholder instead of an empty chart. */
function isEmpty(diagram: Diagram): boolean {
  return itemCount(diagram) === 0;
}

/** Live miniature of a template, drawn by the same renderer the editor uses. */
export function TemplateThumbnail({ templateId }: TemplateThumbnailProps): ReactElement {
  const diagram = useMemo(() => buildTemplate(templateId), [templateId]);

  const chart = diagram.chartType === "freeform" || isEmpty(diagram) ? null : chartDrawing(diagram);
  if (chart) {
    return (
      <svg
        viewBox={`0 0 ${String(chart.width)} ${String(chart.height)}`}
        preserveAspectRatio="xMinYMin slice"
        role="img"
        aria-label={`${diagram.title} preview`}
      >
        {chart.content}
      </svg>
    );
  }

  const bounds = boundsOf(diagram.nodes);
  if (!bounds) {
    return (
      <svg viewBox="0 0 160 90" role="img" aria-label="Blank preview">
        <rect
          x="45"
          y="22"
          width="70"
          height="46"
          rx="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <path d="M80 36v18M71 45h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  const pad = 20;
  return (
    <svg
      viewBox={`${String(bounds.x - pad)} ${String(bounds.y - pad)} ${String(bounds.width + pad * 2)} ${String(bounds.height + pad * 2)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${diagram.title} preview`}
    >
      <DiagramContent diagram={diagram} />
    </svg>
  );
}
