import type { ReactElement } from "react";
import { getStyle, type DiagramStyle } from "../diagram/styles";
import { StrokedPath } from "../render/DiagramSvg";
import { shapePath } from "../render/geometry";
import {
  AXIS_HEIGHT,
  BAR_HEIGHT,
  LANE_COLUMN_WIDTH,
  textWidth,
  type ItemBox,
  type RoadmapLayout,
} from "./layout";

const TEXT = "#1f2937";
const MUTED = "#6b7280";
const GRID = "#e5e7eb";
const DANGER = "#dc2626";
const TODAY = "#dc2626";

const tint = (color: string, alpha: string): string => `${color.slice(0, 7)}${alpha}`;

/** Shortens a title to fit a width, with an ellipsis. */
function fit(text: string, width: number): string {
  const max = Math.floor(width / (13 * 0.56));
  if (text.length <= max) return text;
  return max <= 1 ? "" : `${text.slice(0, max - 1)}…`;
}

/** The two-row time axis: years or months on top, columns underneath. */
export function RoadmapAxisContent({ layout }: { layout: RoadmapLayout }): ReactElement {
  const half = AXIS_HEIGHT / 2;
  return (
    <g>
      <rect width={layout.width} height={AXIS_HEIGHT} fill="#ffffff" />
      {layout.top.map((cell) => (
        <g key={`t${String(cell.x)}`}>
          <line x1={cell.x} x2={cell.x} y1={0} y2={half} stroke={GRID} />
          <text
            x={cell.x + 8}
            y={half / 2 + 1}
            dominantBaseline="central"
            fontSize={12}
            fontWeight={700}
            fill={TEXT}
          >
            {cell.label}
          </text>
        </g>
      ))}
      {layout.bottom.map((cell) => (
        <g key={`b${String(cell.x)}`}>
          <line x1={cell.x} x2={cell.x} y1={half} y2={AXIS_HEIGHT} stroke={GRID} />
          <text
            x={cell.x + cell.width / 2}
            y={half + half / 2}
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={12}
            fill={MUTED}
          >
            {cell.label}
          </text>
        </g>
      ))}
      <line x1={0} x2={layout.width} y1={half} y2={half} stroke={GRID} />
      <line x1={0} x2={layout.width} y1={AXIS_HEIGHT - 0.5} y2={AXIS_HEIGHT - 0.5} stroke="#d1d5db" />
    </g>
  );
}

function Bar({
  box,
  style,
  selected,
  interactive,
}: {
  box: ItemBox;
  style: DiagramStyle;
  selected: boolean;
  interactive: boolean;
}): ReactElement {
  const { item, x1, x2, y, color } = box;
  const status = item.status;
  const width = x2 - x1;
  const solid = status !== "planned";
  const textColor = solid ? "#ffffff" : TEXT;
  const prefix = status === "done" ? "✓ " : status === "at-risk" ? "! " : "";
  const label = `${prefix}${item.title || "Untitled"}`;
  const outline = status === "at-risk" ? DANGER : color;
  return (
    <g data-item-id={item.id} opacity={status === "done" ? 0.7 : 1}>
      {selected && (
        <rect
          x={x1 - 3}
          y={y - 3}
          width={width + 6}
          height={BAR_HEIGHT + 6}
          rx={9}
          className="roadmap-bar__selection"
          fill="none"
          stroke="#4f46e5"
          strokeWidth={2}
        />
      )}
      <StrokedPath
        d={shapePath("rounded", { x: x1, y, width, height: BAR_HEIGHT }, 6)}
        fill={solid ? color : tint(color, "26")}
        stroke={outline}
        strokeWidth={status === "at-risk" ? 2.5 : 1.5}
        pattern={status === "planned" ? "dashed" : "solid"}
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={item.id}
      />
      {box.labelInside ? (
        <text
          x={x1 + 8}
          y={y + BAR_HEIGHT / 2}
          dominantBaseline="central"
          fontSize={13}
          fontWeight={600}
          fill={textColor}
        >
          {fit(label, width - 14)}
        </text>
      ) : (
        <text
          x={x2 + 6}
          y={y + BAR_HEIGHT / 2}
          dominantBaseline="central"
          fontSize={13}
          fontWeight={600}
          fill={TEXT}
        >
          {label}
        </text>
      )}
      {item.owner && box.labelInside && width - 14 > textWidth(label) + textWidth(item.owner, 11) + 16 && (
        <text
          x={x2 - 8}
          y={y + BAR_HEIGHT / 2}
          dominantBaseline="central"
          textAnchor="end"
          fontSize={11}
          fill={solid ? "#ffffffcc" : MUTED}
        >
          {item.owner}
        </text>
      )}
      {interactive && (
        <>
          <rect
            data-handle="move"
            x={x1}
            y={y}
            width={width}
            height={BAR_HEIGHT}
            fill="transparent"
            className="roadmap-bar__body"
          />
          <rect
            data-handle="start"
            x={x1 - 3}
            y={y}
            width={7}
            height={BAR_HEIGHT}
            fill="transparent"
            className="roadmap-bar__edge"
          />
          <rect
            data-handle="end"
            x={x2 - 4}
            y={y}
            width={7}
            height={BAR_HEIGHT}
            fill="transparent"
            className="roadmap-bar__edge"
          />
        </>
      )}
      <title>{`${item.title}${item.owner ? ` (${item.owner})` : ""}: ${item.start} to ${item.end}`}</title>
    </g>
  );
}

function Milestone({
  box,
  style,
  selected,
  interactive,
}: {
  box: ItemBox;
  style: DiagramStyle;
  selected: boolean;
  interactive: boolean;
}): ReactElement {
  const { item, x1, y, color } = box;
  const cy = y + BAR_HEIGHT / 2;
  const r = 10;
  const d = `M${String(x1)} ${String(cy - r)}L${String(x1 + r)} ${String(cy)}L${String(x1)} ${String(cy + r)}L${String(x1 - r)} ${String(cy)}Z`;
  const fill = item.status === "planned" ? "#ffffff" : item.status === "at-risk" ? DANGER : color;
  return (
    <g data-item-id={item.id} opacity={item.status === "done" ? 0.7 : 1}>
      {selected && <circle cx={x1} cy={cy} r={r + 5} fill="none" stroke="#4f46e5" strokeWidth={2} />}
      <StrokedPath
        d={d}
        fill={fill}
        stroke={item.status === "at-risk" ? DANGER : color}
        strokeWidth={2}
        pattern="solid"
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={item.id}
      />
      <text x={x1 + r + 6} y={cy} dominantBaseline="central" fontSize={13} fontWeight={700} fill={TEXT}>
        {item.title || "Untitled"}
      </text>
      {interactive && (
        <rect
          data-handle="move"
          x={x1 - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          fill="transparent"
          className="roadmap-bar__body"
        />
      )}
      <title>{`${item.title}: ${item.start}`}</title>
    </g>
  );
}

export interface RoadmapBodyProps {
  readonly layout: RoadmapLayout;
  readonly styleId: string;
  readonly selectedIds?: ReadonlySet<string>;
  readonly interactive?: boolean;
}

/** Lanes, grid, today line and items, below the axis (y starts at AXIS_HEIGHT). */
export function RoadmapBodyContent({
  layout,
  styleId,
  selectedIds,
  interactive = false,
}: RoadmapBodyProps): ReactElement {
  const style = getStyle(styleId);
  return (
    <g fontFamily={style.fontFamily}>
      {layout.lanes.map((lane, i) => (
        <rect
          key={lane.lane.id}
          x={0}
          y={lane.y}
          width={layout.width}
          height={lane.height}
          fill={i % 2 === 0 ? "#ffffff" : "#f9fafb"}
        />
      ))}
      {layout.bottom.map((cell) => (
        <line key={cell.x} x1={cell.x} x2={cell.x} y1={AXIS_HEIGHT} y2={layout.height} stroke={GRID} />
      ))}
      {layout.lanes.map((lane) => (
        <line
          key={`l${lane.lane.id}`}
          x1={0}
          x2={layout.width}
          y1={lane.y + lane.height}
          y2={lane.y + lane.height}
          stroke={GRID}
        />
      ))}
      {layout.todayX !== null && (
        <g pointerEvents="none">
          <line
            x1={layout.todayX}
            x2={layout.todayX}
            y1={AXIS_HEIGHT}
            y2={layout.height}
            stroke={TODAY}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </g>
      )}
      {layout.lanes
        .filter((l) => l.lane.collapsed)
        .map((l) => (
          <text
            key={`c${l.lane.id}`}
            x={12}
            y={l.y + l.height / 2}
            dominantBaseline="central"
            fontSize={12}
            fill={MUTED}
          >
            {`${String(l.itemCount)} hidden ${l.itemCount === 1 ? "item" : "items"}`}
          </text>
        ))}
      {layout.items.map((box) =>
        box.item.kind === "milestone" ? (
          <Milestone
            key={box.item.id}
            box={box}
            style={style}
            selected={selectedIds?.has(box.item.id) ?? false}
            interactive={interactive}
          />
        ) : (
          <Bar
            key={box.item.id}
            box={box}
            style={style}
            selected={selectedIds?.has(box.item.id) ?? false}
            interactive={interactive}
          />
        ),
      )}
    </g>
  );
}

/** Whole roadmap for export: lane names on the left, then axis and timeline. */
export function RoadmapChartContent({
  layout,
  styleId,
}: {
  layout: RoadmapLayout;
  styleId: string;
}): ReactElement {
  const style = getStyle(styleId);
  return (
    <g fontFamily={style.fontFamily}>
      <rect width={LANE_COLUMN_WIDTH + layout.width} height={layout.height} fill="#ffffff" />
      <g transform={`translate(${String(LANE_COLUMN_WIDTH)} 0)`}>
        <RoadmapBodyContent layout={layout} styleId={styleId} />
        <RoadmapAxisContent layout={layout} />
      </g>
      {layout.lanes.map((lane) => (
        <g key={lane.lane.id}>
          <rect x={0} y={lane.y} width={6} height={lane.height} fill={lane.lane.color} />
          <text
            x={16}
            y={lane.y + Math.min(lane.height / 2, 30)}
            dominantBaseline="central"
            fontSize={14}
            fontWeight={700}
            fill={TEXT}
          >
            {fit(lane.lane.name || "Untitled lane", LANE_COLUMN_WIDTH - 28)}
          </text>
        </g>
      ))}
      <line
        x1={LANE_COLUMN_WIDTH - 0.5}
        x2={LANE_COLUMN_WIDTH - 0.5}
        y1={0}
        y2={layout.height}
        stroke="#d1d5db"
      />
    </g>
  );
}
