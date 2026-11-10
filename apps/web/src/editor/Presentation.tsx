import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { Diagram } from "@linework/shared";
import { chartDrawing } from "../charts/ChartSvg";
import { DiagramContent, visibleNodesInOrder } from "../render/DiagramSvg";
import { type Rect } from "../render/geometry";
import { contentBounds, laneBands } from "../flowchart/model";

interface Slide {
  readonly title: string;
  readonly bounds: Rect;
}

/**
 * Slides for a freeform diagram or flowchart: the whole diagram first, then each swimlane
 * and each group (container) in reading order, so a diagram laid out in lanes or groups
 * presents as a walkthrough.
 */
export function slidesFor(diagram: Diagram): Slide[] {
  const nodes = visibleNodesInOrder(diagram);
  const all = contentBounds(diagram, nodes);
  if (!all) return [{ title: diagram.title, bounds: { x: 0, y: 0, width: 800, height: 450 } }];
  const groups = nodes
    .filter((n) => n.kind === "container")
    .sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x))
    .map((n) => ({
      title: n.label || "Group",
      bounds: { x: n.x, y: n.y, width: n.width, height: n.height },
    }));
  const lanes = laneBands(diagram).map((band) => ({
    title: band.lane.name || "Lane",
    bounds: { x: band.x, y: band.y, width: band.width, height: band.height },
  }));
  return [{ title: diagram.title, bounds: all }, ...lanes, ...groups];
}

const PAD = 40;

export function Presentation({ diagram, onExit }: { diagram: Diagram; onExit: () => void }): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Gantt charts and kanban boards present as one slide; freeform diagrams step through groups.
  const chart = useMemo(() => chartDrawing(diagram), [diagram]);
  const slides = useMemo(() => (chart ? [] : slidesFor(diagram)), [chart, diagram]);
  const count = chart ? 1 : slides.length;

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onExit();
  }, [onExit]);

  useEffect(() => {
    rootRef.current?.focus();
    void rootRef.current?.requestFullscreen().catch(() => undefined);
    const onFullscreenChange = (): void => {
      if (!document.fullscreenElement) onExit();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [onExit]);

  const go = (delta: number): void => {
    setIndex((i) => Math.min(count - 1, Math.max(0, i + delta)));
  };

  const slide = slides[index];
  let content: ReactElement;
  if (chart) {
    content = (
      <svg
        className="presentation__svg"
        viewBox={`0 0 ${String(chart.width)} ${String(chart.height)}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {chart.content}
      </svg>
    );
  } else {
    const b = slide?.bounds ?? { x: 0, y: 0, width: 800, height: 450 };
    content = (
      <svg
        className="presentation__svg"
        viewBox={`${String(b.x - PAD)} ${String(b.y - PAD)} ${String(b.width + PAD * 2)} ${String(b.height + PAD * 2)}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <DiagramContent diagram={diagram} />
      </svg>
    );
  }

  return (
    <div
      ref={rootRef}
      className="presentation"
      role="dialog"
      aria-modal="true"
      aria-label={`Presenting ${diagram.title}`}
      tabIndex={-1}
      style={{ background: diagram.background === "transparent" ? "#ffffff" : diagram.background }}
      onKeyDown={(event) => {
        if (event.key === "Escape") exit();
        else if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") go(1);
        else if (event.key === "ArrowLeft" || event.key === "PageUp") go(-1);
        else if (event.key === "Home") setIndex(0);
        else if (event.key === "End") setIndex(count - 1);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        // Click the right half to advance, the left half to go back.
        const rect = event.currentTarget.getBoundingClientRect();
        go(event.clientX > rect.left + rect.width / 2 ? 1 : -1);
      }}
    >
      {content}
      <div
        className="presentation__bar"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <span>{chart ? diagram.title : slide?.title}</span>
        {count > 1 && (
          <span className="presentation__count">
            {index + 1} / {count}
          </span>
        )}
        <button type="button" className="btn btn--sm" onClick={exit}>
          Exit (Esc)
        </button>
      </div>
    </div>
  );
}
