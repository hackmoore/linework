import type { ReactElement } from "react";
import type { DependencyType } from "@linework/shared";
import { getStyle, type DiagramStyle } from "../diagram/styles";
import { StrokedPath } from "../render/DiagramSvg";
import { shapePath } from "../render/geometry";
import { AXIS_HEIGHT, LABEL_COLUMN_WIDTH, ROW_HEIGHT, type GanttLayout, type GanttRow } from "./layout";

const BAR_INSET = 8;
const MILESTONE_SIZE = 9;
/** How far a dependency line runs out from a bar edge before it turns. */
const DEPENDENCY_GAP = 8;
/** Owner label offset from the bar end, clear of the dependency line's turn. */
const OWNER_OFFSET = DEPENDENCY_GAP + 10;
const GRID_COLOR = "#e5e7eb";
const MUTED_TEXT = "#6b7280";
const TEXT = "#1f2937";
const TODAY_COLOR = "#dc2626";
const CRITICAL_COLOR = "#dc2626";

type TaskRow = Extract<GanttRow, { type: "task" }>;
type SectionRow = Extract<GanttRow, { type: "section" }>;

/** Summary bracket spanning a section's tasks, filled to its overall progress. */
function SectionSummaryBar({ row }: { row: SectionRow }): ReactElement | null {
  const { summary, section } = row;
  if (!summary) return null;
  const y = row.y + ROW_HEIGHT / 2 - 4;
  const width = Math.max(4, summary.x2 - summary.x1);
  return (
    <g pointerEvents="none">
      <rect x={summary.x1} y={y} width={width} height={8} rx={2} fill={tint(section.color, "55")} />
      <rect
        x={summary.x1}
        y={y}
        width={(width * summary.progress) / 100}
        height={8}
        rx={2}
        fill={section.color}
      />
      <path
        d={`M${String(summary.x1)} ${String(y)}v13l5-5M${String(summary.x1 + width)} ${String(y)}v13l-5-5`}
        fill="none"
        stroke={section.color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <text
        x={summary.x1 + width + 8}
        y={y + 4}
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill={MUTED_TEXT}
      >
        {`${String(summary.progress)}%`}
      </text>
    </g>
  );
}

const tint = (color: string, alpha: string): string => `${color.slice(0, 7)}${alpha}`;

interface AxisProps {
  readonly layout: GanttLayout;
  readonly style: DiagramStyle;
}

/** Two-tier date header: months (or years) above days, weeks or months. */
export function GanttAxisContent({ layout, style }: AxisProps): ReactElement {
  const half = AXIS_HEIGHT / 2;
  return (
    <g fontFamily={style.fontFamily} fontSize={12}>
      <rect width={layout.width} height={AXIS_HEIGHT} fill="#f9fafb" />
      {layout.majorTicks.map((tick) => (
        <g key={`M${String(tick.x)}`}>
          <line x1={tick.x} x2={tick.x} y1={0} y2={half} stroke={GRID_COLOR} />
          <text x={tick.x + 8} y={half / 2} dominantBaseline="central" fill={TEXT} fontWeight={600}>
            {tick.width > 60 ? tick.label : ""}
          </text>
        </g>
      ))}
      {layout.minorTicks.map((tick) => (
        <g key={`m${String(tick.x)}`}>
          <line x1={tick.x} x2={tick.x} y1={half} y2={AXIS_HEIGHT} stroke={GRID_COLOR} />
          <text
            x={tick.x + tick.width / 2}
            y={half + half / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={MUTED_TEXT}
          >
            {tick.width >= 22 ? tick.label : ""}
          </text>
        </g>
      ))}
      <line x1={0} x2={layout.width} y1={half} y2={half} stroke={GRID_COLOR} />
      <line x1={0} x2={layout.width} y1={AXIS_HEIGHT - 0.5} y2={AXIS_HEIGHT - 0.5} stroke="#d1d5db" />
    </g>
  );
}

/** Where a dependency line attaches to a task: its start (left) or finish (right) edge. */
function anchorX(row: TaskRow, side: "start" | "finish"): number {
  if (row.task.kind === "milestone") {
    const cx = (row.x1 + row.x2) / 2;
    return side === "start" ? cx - MILESTONE_SIZE : cx + MILESTONE_SIZE;
  }
  return side === "start" ? row.x1 : row.x2;
}

/**
 * Elbow path for a dependency. FS joins the predecessor's finish to the successor's start;
 * SS, FF and SF use the matching edges. Lines leave and enter horizontally.
 */
function dependencyPath(from: TaskRow, to: TaskRow, type: DependencyType): { d: string; head: string } {
  const fromSide = type === "FS" || type === "FF" ? "finish" : "start";
  const toSide = type === "FS" || type === "SS" ? "start" : "finish";
  const fromX = anchorX(from, fromSide);
  const toX = anchorX(to, toSide);
  const y1 = from.y + ROW_HEIGHT / 2;
  const y2 = to.y + ROW_HEIGHT / 2;
  const gap = DEPENDENCY_GAP;
  const out = fromSide === "finish" ? 1 : -1;
  // Arrive moving right into a start edge, moving left into a finish edge.
  const arrive = toSide === "start" ? 1 : -1;
  const exitX = fromX + out * gap;
  const approachX = toX - arrive * gap;
  let d: string;
  if ((approachX - exitX) * arrive >= 0 && out === arrive) {
    d = `M${String(fromX)} ${String(y1)}H${String(exitX)}V${String(y2)}H${String(toX)}`;
  } else {
    // Route through the gap between rows when the line would double back.
    const between = to.y > from.y ? to.y : to.y + ROW_HEIGHT;
    d = `M${String(fromX)} ${String(y1)}H${String(exitX)}V${String(between)}H${String(approachX)}V${String(y2)}H${String(toX)}`;
  }
  const head = `M${String(toX - arrive * 6)} ${String(y2 - 4)}L${String(toX)} ${String(y2)}L${String(toX - arrive * 6)} ${String(y2 + 4)}Z`;
  return { d, head };
}

interface TaskBarProps {
  readonly row: TaskRow;
  readonly style: DiagramStyle;
  readonly selected: boolean;
  readonly interactive: boolean;
  readonly critical: boolean;
}

function TaskBar({ row, style, selected, interactive, critical }: TaskBarProps): ReactElement {
  const { task, color } = row;
  // With a baseline, the bar moves up to make room for the thin baseline bar underneath.
  const hasBaseline = row.baseline !== null;
  const cy = row.y + ROW_HEIGHT / 2 - (hasBaseline ? 3 : 0);
  const outlineColor = critical ? CRITICAL_COLOR : color;
  const baselineBar = row.baseline && (
    <rect
      x={row.baseline.x1 + 1}
      y={row.y + ROW_HEIGHT - 10}
      width={Math.max(3, row.baseline.x2 - row.baseline.x1 - 2)}
      height={4}
      rx={2}
      fill="#9ca3af"
      pointerEvents="none"
    >
      <title>Baseline</title>
    </rect>
  );
  if (task.kind === "milestone") {
    const cx = (row.x1 + row.x2) / 2;
    const d = `M${String(cx)} ${String(cy - MILESTONE_SIZE)}L${String(cx + MILESTONE_SIZE)} ${String(cy)}L${String(cx)} ${String(cy + MILESTONE_SIZE)}L${String(cx - MILESTONE_SIZE)} ${String(cy)}Z`;
    return (
      <g data-task-id={task.id} className={interactive ? "gantt-bar" : undefined}>
        {baselineBar}
        {selected && <circle cx={cx} cy={cy} r={MILESTONE_SIZE + 5} className="gantt-bar__selection" />}
        <StrokedPath
          d={d}
          fill={color}
          stroke={outlineColor}
          strokeWidth={critical ? 2.5 : 1.5}
          pattern="solid"
          sketchy={style.sketchy}
          roughness={style.roughness}
          seedKey={task.id}
        />
        <text
          x={cx + MILESTONE_SIZE + 8}
          y={cy}
          dominantBaseline="central"
          fontSize={12}
          fill={TEXT}
          fontWeight={600}
        >
          {task.name}
        </text>
        {interactive && (
          <>
            <rect
              data-gantt-handle="move"
              x={cx - MILESTONE_SIZE}
              y={row.y + BAR_INSET}
              width={MILESTONE_SIZE * 2}
              height={ROW_HEIGHT - BAR_INSET * 2}
              fill="transparent"
              className="gantt-bar__body"
            />
            <circle
              data-gantt-handle="link"
              cx={cx + MILESTONE_SIZE + 2}
              cy={cy + MILESTONE_SIZE + 4}
              r={4.5}
              className="gantt-bar__link"
            />
          </>
        )}
      </g>
    );
  }
  const x = row.x1 + 1;
  const width = Math.max(4, row.x2 - row.x1 - 2);
  const y = row.y + (hasBaseline ? BAR_INSET - 3 : BAR_INSET);
  const height = ROW_HEIGHT - BAR_INSET * 2 - (hasBaseline ? 3 : 0);
  const radius = Math.min(6, height / 2);
  const outline = shapePath("rounded", { x, y, width, height }, radius);
  const progressWidth = (width * task.progress) / 100;
  const progress =
    progressWidth > 0
      ? shapePath("rounded", { x, y, width: Math.max(progressWidth, radius * 2), height }, radius)
      : "";
  return (
    <g data-task-id={task.id} className={interactive ? "gantt-bar" : undefined}>
      {baselineBar}
      {selected && (
        <rect
          x={x - 3}
          y={y - 3}
          width={width + 6}
          height={height + 6}
          rx={radius + 3}
          className="gantt-bar__selection"
        />
      )}
      <StrokedPath
        d={outline}
        fill={tint(color, "2e")}
        stroke={outlineColor}
        strokeWidth={critical ? 2.5 : 1.5}
        pattern="solid"
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={task.id}
      />
      {progress && (
        <StrokedPath
          d={progress}
          fill={color}
          stroke={color}
          strokeWidth={1}
          pattern="solid"
          sketchy={style.sketchy}
          roughness={style.roughness}
          seedKey={`${task.id}p`}
        />
      )}
      {task.owner && (
        <text x={row.x2 + OWNER_OFFSET} y={cy} dominantBaseline="central" fontSize={12} fill={MUTED_TEXT}>
          {task.owner}
        </text>
      )}
      {interactive && (
        <>
          <rect
            data-gantt-handle="move"
            x={x}
            y={y}
            width={width}
            height={height}
            fill="transparent"
            className="gantt-bar__body"
          />
          <rect
            data-gantt-handle="start"
            x={x - 3}
            y={y}
            width={7}
            height={height}
            fill="transparent"
            className="gantt-bar__edge"
          />
          <rect
            data-gantt-handle="end"
            x={x + width - 4}
            y={y}
            width={7}
            height={height}
            fill="transparent"
            className="gantt-bar__edge"
          />
          <circle data-gantt-handle="link" cx={x + width + 7} cy={cy} r={4.5} className="gantt-bar__link" />
        </>
      )}
    </g>
  );
}

export interface GanttBodyProps {
  readonly layout: GanttLayout;
  readonly style: DiagramStyle;
  readonly selectedIds?: ReadonlySet<string>;
  readonly interactive?: boolean;
}

/** Rows, bars, dependency arrows and the today line, in timeline coordinates. */
export function GanttBodyContent({
  layout,
  style,
  selectedIds,
  interactive = false,
}: GanttBodyProps): ReactElement {
  const taskRows = new Map<string, TaskRow>();
  for (const row of layout.rows) if (row.type === "task") taskRows.set(row.task.id, row);
  return (
    <g fontFamily={style.fontFamily}>
      <rect width={layout.width} height={layout.height} fill="#ffffff" data-gantt-background="" />
      {layout.weekendDays.map((offset) => (
        <rect
          key={offset}
          x={offset * layout.dayWidth}
          width={layout.dayWidth}
          height={layout.height}
          fill="#f3f4f6"
          pointerEvents="none"
        />
      ))}
      {layout.rows.map((row) =>
        row.type === "section" ? (
          <rect
            key={row.section.id}
            y={row.y}
            width={layout.width}
            height={ROW_HEIGHT}
            fill={tint(row.section.color, "12")}
            pointerEvents="none"
          />
        ) : selectedIds?.has(row.task.id) ? (
          <rect
            key={row.task.id}
            y={row.y}
            width={layout.width}
            height={ROW_HEIGHT}
            fill="#4f46e510"
            pointerEvents="none"
          />
        ) : null,
      )}
      {layout.minorTicks.map((tick) => (
        <line
          key={tick.x}
          x1={tick.x}
          x2={tick.x}
          y1={0}
          y2={layout.height}
          stroke={GRID_COLOR}
          strokeWidth={1}
          pointerEvents="none"
        />
      ))}
      {layout.rows.map((row) => (
        <line
          key={`l${String(row.y)}`}
          x1={0}
          x2={layout.width}
          y1={row.y + ROW_HEIGHT - 0.5}
          y2={row.y + ROW_HEIGHT - 0.5}
          stroke="#f0f1f3"
          pointerEvents="none"
        />
      ))}
      {layout.rows.map((row) =>
        row.type === "section" && row.summary ? (
          <SectionSummaryBar key={`sum${row.section.id}`} row={row} />
        ) : null,
      )}
      <g pointerEvents="none">
        {[...taskRows.values()].flatMap((to) =>
          to.task.dependencies.map((dep) => {
            const from = taskRows.get(dep.taskId);
            if (!from) return null;
            const { d, head } = dependencyPath(from, to, dep.type);
            const critical = layout.critical?.criticalLinks.has(`${dep.taskId}>${to.task.id}`) ?? false;
            const color = critical ? CRITICAL_COLOR : "#6b7280";
            return (
              <g key={`${dep.taskId}-${to.task.id}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={critical ? 2 : 1.4}
                  strokeLinejoin="round"
                />
                <path d={head} fill={color} />
              </g>
            );
          }),
        )}
      </g>
      {[...taskRows.values()].map((row) => (
        <TaskBar
          key={row.task.id}
          row={row}
          style={style}
          selected={selectedIds?.has(row.task.id) ?? false}
          interactive={interactive}
          critical={layout.critical?.timings.get(row.task.id)?.critical ?? false}
        />
      ))}
      {layout.todayX !== null && (
        <g pointerEvents="none">
          <line
            x1={layout.todayX}
            x2={layout.todayX}
            y1={0}
            y2={layout.height}
            stroke={TODAY_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </g>
      )}
    </g>
  );
}

interface ChartProps {
  readonly layout: GanttLayout;
  readonly styleId: string;
}

/** Whole chart (name column, date axis and timeline) as SVG content, for export and previews. */
export function GanttChartContent({ layout, styleId }: ChartProps): ReactElement {
  const style = getStyle(styleId);
  return (
    <g fontFamily={style.fontFamily}>
      <rect width={LABEL_COLUMN_WIDTH + layout.width} height={AXIS_HEIGHT + layout.height} fill="#ffffff" />
      <rect width={LABEL_COLUMN_WIDTH} height={AXIS_HEIGHT} fill="#f9fafb" />
      <text
        x={16}
        y={AXIS_HEIGHT / 2}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
        fill={MUTED_TEXT}
      >
        TASK
      </text>
      <g transform={`translate(0 ${String(AXIS_HEIGHT)})`}>
        {layout.rows.map((row) =>
          row.type === "section" ? (
            <g key={row.section.id}>
              <rect
                y={row.y}
                width={LABEL_COLUMN_WIDTH}
                height={ROW_HEIGHT}
                fill={tint(row.section.color, "12")}
              />
              <rect y={row.y} width={4} height={ROW_HEIGHT} fill={row.section.color} />
              <text
                x={16}
                y={row.y + ROW_HEIGHT / 2}
                dominantBaseline="central"
                fontSize={13}
                fontWeight={700}
                fill={TEXT}
              >
                {row.section.name}
              </text>
            </g>
          ) : (
            <text
              key={row.task.id}
              x={row.indent ? 30 : 16}
              y={row.y + ROW_HEIGHT / 2}
              dominantBaseline="central"
              fontSize={13}
              fill={TEXT}
            >
              {row.task.kind === "milestone" ? `◆ ${row.task.name}` : row.task.name}
            </text>
          ),
        )}
      </g>
      <line
        x1={LABEL_COLUMN_WIDTH - 0.5}
        x2={LABEL_COLUMN_WIDTH - 0.5}
        y1={0}
        y2={AXIS_HEIGHT + layout.height}
        stroke="#d1d5db"
      />
      <g transform={`translate(${String(LABEL_COLUMN_WIDTH)} 0)`}>
        <GanttAxisContent layout={layout} style={style} />
        <g transform={`translate(0 ${String(AXIS_HEIGHT)})`}>
          <GanttBodyContent layout={layout} style={style} />
        </g>
      </g>
    </g>
  );
}
