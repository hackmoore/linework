import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactElement } from "react";
import type { KanbanCard, KanbanColumn, KanbanData } from "@linework/shared";
import { getStyle } from "../diagram/styles";
import { useEditor } from "../editor/store";
import { useUi } from "../editor/ui";
import { CommitInput } from "../gantt/inputs";
import {
  addCard,
  addColumn,
  addLane,
  kanbanRecipe,
  moveCard,
  moveCardAcross,
  moveCardInColumn,
  toggleLane,
  updateColumn,
  updateLane,
} from "./actions";
import { importCards } from "./io";
import {
  boardRows,
  cardsIn,
  columnCount,
  isOverLimit,
  isOverdue,
  matchesFilter,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  type BoardRow,
} from "./model";

const CARD_MIME = "application/x-linework-card";

interface DropTarget {
  readonly columnId: string;
  readonly laneId: string | null;
  /** Card the dragged card lands before, or null for the bottom of the cell. */
  readonly beforeId: string | null;
}

function shortDate(iso: string): string {
  const [y = 2000, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

export function KanbanEditor(): ReactElement | null {
  const board = useEditor((s) => s.diagram?.kanban);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const selectedIds = useEditor((s) => s.selection.cardIds);
  const comments = useEditor((s) => s.diagram?.comments);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of comments ?? [])
      if (c.targetId && !c.resolved) counts.set(c.targetId, (counts.get(c.targetId) ?? 0) + 1);
    return counts;
  }, [comments]);
  const [filter, setFilter] = useState("");
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [adding, setAdding] = useState<{ columnId: string; laneId: string | null } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!board) return null;
  const rows = boardRows(board);
  const showLanes = board.lanes.length > 0;
  const visible = board.cards.filter((c) => matchesFilter(c, filter));
  const hidden = board.cards.length - visible.length;
  const font = getStyle(styleId).fontFamily;

  const quickAdd = (): void => {
    const card = board.cards.find((c) => c.id === selectedIds.at(-1));
    const columnId = card?.columnId ?? board.columns[0]?.id;
    if (!columnId) return;
    setAdding({ columnId, laneId: card ? card.laneId : (rows[0]?.laneId ?? null) });
  };

  const onImport = async (file: File): Promise<void> => {
    const result = importCards(board, await file.text());
    if (!result.ok) {
      setImportError(`Couldn't import ${file.name}: ${result.error}`);
      return;
    }
    setImportError(null);
    useEditor.getState().commit(kanbanRecipe(() => result.data));
  };

  return (
    <div className="kanban" style={{ fontFamily: font }}>
      <div className="gantt__toolbar" role="toolbar" aria-label="Kanban board">
        <button
          type="button"
          className="btn btn--sm"
          onClick={quickAdd}
          disabled={board.columns.length === 0}
        >
          + Card
        </button>
        <button type="button" className="btn btn--sm" onClick={() => void addColumn()}>
          + Column
        </button>
        <button type="button" className="btn btn--sm" onClick={() => void addLane()}>
          + Swimlane
        </button>
        <span className="gantt__toolbar-divider" aria-hidden="true" />
        <input
          className="input kanban__filter"
          type="search"
          placeholder="Filter cards"
          aria-label="Filter cards by title, owner or tag"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
        />
        {hidden > 0 && <span className="kanban__hidden">{hidden} hidden</span>}
        <button
          type="button"
          className="btn btn--ghost btn--sm gantt__toolbar-end"
          title="Add cards from a CSV file (Title, Column, Lane, Owner, Due, Tags, Priority, Description)"
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
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onImport(file);
          }}
        />
      </div>
      {importError && (
        <p className="error-text gantt__error" role="alert">
          {importError}
        </p>
      )}
      <div className="kanban__scroll">
        {board.columns.length === 0 ? (
          <div className="gantt__empty">
            <h2>Add your first column</h2>
            <p>Columns are the stages work moves through, such as To do, In progress and Done.</p>
            <div className="editor-message__actions">
              <button type="button" className="btn btn--primary" onClick={() => void addColumn("To do")}>
                Add a column
              </button>
            </div>
          </div>
        ) : (
          <div
            className="kanban__board"
            style={{ gridTemplateColumns: `repeat(${String(board.columns.length)}, var(--kanban-column))` }}
          >
            {board.columns.map((column) => (
              <ColumnHeader key={column.id} column={column} board={board} />
            ))}
            {rows.map((row) => (
              <LaneRow
                key={row.laneId ?? "none"}
                row={row}
                board={board}
                showHeader={showLanes}
                filter={filter}
                selected={selected}
                commentCounts={commentCounts}
                drop={drop}
                setDrop={setDrop}
                adding={adding}
                setAdding={setAdding}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnHeader({ column, board }: { column: KanbanColumn; board: KanbanData }): ReactElement {
  const count = columnCount(board, column.id);
  const over = isOverLimit(board, column);
  return (
    <div
      className={`kanban__column-header${over ? " kanban__column-header--over" : ""}`}
      style={{ borderTopColor: column.color }}
    >
      {column.done && (
        <span className="kanban__done" title="Done column: cards here are finished">
          ✓
        </span>
      )}
      <CommitInput
        key={column.name}
        className="kanban__column-name"
        label="Column name"
        maxLength={100}
        value={column.name}
        onCommit={(name) => {
          updateColumn(column.id, { name: name.trim() || "Untitled" });
        }}
      />
      <span
        className="kanban__count"
        title={
          column.wipLimit === null
            ? `${String(count)} cards`
            : `${String(count)} cards, limit ${String(column.wipLimit)}${over ? " (over the limit)" : ""}`
        }
      >
        {column.wipLimit === null ? count : `${String(count)} / ${String(column.wipLimit)}`}
      </span>
    </div>
  );
}

interface LaneRowProps {
  readonly row: BoardRow;
  readonly board: KanbanData;
  readonly showHeader: boolean;
  readonly filter: string;
  readonly selected: ReadonlySet<string>;
  readonly commentCounts: ReadonlyMap<string, number>;
  readonly drop: DropTarget | null;
  readonly setDrop: (drop: DropTarget | null) => void;
  readonly adding: { columnId: string; laneId: string | null } | null;
  readonly setAdding: (adding: { columnId: string; laneId: string | null } | null) => void;
}

function LaneRow({
  row,
  board,
  showHeader,
  filter,
  selected,
  commentCounts,
  drop,
  setDrop,
  adding,
  setAdding,
}: LaneRowProps): ReactElement {
  const collapsed = row.lane?.collapsed ?? false;
  const laneCount = board.cards.filter((c) => c.laneId === row.laneId).length;

  const dropTargetFor = (event: DragEvent<HTMLElement>, columnId: string): DropTarget => {
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-card-id]")];
    const before = cards.find((el) => {
      const rect = el.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    return { columnId, laneId: row.laneId, beforeId: before?.dataset.cardId ?? null };
  };

  return (
    <>
      {showHeader && (
        <div className="kanban__lane-header" style={{ gridColumn: "1 / -1" }}>
          {row.lane ? (
            <>
              <button
                type="button"
                className="icon-btn"
                aria-expanded={!collapsed}
                aria-label={collapsed ? `Expand ${row.lane.name}` : `Collapse ${row.lane.name}`}
                onClick={() => {
                  if (row.lane) toggleLane(row.lane.id);
                }}
              >
                {collapsed ? "▸" : "▾"}
              </button>
              <CommitInput
                key={row.lane.name}
                className="kanban__lane-name"
                label="Swimlane name"
                maxLength={100}
                value={row.lane.name}
                onCommit={(name) => {
                  if (row.lane) updateLane(row.lane.id, { name: name.trim() || "Untitled lane" });
                }}
              />
            </>
          ) : (
            <span className="kanban__lane-name kanban__lane-name--none">No lane</span>
          )}
          <span className="kanban__count">{laneCount}</span>
        </div>
      )}
      {!collapsed &&
        board.columns.map((column) => {
          const cards = cardsIn(board, column.id, row.laneId);
          const isTarget = drop?.columnId === column.id && drop.laneId === row.laneId;
          const isAdding = adding?.columnId === column.id && adding.laneId === row.laneId;
          return (
            <div
              key={column.id}
              className={`kanban__cell${isTarget ? " kanban__cell--target" : ""}`}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(CARD_MIME)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const next = dropTargetFor(event, column.id);
                if (
                  next.columnId !== drop?.columnId ||
                  next.laneId !== drop.laneId ||
                  next.beforeId !== drop.beforeId
                )
                  setDrop(next);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null) && isTarget)
                  setDrop(null);
              }}
              onDrop={(event) => {
                const id = event.dataTransfer.getData(CARD_MIME);
                event.preventDefault();
                const target = dropTargetFor(event, column.id);
                setDrop(null);
                if (id) moveCard(id, target.columnId, target.laneId, target.beforeId);
              }}
            >
              {cards.map((card) =>
                matchesFilter(card, filter) ? (
                  <div key={card.id} className="kanban__slot">
                    {isTarget && drop.beforeId === card.id && <div className="kanban__drop-line" />}
                    <CardView
                      card={card}
                      board={board}
                      selected={selected.has(card.id)}
                      comments={commentCounts.get(card.id) ?? 0}
                    />
                  </div>
                ) : null,
              )}
              {isTarget && drop.beforeId === null && <div className="kanban__drop-line" />}
              {isAdding ? (
                <QuickAdd
                  onAdd={(title) => {
                    addCard(column.id, row.laneId, title);
                  }}
                  onClose={() => {
                    setAdding(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="kanban__add"
                  onClick={() => {
                    setAdding({ columnId: column.id, laneId: row.laneId });
                  }}
                >
                  + Add card
                </button>
              )}
            </div>
          );
        })}
    </>
  );
}

function QuickAdd({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }): ReactElement {
  const [title, setTitle] = useState("");
  const submit = (): void => {
    const text = title.trim();
    if (text) onAdd(text);
    setTitle("");
  };
  return (
    <div className="kanban__quick-add">
      <textarea
        className="input"
        aria-label="New card title"
        placeholder="Card title, then Enter"
        rows={2}
        maxLength={500}
        autoFocus
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") onClose();
        }}
        onBlur={() => {
          if (title.trim()) submit();
          onClose();
        }}
      />
    </div>
  );
}

function CardView({
  card,
  board,
  selected,
  comments,
}: {
  card: KanbanCard;
  board: KanbanData;
  selected: boolean;
  comments: number;
}): ReactElement {
  const overdue = isOverdue(card, board);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      useEditor.getState().select({ cardIds: [card.id] });
    } else if (event.altKey && event.key === "ArrowLeft") moveCardAcross(card.id, -1);
    else if (event.altKey && event.key === "ArrowRight") moveCardAcross(card.id, 1);
    else if (event.altKey && event.key === "ArrowUp") moveCardInColumn(card.id, -1);
    else if (event.altKey && event.key === "ArrowDown") moveCardInColumn(card.id, 1);
    else return;
    event.preventDefault();
    // Moving re-renders the card elsewhere; keep keyboard focus on it.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-card-id="${card.id}"]`)?.focus();
    });
  };
  return (
    <div
      className={`kanban-card${selected ? " kanban-card--selected" : ""}${overdue ? " kanban-card--overdue" : ""}`}
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${card.title}. Alt and arrow keys move the card.`}
      draggable
      style={card.color ? { borderLeftColor: card.color } : undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData(CARD_MIME, card.id);
        event.dataTransfer.effectAllowed = "move";
        useEditor.getState().select({ cardIds: [card.id] });
      }}
      onClick={(event) => {
        const state = useEditor.getState();
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          const ids = state.selection.cardIds;
          state.select({
            cardIds: ids.includes(card.id) ? ids.filter((i) => i !== card.id) : [...ids, card.id],
          });
        } else state.select({ cardIds: [card.id] });
      }}
      onKeyDown={onKeyDown}
    >
      <div className="kanban-card__title">{card.title || "Untitled card"}</div>
      {(card.owner !== "" ||
        card.due !== null ||
        card.tags.length > 0 ||
        card.priority !== "none" ||
        comments > 0) && (
        <div className="kanban-card__meta">
          {card.priority !== "none" && (
            <span
              className="kanban-card__priority"
              style={{ background: PRIORITY_COLORS[card.priority] }}
              title={`${PRIORITY_LABELS[card.priority]} priority`}
            />
          )}
          {card.due && (
            <span className={`kanban-card__due${overdue ? " kanban-card__due--overdue" : ""}`}>
              {overdue ? "Overdue · " : ""}
              {shortDate(card.due)}
            </span>
          )}
          {card.tags.map((tag) => (
            <span key={tag} className="kanban-card__tag">
              {tag}
            </span>
          ))}
          {comments > 0 && (
            <button
              type="button"
              className="gantt-comment-badge"
              title="Open comments"
              aria-label={`${String(comments)} comments on ${card.title}`}
              onClick={(event) => {
                event.stopPropagation();
                const first = useEditor
                  .getState()
                  .diagram?.comments.find((c) => c.targetId === card.id && !c.resolved);
                if (first) useUi.getState().focusComment(first.id);
              }}
            >
              {comments}
            </button>
          )}
          {card.owner && (
            <span className="kanban-card__owner" title={card.owner}>
              {initials(card.owner)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
