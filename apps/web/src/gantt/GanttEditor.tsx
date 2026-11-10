import { useMemo, useRef, useState, type ChangeEvent, type PointerEvent, type ReactElement } from "react";
import { fromDayNumber, GANTT_SCALES, toDayNumber, type GanttData, type GanttTask } from "@linework/shared";
import { getStyle } from "../diagram/styles";
import { useEditor } from "../editor/store";
import { useUi } from "../editor/ui";
import {
  addDependency,
  addSection,
  addTask,
  deleteSection,
  ganttRecipe,
  moveSection,
  moveTask,
  moveTaskStart,
  setTaskDuration,
  toggleSection,
  updateGanttSettings,
  updateSection,
  updateTask,
} from "./actions";
import { GanttAxisContent, GanttBodyContent } from "./GanttSvg";
import { CommitInput, DateInput, NumberCommitInput } from "./inputs";
import { importGanttFile } from "./io";
import {
  AXIS_HEIGHT,
  computeGanttLayout,
  dayAtX,
  isoAtOffset,
  ROW_HEIGHT,
  type GanttLayout,
  type GanttRow,
} from "./layout";
import { calendarOf, moveTaskTo, workDuration } from "./schedule";
import { WorkloadView } from "./WorkloadView";

const SCALE_LABELS = { day: "Days", week: "Weeks", month: "Months" } as const;
const TABLE_WIDTH = 540;

type Gesture =
  | {
      type: "move" | "start" | "end";
      taskId: string;
      startX: number;
      origin: GanttData;
      task: GanttTask;
      started: boolean;
    }
  | {
      type: "link";
      taskId: string;
      from: { x: number; y: number };
      current: { x: number; y: number };
      targetId: string | null;
    };

function rowAt(layout: GanttLayout, y: number): GanttRow | undefined {
  return layout.rows.find((r) => y >= r.y && y < r.y + ROW_HEIGHT);
}

export function GanttEditor(): ReactElement | null {
  const gantt = useEditor((s) => s.diagram?.gantt);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const selectedTaskIds = useEditor((s) => s.selection.taskIds);
  const layout = useMemo(() => (gantt ? computeGanttLayout(gantt) : null), [gantt]);
  const selected = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"timeline" | "workload">("timeline");
  const [importError, setImportError] = useState<string | null>(null);

  if (!gantt || !layout) return null;
  const style = getStyle(styleId);

  const scrollToToday = (): void => {
    const el = scrollRef.current;
    if (!el || layout.todayX === null) return;
    el.scrollTo({
      left: Math.max(0, layout.todayX - (el.clientWidth - TABLE_WIDTH) / 3),
      behavior: "smooth",
    });
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importGanttFile(file.name, await file.text());
    if (!result.ok) {
      setImportError(`Couldn't import ${file.name}: ${result.error}`);
      return;
    }
    setImportError(null);
    if (
      gantt.tasks.length > 0 &&
      !window.confirm(
        `Replace the current plan with ${String(result.data.tasks.length)} tasks from ${file.name}? You can undo this.`,
      )
    ) {
      return;
    }
    // Keep this chart's display settings; take sections and tasks from the file.
    useEditor.getState().commit(
      ganttRecipe((g) => ({
        ...g,
        sections: result.data.sections,
        tasks: result.data.tasks,
        baseline: null,
      })),
    );
  };

  return (
    <div className="gantt">
      <div className="gantt__toolbar" role="toolbar" aria-label="Gantt chart">
        <div className="segmented" role="tablist" aria-label="View">
          {(["timeline", "workload"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={`segmented__option${view === v ? " segmented__option--active" : ""}`}
              onClick={() => {
                setView(v);
              }}
            >
              {v === "timeline" ? "Timeline" : "Workload"}
            </button>
          ))}
        </div>
        <span className="gantt__toolbar-divider" aria-hidden="true" />
        <button type="button" className="btn btn--sm" onClick={() => void addTask("task")}>
          + Task
        </button>
        <button type="button" className="btn btn--sm" onClick={() => void addTask("milestone")}>
          + Milestone
        </button>
        <button type="button" className="btn btn--sm" onClick={() => void addSection()}>
          + Section
        </button>
        {view === "timeline" && (
          <>
            <div className="segmented" role="radiogroup" aria-label="Timescale">
              {GANTT_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  role="radio"
                  aria-checked={gantt.scale === scale}
                  className={`segmented__option${gantt.scale === scale ? " segmented__option--active" : ""}`}
                  onClick={() => {
                    updateGanttSettings({ scale });
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
              className={`btn btn--ghost btn--sm${gantt.showCriticalPath ? " btn--toggled" : ""}`}
              aria-pressed={gantt.showCriticalPath}
              title="Highlight the tasks that set the end date"
              onClick={() => {
                updateGanttSettings({ showCriticalPath: !gantt.showCriticalPath });
              }}
            >
              Critical path
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm gantt__toolbar-end"
          title="Import tasks from CSV or Microsoft Project XML"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.xml,text/csv,application/xml,text/xml"
          hidden
          onChange={(event) => void onImport(event)}
        />
      </div>
      {importError && (
        <p className="error-text gantt__error" role="alert">
          {importError}
        </p>
      )}
      {view === "workload" ? (
        <WorkloadView gantt={gantt} />
      ) : (
        <div className="gantt__scroll" ref={scrollRef}>
          <div
            className="gantt__grid"
            style={{ gridTemplateColumns: `${String(TABLE_WIDTH)}px ${String(layout.width)}px` }}
          >
            <div className="gantt__corner" style={{ height: AXIS_HEIGHT }}>
              <span className="gantt-col gantt-col--handle" />
              <span className="gantt-col gantt-col--name">Task</span>
              <span className="gantt-col gantt-col--date">Start</span>
              <span className="gantt-col gantt-col--date">End</span>
              <span
                className="gantt-col gantt-col--num"
                title={gantt.calendar.skipWeekends ? "Duration in working days" : "Duration in days"}
              >
                Days
              </span>
              <span className="gantt-col gantt-col--num" title="Percent complete">
                %
              </span>
            </div>
            <div className="gantt__axis">
              <svg width={layout.width} height={AXIS_HEIGHT} aria-hidden="true">
                <GanttAxisContent layout={layout} style={style} />
              </svg>
            </div>
            <TaskTable layout={layout} gantt={gantt} selected={selected} />
            <Timeline layout={layout} gantt={gantt} styleId={styleId} selected={selected} />
          </div>
          {gantt.tasks.length === 0 && (
            <div className="gantt__empty">
              <h2>Plan your first task</h2>
              <p>
                Add a task, give it dates, and it appears on the timeline. Group tasks into sections for each
                phase.
              </p>
              <div className="editor-message__actions">
                <button type="button" className="btn btn--primary" onClick={() => void addTask("task")}>
                  Add a task
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    fileInput.current?.click();
                  }}
                >
                  Import CSV or MS Project
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Where a dragged row would land. */
interface DropTarget {
  readonly sectionId: string | null;
  readonly beforeTaskId: string | null;
  /** Y of the drop indicator line, in table coordinates. */
  readonly y: number;
}

function dropTargetAt(layout: GanttLayout, y: number): DropTarget | null {
  const rows = layout.rows;
  if (rows.length === 0) return null;
  const index = Math.max(0, Math.min(rows.length - 1, Math.floor(y / ROW_HEIGHT)));
  const row = rows[index];
  if (!row) return null;
  if (row.type === "section") {
    // Dropping on a section header puts the task first in that section.
    const firstTask = rows[index + 1];
    return {
      sectionId: row.section.id,
      beforeTaskId:
        firstTask?.type === "task" && firstTask.task.sectionId === row.section.id ? firstTask.task.id : null,
      y: row.y + ROW_HEIGHT,
    };
  }
  const lowerHalf = y - row.y > ROW_HEIGHT / 2;
  if (!lowerHalf) return { sectionId: row.task.sectionId, beforeTaskId: row.task.id, y: row.y };
  const next = rows[index + 1];
  return {
    sectionId: row.task.sectionId,
    beforeTaskId: next?.type === "task" && next.task.sectionId === row.task.sectionId ? next.task.id : null,
    y: row.y + ROW_HEIGHT,
  };
}

function TaskTable({
  layout,
  gantt,
  selected,
}: {
  layout: GanttLayout;
  gantt: GanttData;
  selected: ReadonlySet<string>;
}): ReactElement {
  const cal = useMemo(() => calendarOf(gantt), [gantt]);
  const comments = useEditor((s) => s.diagram?.comments);
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of comments ?? [])
      if (c.targetId && !c.resolved) counts.set(c.targetId, (counts.get(c.targetId) ?? 0) + 1);
    return counts;
  }, [comments]);
  const tableRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ taskId: string; target: DropTarget | null } | null>(null);

  const select = (id: string, additive: boolean): void => {
    const state = useEditor.getState();
    const current = state.selection.taskIds;
    if (additive) {
      state.select({ taskIds: current.includes(id) ? current.filter((t) => t !== id) : [...current, id] });
    } else if (!(current.length === 1 && current[0] === id)) {
      state.select({ taskIds: [id] });
    }
  };

  const tableY = (clientY: number): number => clientY - (tableRef.current?.getBoundingClientRect().top ?? 0);

  return (
    <div
      className="gantt__table"
      role="table"
      aria-label="Tasks"
      style={{ height: layout.height }}
      ref={tableRef}
    >
      {layout.rows.map((row) => {
        if (row.type === "section") {
          const { section, summary } = row;
          return (
            <div
              key={section.id}
              role="row"
              className="gantt-row gantt-row--section"
              style={{ height: ROW_HEIGHT, borderLeftColor: section.color }}
            >
              <button
                type="button"
                className="icon-btn gantt-row__toggle"
                aria-expanded={!section.collapsed}
                aria-label={section.collapsed ? `Expand ${section.name}` : `Collapse ${section.name}`}
                onClick={() => {
                  toggleSection(section.id);
                }}
              >
                {section.collapsed ? "▸" : "▾"}
              </button>
              <CommitInput
                key={section.name}
                className="gantt-cell-input gantt-cell-input--section"
                label="Section name"
                value={section.name}
                onCommit={(name) => {
                  updateSection(section.id, { name: name.trim() || "Untitled section" });
                }}
              />
              {summary && (
                <span className="gantt-row__summary" title={`${summary.start} to ${summary.end}`}>
                  {summary.taskCount} · {summary.progress}%
                </span>
              )}
              <div className="gantt-row__actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Add task to section"
                  aria-label={`Add task to ${section.name}`}
                  onClick={() => void addTask("task", { sectionId: section.id })}
                >
                  +
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Move section up"
                  aria-label="Move section up"
                  onClick={() => {
                    moveSection(section.id, -1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Move section down"
                  aria-label="Move section down"
                  onClick={() => {
                    moveSection(section.id, 1);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  title="Delete section and its tasks"
                  aria-label={`Delete ${section.name}`}
                  onClick={() => {
                    const count = gantt.tasks.filter((t) => t.sectionId === section.id).length;
                    if (
                      count === 0 ||
                      window.confirm(
                        `Delete "${section.name}" and its ${String(count)} task${count === 1 ? "" : "s"}?`,
                      )
                    ) {
                      deleteSection(section.id);
                    }
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        }
        const { task } = row;
        const isSelected = selected.has(task.id);
        const days = workDuration(task, cal);
        return (
          <div
            key={task.id}
            role="row"
            aria-selected={isSelected}
            className={`gantt-row${isSelected ? " gantt-row--selected" : ""}${drag?.taskId === task.id ? " gantt-row--dragging" : ""}`}
            style={{ height: ROW_HEIGHT }}
            onPointerDown={(event) => {
              select(task.id, event.shiftKey || event.metaKey);
            }}
          >
            <span
              className="gantt-col gantt-col--handle gantt-drag-handle"
              title="Drag to reorder or move to another section"
              aria-hidden="true"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag({ taskId: task.id, target: null });
              }}
              onPointerMove={(event) => {
                if (drag?.taskId !== task.id) return;
                setDrag({ taskId: task.id, target: dropTargetAt(layout, tableY(event.clientY)) });
              }}
              onPointerUp={() => {
                const target = drag?.target;
                setDrag(null);
                if (target) moveTask(task.id, target.sectionId, target.beforeTaskId);
              }}
              onPointerCancel={() => {
                setDrag(null);
              }}
            >
              ⠿
            </span>
            <span className="gantt-col gantt-col--name" style={{ paddingLeft: row.indent ? 14 : 2 }}>
              {task.kind === "milestone" && (
                <span className="gantt-milestone-icon" style={{ color: row.color }} aria-label="Milestone">
                  ◆
                </span>
              )}
              {(commentCounts.get(task.id) ?? 0) > 0 && (
                <button
                  type="button"
                  className="gantt-comment-badge"
                  title="Open comments"
                  aria-label={`${String(commentCounts.get(task.id))} comments on ${task.name}`}
                  onClick={() => {
                    const first = comments?.find((c) => c.targetId === task.id && !c.resolved);
                    if (first) useUi.getState().focusComment(first.id);
                  }}
                >
                  {commentCounts.get(task.id)}
                </button>
              )}
              <CommitInput
                key={task.name}
                className="gantt-cell-input"
                label="Task name"
                value={task.name}
                onCommit={(name) => {
                  updateTask(task.id, { name: name.trim() || "Untitled task" });
                }}
              />
            </span>
            <span className="gantt-col gantt-col--date">
              <DateInput
                className="gantt-cell-input"
                label="Start date"
                value={task.start}
                onCommit={(start) => {
                  moveTaskStart(task.id, start);
                }}
              />
            </span>
            <span className="gantt-col gantt-col--date">
              {task.kind === "milestone" ? (
                <span className="gantt-cell-muted">-</span>
              ) : (
                <DateInput
                  className="gantt-cell-input"
                  label="End date"
                  value={task.end}
                  min={task.start}
                  onCommit={(end) => {
                    updateTask(task.id, { end });
                  }}
                />
              )}
            </span>
            <span className="gantt-col gantt-col--num">
              {task.kind === "milestone" ? (
                <span className="gantt-cell-muted">-</span>
              ) : (
                <NumberCommitInput
                  key={days}
                  className="gantt-cell-input"
                  label="Duration in days"
                  value={days}
                  min={1}
                  max={3650}
                  onCommit={(n) => {
                    setTaskDuration(task.id, n);
                  }}
                />
              )}
            </span>
            <span className="gantt-col gantt-col--num">
              {task.kind === "milestone" ? (
                <span className="gantt-cell-muted">-</span>
              ) : (
                <NumberCommitInput
                  key={task.progress}
                  className="gantt-cell-input"
                  label="Percent complete"
                  value={task.progress}
                  min={0}
                  max={100}
                  onCommit={(progress) => {
                    updateTask(task.id, { progress });
                  }}
                />
              )}
            </span>
          </div>
        );
      })}
      {drag?.target && (
        <div className="gantt-drop-indicator" style={{ top: drag.target.y - 1 }} aria-hidden="true" />
      )}
    </div>
  );
}

interface TimelineProps {
  readonly layout: GanttLayout;
  readonly gantt: GanttData;
  readonly styleId: string;
  readonly selected: ReadonlySet<string>;
}

function Timeline({ layout, gantt, styleId, selected }: TimelineProps): ReactElement {
  const gestureRef = useRef<Gesture | null>(null);
  const [linkPreview, setLinkPreview] = useState<Extract<Gesture, { type: "link" }> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const localPoint = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return;
    const state = useEditor.getState();
    const target = event.target as Element;
    const taskId = target.closest("[data-task-id]")?.getAttribute("data-task-id");
    const handle = target.closest("[data-gantt-handle]")?.getAttribute("data-gantt-handle");
    const task = taskId ? gantt.tasks.find((t) => t.id === taskId) : undefined;
    if (!task || !handle) {
      state.clearSelection();
      return;
    }
    if (event.shiftKey) {
      const current = state.selection.taskIds;
      state.select({
        taskIds: current.includes(task.id) ? current.filter((t) => t !== task.id) : [...current, task.id],
      });
      return;
    }
    state.select({ taskIds: [task.id] });
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = localPoint(event);
    if (handle === "link") {
      const g: Gesture = { type: "link", taskId: task.id, from: p, current: p, targetId: null };
      gestureRef.current = g;
      setLinkPreview(g);
    } else if (handle === "move" || handle === "start" || handle === "end") {
      gestureRef.current = {
        type: handle,
        taskId: task.id,
        startX: p.x,
        origin: gantt,
        task,
        started: false,
      };
    }
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    const g = gestureRef.current;
    if (!g) return;
    const p = localPoint(event);
    if (g.type === "link") {
      const row = rowAt(layout, p.y);
      const targetId = row?.type === "task" && row.task.id !== g.taskId ? row.task.id : null;
      const next = { ...g, current: p, targetId };
      gestureRef.current = next;
      setLinkPreview(next);
      return;
    }
    const days = Math.round((p.x - g.startX) / layout.dayWidth);
    if (!g.started) {
      if (days === 0) return;
      g.started = true;
      useEditor.getState().checkpoint();
    }
    const { task, origin } = g;
    const cal = calendarOf(origin);
    const startDay = toDayNumber(task.start);
    const endDay = toDayNumber(task.end);
    let next: GanttTask;
    if (g.type === "move") next = moveTaskTo(task, startDay + days, cal);
    else if (g.type === "start") next = { ...task, start: fromDayNumber(Math.min(startDay + days, endDay)) };
    else next = { ...task, end: fromDayNumber(Math.max(endDay + days, startDay)) };
    // Always derive from the state at drag start, so dragging back undoes any auto-schedule pushes.
    useEditor
      .getState()
      .transient(
        ganttRecipe(() => ({ ...origin, tasks: origin.tasks.map((t) => (t.id === task.id ? next : t)) })),
      );
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>): void => {
    const g = gestureRef.current;
    gestureRef.current = null;
    setLinkPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (g?.type === "link" && g.targetId) {
      // Dragging from A's end onto B means B starts after A ends.
      addDependency(g.targetId, g.taskId);
    }
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    if ((event.target as Element).closest("[data-task-id]")) return;
    const p = localPoint(event);
    const row = rowAt(layout, p.y);
    const sectionId =
      row?.type === "section"
        ? row.section.id
        : row?.type === "task"
          ? row.task.sectionId
          : (gantt.sections.at(-1)?.id ?? null);
    addTask("task", { sectionId, start: isoAtOffset(layout, dayAtX(layout, p.x)) });
  };

  let preview: ReactElement | null = null;
  if (linkPreview) {
    const target = linkPreview.targetId
      ? layout.rows.find((r) => r.type === "task" && r.task.id === linkPreview.targetId)
      : undefined;
    preview = (
      <g pointerEvents="none">
        {target && (
          <rect className="gantt-link-target" x={0} y={target.y} width={layout.width} height={ROW_HEIGHT} />
        )}
        <line
          className="gantt-link-preview"
          x1={linkPreview.from.x}
          y1={linkPreview.from.y}
          x2={linkPreview.current.x}
          y2={linkPreview.current.y}
        />
      </g>
    );
  }

  return (
    <div className="gantt__body">
      <svg
        ref={svgRef}
        width={layout.width}
        height={layout.height}
        className="gantt__svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        role="application"
        aria-label="Timeline. Drag bars to reschedule, double-click empty space to add a task."
      >
        <GanttBodyContent layout={layout} style={getStyle(styleId)} selectedIds={selected} interactive />
        {preview}
      </svg>
    </div>
  );
}
