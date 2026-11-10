import { useMemo, useRef, useState, type ChangeEvent, type PointerEvent, type ReactElement } from "react";
import { fromDayNumber, ROADMAP_SCALES, type RoadmapData, type RoadmapItem } from "@linework/shared";
import { useEditor } from "../editor/store";
import { CommitInput } from "../gantt/inputs";
import {
  addItem,
  addLane,
  resizeItem,
  roadmapRecipe,
  shiftItem,
  updateLane,
  updateRoadmapSettings,
} from "./actions";
import { importRoadmapCsv } from "./io";
import { AXIS_HEIGHT, computeRoadmapLayout, dayAtX, laneAtY, type RoadmapLayout } from "./layout";
import { SCALE_LABELS } from "./model";
import { RoadmapAxisContent, RoadmapBodyContent } from "./RoadmapSvg";

const LANE_WIDTH = 200;
/** Drags snap to whole days, or whole weeks when zoomed out to quarters. */
const SNAP_DAYS = { week: 1, month: 1, quarter: 7 } as const;

interface Gesture {
  readonly type: "move" | "start" | "end";
  readonly item: RoadmapItem;
  readonly origin: RoadmapData;
  readonly startX: number;
  started: boolean;
}

export function RoadmapEditor(): ReactElement | null {
  const roadmap = useEditor((s) => s.diagram?.roadmap);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const selectedIds = useEditor((s) => s.selection.taskIds);
  const layout = useMemo(() => (roadmap ? computeRoadmapLayout(roadmap) : null), [roadmap]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  if (!roadmap || !layout) return null;

  const scrollToToday = (): void => {
    const el = scrollRef.current;
    if (!el || layout.todayX === null) return;
    el.scrollTo({ left: Math.max(0, layout.todayX - (el.clientWidth - LANE_WIDTH) / 3), behavior: "smooth" });
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importRoadmapCsv(await file.text(), roadmap);
    if (!result.ok) {
      setImportError(`Couldn't import ${file.name}: ${result.error}`);
      return;
    }
    setImportError(null);
    const added = result.data.items.length - roadmap.items.length;
    if (
      roadmap.items.length > 0 &&
      !window.confirm(`Add ${String(added)} items from ${file.name} to this roadmap? You can undo this.`)
    )
      return;
    useEditor.getState().commit(roadmapRecipe(() => result.data));
  };

  return (
    <div className="roadmap">
      <div className="gantt__toolbar" role="toolbar" aria-label="Roadmap">
        <button type="button" className="btn btn--sm" onClick={() => void addItem("item")}>
          + Item
        </button>
        <button type="button" className="btn btn--sm" onClick={() => void addItem("milestone")}>
          + Milestone
        </button>
        <button type="button" className="btn btn--sm" onClick={() => void addLane()}>
          + Lane
        </button>
        <div className="segmented" role="radiogroup" aria-label="Timescale">
          {ROADMAP_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              role="radio"
              aria-checked={roadmap.scale === scale}
              className={`segmented__option${roadmap.scale === scale ? " segmented__option--active" : ""}`}
              onClick={() => {
                updateRoadmapSettings({ scale });
              }}
            >
              {SCALE_LABELS[scale]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={scrollToToday}
          disabled={layout.todayX === null}
        >
          Today
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm gantt__toolbar-end"
          title="Import items from a CSV file"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Import CSV
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => void onImport(event)}
        />
      </div>
      {importError && (
        <p className="error-text gantt__error" role="alert">
          {importError}
        </p>
      )}
      <div className="gantt__scroll" ref={scrollRef}>
        <div
          className="gantt__grid"
          style={{ gridTemplateColumns: `${String(LANE_WIDTH)}px ${String(layout.width)}px` }}
        >
          <div className="gantt__corner roadmap__corner" style={{ height: AXIS_HEIGHT }}>
            Lanes
          </div>
          <div className="gantt__axis">
            <svg width={layout.width} height={AXIS_HEIGHT} aria-hidden="true">
              <RoadmapAxisContent layout={layout} />
            </svg>
          </div>
          <LaneColumn layout={layout} />
          <Timeline layout={layout} roadmap={roadmap} styleId={styleId} selected={selected} />
        </div>
        {roadmap.items.length === 0 && (
          <div className="gantt__empty">
            <h2>Add your first item</h2>
            <p>
              Items are bars of work in a lane. Double-click a lane at a date, or use + Item. Drag bars to
              move them, and drag their ends to change dates.
            </p>
            <div className="editor-message__actions">
              <button type="button" className="btn btn--primary" onClick={() => void addItem("item")}>
                Add an item
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  fileInput.current?.click();
                }}
              >
                Import CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LaneColumn({ layout }: { layout: RoadmapLayout }): ReactElement {
  return (
    <div className="roadmap__lanes" style={{ height: layout.height - AXIS_HEIGHT }}>
      {layout.lanes.map(({ lane, height, itemCount }) => (
        <div key={lane.id} className="roadmap-lane" style={{ height }}>
          <span className="roadmap-lane__color" style={{ background: lane.color }} />
          <button
            type="button"
            className="roadmap-lane__toggle"
            aria-expanded={!lane.collapsed}
            aria-label={`${lane.collapsed ? "Expand" : "Collapse"} ${lane.name}`}
            onClick={() => {
              updateLane(lane.id, { collapsed: !lane.collapsed });
            }}
          >
            {lane.collapsed ? "▸" : "▾"}
          </button>
          <CommitInput
            key={lane.name}
            className="roadmap-lane__name"
            label="Lane name"
            maxLength={100}
            value={lane.name}
            onCommit={(name) => {
              updateLane(lane.id, { name: name.trim() || "Untitled lane" });
            }}
          />
          <span className="roadmap-lane__count" title={`${String(itemCount)} items`}>
            {itemCount}
          </span>
        </div>
      ))}
    </div>
  );
}

interface TimelineProps {
  readonly layout: RoadmapLayout;
  readonly roadmap: RoadmapData;
  readonly styleId: string;
  readonly selected: ReadonlySet<string>;
}

function Timeline({ layout, roadmap, styleId, selected }: TimelineProps): ReactElement {
  const gestureRef = useRef<Gesture | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const snap = SNAP_DAYS[roadmap.scale];

  // Body coordinates: the SVG starts below the sticky axis.
  const localPoint = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) + AXIS_HEIGHT };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return;
    const state = useEditor.getState();
    const target = event.target as Element;
    const itemId = target.closest("[data-item-id]")?.getAttribute("data-item-id");
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
    const item = itemId ? roadmap.items.find((i) => i.id === itemId) : undefined;
    if (!item) {
      state.clearSelection();
      return;
    }
    if (event.shiftKey) {
      const ids = state.selection.taskIds;
      state.select({ taskIds: ids.includes(item.id) ? ids.filter((i) => i !== item.id) : [...ids, item.id] });
      return;
    }
    state.select({ taskIds: [item.id] });
    if (handle !== "move" && handle !== "start" && handle !== "end") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { type: handle, item, origin: roadmap, startX: localPoint(event).x, started: false };
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    const g = gestureRef.current;
    if (!g) return;
    const p = localPoint(event);
    const days = Math.round((p.x - g.startX) / layout.dayWidth / snap) * snap;
    const lane = g.type === "move" ? laneAtY(layout, p.y)?.lane.id : undefined;
    if (!g.started) {
      if (days === 0 && (lane === undefined || lane === g.item.laneId)) return;
      g.started = true;
      useEditor.getState().checkpoint();
    }
    const next =
      g.type === "move" ? shiftItem(g.item, days, lane ?? g.item.laneId) : resizeItem(g.item, g.type, days);
    const { origin } = g;
    useEditor
      .getState()
      .transient(
        roadmapRecipe(() => ({ ...origin, items: origin.items.map((i) => (i.id === next.id ? next : i)) })),
      );
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>): void => {
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    if ((event.target as Element).closest("[data-item-id]")) return;
    const p = localPoint(event);
    const lane = laneAtY(layout, p.y);
    addItem("item", {
      ...(lane ? { laneId: lane.lane.id } : {}),
      start: fromDayNumber(dayAtX(layout, p.x)),
    });
  };

  const bodyHeight = layout.height - AXIS_HEIGHT;
  return (
    <div className="gantt__body">
      <svg
        ref={svgRef}
        width={layout.width}
        height={bodyHeight}
        viewBox={`0 ${String(AXIS_HEIGHT)} ${String(layout.width)} ${String(bodyHeight)}`}
        className="gantt__svg roadmap__svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        role="application"
        aria-label="Roadmap timeline. Drag items to move them, drag their ends to change dates, double-click a lane to add an item."
      >
        <RoadmapBodyContent layout={layout} styleId={styleId} selectedIds={selected} interactive />
      </svg>
    </div>
  );
}
