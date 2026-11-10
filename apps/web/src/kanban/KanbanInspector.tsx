import type { ReactElement, ReactNode } from "react";
import { KANBAN_PRIORITIES, type KanbanCard, type KanbanData } from "@linework/shared";
import { CHART_TYPE_INFO } from "../charts/chartTypes";
import { DIAGRAM_STYLES, STYLE_IDS } from "../diagram/styles";
import { useEditor } from "../editor/store";
import { CommitInput, CommitTextarea, DateInput } from "../gantt/inputs";
import {
  addColumn,
  addLane,
  deleteColumn,
  deleteLane,
  moveCard,
  moveCardAcross,
  moveCardInColumn,
  moveColumn,
  moveLane,
  updateCard,
  updateColumn,
  updateLane,
} from "./actions";
import { CARD_COLORS, COLUMN_COLORS, columnCount, isOverdue, parseTags, PRIORITY_LABELS } from "./model";

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="inspector__section">
      <h3 className="inspector__heading">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      {children}
    </label>
  );
}

function CardDetails({ card, board }: { card: KanbanCard; board: KanbanData }): ReactElement {
  const columnIndex = board.columns.findIndex((c) => c.id === card.columnId);
  const siblings = board.cards.filter((c) => c.columnId === card.columnId && c.laneId === card.laneId);
  const rowIndex = siblings.findIndex((c) => c.id === card.id);
  const { deleteSelection } = useEditor.getState();
  return (
    <>
      <Section title="Card">
        <Field label="Title">
          <CommitTextarea
            key={card.title}
            className="input"
            label="Title"
            rows={2}
            maxLength={500}
            value={card.title}
            onCommit={(title) => {
              updateCard(card.id, { title: title.trim() || "Untitled card" });
            }}
          />
        </Field>
        <Field label="Description">
          <CommitTextarea
            key={card.description}
            className="input"
            label="Description"
            rows={4}
            placeholder="Details, links, acceptance criteria"
            value={card.description}
            onCommit={(description) => {
              updateCard(card.id, { description });
            }}
          />
        </Field>
        <div className="inspector__row">
          <Field label="Column">
            <select
              className="select"
              value={card.columnId}
              onChange={(event) => {
                moveCard(card.id, event.target.value, card.laneId, null);
              }}
            >
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {board.lanes.length > 0 && (
            <Field label="Swimlane">
              <select
                className="select"
                value={card.laneId ?? ""}
                onChange={(event) => {
                  moveCard(card.id, card.columnId, event.target.value || null, null);
                }}
              >
                {card.laneId === null && <option value="">No lane</option>}
                {board.lanes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="Owner">
          <CommitInput
            key={card.owner}
            className="input"
            label="Owner"
            maxLength={100}
            placeholder="Who is doing this"
            value={card.owner}
            onCommit={(owner) => {
              updateCard(card.id, { owner: owner.trim() });
            }}
          />
        </Field>
        <div className="inspector__row">
          <Field label={isOverdue(card, board) ? "Due (overdue)" : "Due"}>
            <DateInput
              className="input"
              label="Due date"
              value={card.due ?? ""}
              onCommit={(due) => {
                updateCard(card.id, { due });
              }}
            />
          </Field>
          {card.due && (
            <button
              type="button"
              className="btn btn--ghost btn--sm kanban-inspector__clear"
              onClick={() => {
                updateCard(card.id, { due: null });
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="inspector__field">
          <span className="inspector__label">Priority</span>
          <div className="segmented segmented--full" role="radiogroup" aria-label="Priority">
            {KANBAN_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={card.priority === p}
                className={`segmented__option${card.priority === p ? " segmented__option--active" : ""}`}
                onClick={() => {
                  updateCard(card.id, { priority: p });
                }}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Tags">
          <CommitInput
            key={card.tags.join(", ")}
            className="input"
            label="Tags, separated by commas"
            maxLength={450}
            placeholder="bug, backend"
            value={card.tags.join(", ")}
            onCommit={(text) => {
              updateCard(card.id, { tags: parseTags(text) });
            }}
          />
        </Field>
        <div className="inspector__field">
          <span className="inspector__label">Colour</span>
          <div className="swatches" role="group" aria-label="Colour">
            <button
              type="button"
              className={`swatch swatch--none${card.color === null ? " swatch--active" : ""}`}
              aria-label="No colour"
              aria-pressed={card.color === null}
              onClick={() => {
                updateCard(card.id, { color: null });
              }}
            />
            {CARD_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`swatch${card.color === swatch ? " swatch--active" : ""}`}
                style={{ background: swatch }}
                aria-label={swatch}
                aria-pressed={card.color === swatch}
                onClick={() => {
                  updateCard(card.id, { color: swatch });
                }}
              />
            ))}
          </div>
        </div>
      </Section>
      <Section title="Move">
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            disabled={columnIndex <= 0}
            title="Previous column (Alt+Left)"
            onClick={() => {
              moveCardAcross(card.id, -1);
            }}
          >
            ← Column
          </button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={columnIndex >= board.columns.length - 1}
            title="Next column (Alt+Right)"
            onClick={() => {
              moveCardAcross(card.id, 1);
            }}
          >
            Column →
          </button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={rowIndex <= 0}
            title="Move up (Alt+Up)"
            onClick={() => {
              moveCardInColumn(card.id, -1);
            }}
          >
            Up
          </button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={rowIndex >= siblings.length - 1}
            title="Move down (Alt+Down)"
            onClick={() => {
              moveCardInColumn(card.id, 1);
            }}
          >
            Down
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Section>
    </>
  );
}

function BoardSettings({ board, styleId }: { board: KanbanData; styleId: string }): ReactElement {
  const { setStyle } = useEditor.getState();
  const info = CHART_TYPE_INFO.kanban;
  return (
    <>
      <Section title="Board">
        <div className="inspector__field">
          <span className="inspector__label">Style</span>
          <div className="segmented segmented--full" role="radiogroup" aria-label="Style">
            {STYLE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={styleId === id}
                className={`segmented__option${styleId === id ? " segmented__option--active" : ""}`}
                onClick={() => {
                  setStyle(id);
                }}
              >
                {DIAGRAM_STYLES[id].name}
              </button>
            ))}
          </div>
        </div>
      </Section>
      <Section title="Columns">
        <ul className="kanban-settings">
          {board.columns.map((column, i) => (
            <li key={column.id} className="kanban-settings__item">
              <div className="kanban-settings__row">
                <select
                  className="kanban-settings__color"
                  aria-label={`Colour of ${column.name}`}
                  value={column.color}
                  style={{ background: column.color }}
                  onChange={(event) => {
                    updateColumn(column.id, { color: event.target.value });
                  }}
                >
                  {[...new Set([column.color, ...COLUMN_COLORS])].map((c) => (
                    <option key={c} value={c} style={{ background: c }}>
                      {c}
                    </option>
                  ))}
                </select>
                <CommitInput
                  key={column.name}
                  className="input kanban-settings__name"
                  label="Column name"
                  maxLength={100}
                  value={column.name}
                  onCommit={(name) => {
                    updateColumn(column.id, { name: name.trim() || "Untitled" });
                  }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${column.name} left`}
                  disabled={i === 0}
                  onClick={() => {
                    moveColumn(column.id, -1);
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${column.name} right`}
                  disabled={i === board.columns.length - 1}
                  onClick={() => {
                    moveColumn(column.id, 1);
                  }}
                >
                  →
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={`Delete ${column.name}`}
                  onClick={() => {
                    const count = columnCount(board, column.id);
                    const neighbour = board.columns[i === 0 ? 1 : i - 1];
                    const message =
                      count === 0
                        ? null
                        : neighbour
                          ? `Delete ${column.name}? Its ${String(count)} cards move to ${neighbour.name}.`
                          : `Delete ${column.name} and its ${String(count)} cards?`;
                    if (!message || window.confirm(message)) deleteColumn(column.id);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="kanban-settings__row kanban-settings__row--sub">
                <label className="kanban-settings__wip">
                  WIP limit
                  <CommitInput
                    key={String(column.wipLimit)}
                    className="input"
                    label={`WIP limit for ${column.name}, blank for none`}
                    maxLength={3}
                    placeholder="None"
                    value={column.wipLimit === null ? "" : String(column.wipLimit)}
                    onCommit={(text) => {
                      const n = Math.round(Number(text));
                      updateColumn(column.id, {
                        wipLimit:
                          text.trim() === "" || !Number.isFinite(n) || n < 1 ? null : Math.min(999, n),
                      });
                    }}
                  />
                </label>
                <label className="kanban-settings__done">
                  <input
                    type="checkbox"
                    checked={column.done}
                    onChange={(event) => {
                      updateColumn(column.id, { done: event.target.checked });
                    }}
                  />
                  Done
                </label>
              </div>
            </li>
          ))}
        </ul>
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            disabled={board.columns.length >= 50}
            onClick={() => void addColumn()}
          >
            + Add column
          </button>
        </div>
      </Section>
      <Section title="Swimlanes">
        {board.lanes.length === 0 ? (
          <p className="inspector__hint">
            Add swimlanes to split the board into rows, such as one per team or client.
          </p>
        ) : (
          <ul className="kanban-settings">
            {board.lanes.map((lane, i) => (
              <li key={lane.id} className="kanban-settings__row">
                <CommitInput
                  key={lane.name}
                  className="input kanban-settings__name"
                  label="Swimlane name"
                  maxLength={100}
                  value={lane.name}
                  onCommit={(name) => {
                    updateLane(lane.id, { name: name.trim() || "Untitled lane" });
                  }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${lane.name} up`}
                  disabled={i === 0}
                  onClick={() => {
                    moveLane(lane.id, -1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${lane.name} down`}
                  disabled={i === board.lanes.length - 1}
                  onClick={() => {
                    moveLane(lane.id, 1);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={`Delete ${lane.name}`}
                  onClick={() => {
                    deleteLane(lane.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            disabled={board.lanes.length >= 50}
            onClick={() => void addLane()}
          >
            + Add swimlane
          </button>
        </div>
      </Section>
      <Section title="Working with kanban boards">
        <dl className="guide-objects">
          {info.objects.map((o) => (
            <div key={o.name}>
              <dt>{o.name}</dt>
              <dd>{o.description}</dd>
            </div>
          ))}
        </dl>
        <ul className="guide-tips">
          {info.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export function KanbanInspector(): ReactElement | null {
  const board = useEditor((s) => s.diagram?.kanban);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const cardIds = useEditor((s) => s.selection.cardIds);
  if (!board) return null;
  const selected = board.cards.filter((c) => cardIds.includes(c.id));
  const only = selected.length === 1 ? selected[0] : undefined;
  return (
    <div className="inspector__content" aria-label="Properties">
      {only ? (
        <CardDetails key={only.id} card={only} board={board} />
      ) : selected.length > 1 ? (
        <Section title={`${String(selected.length)} cards selected`}>
          <Field label="Move to column">
            <select
              className="select"
              value=""
              onChange={(event) => {
                const columnId = event.target.value;
                if (!columnId) return;
                // One undo step for the whole move.
                useEditor.getState().commit((d) =>
                  d.kanban
                    ? {
                        ...d,
                        kanban: {
                          ...d.kanban,
                          cards: d.kanban.cards.map((c) => (cardIds.includes(c.id) ? { ...c, columnId } : c)),
                        },
                      }
                    : d,
                );
              }}
            >
              <option value="">Choose a column</option>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="inspector__actions">
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={useEditor.getState().deleteSelection}
            >
              Delete
            </button>
          </div>
        </Section>
      ) : (
        <BoardSettings board={board} styleId={styleId} />
      )}
    </div>
  );
}
