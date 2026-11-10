import type { ReactElement, ReactNode } from "react";
import { ROADMAP_STATUSES, type RoadmapData, type RoadmapItem, type RoadmapStatus } from "@linework/shared";
import { CHART_TYPE_INFO } from "../charts/chartTypes";
import { DIAGRAM_STYLES, STYLE_IDS } from "../diagram/styles";
import { useEditor } from "../editor/store";
import { CommitInput, CommitTextarea, DateInput } from "../gantt/inputs";
import { deleteLane, moveLane, updateItem, updateItems, updateLane, updateRoadmapSettings } from "./actions";
import { itemColor, LANE_COLORS, MONTH_NAMES, STATUS_LABELS } from "./model";

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="inspector__section">
      <h3 className="inspector__heading">{title}</h3>
      {children}
    </section>
  );
}

function StatusPicker({
  value,
  onChange,
}: {
  value: RoadmapStatus | undefined;
  onChange: (status: RoadmapStatus) => void;
}): ReactElement {
  return (
    <div className="inspector__field">
      <span className="inspector__label">Status</span>
      <div className="segmented segmented--full" role="radiogroup" aria-label="Status">
        {ROADMAP_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            className={`segmented__option${value === s ? " segmented__option--active" : ""}`}
            onClick={() => {
              onChange(s);
            }}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

function LaneSelect({
  data,
  value,
  onChange,
}: {
  data: RoadmapData;
  value: string | undefined;
  onChange: (laneId: string) => void;
}): ReactElement {
  return (
    <label className="inspector__field">
      <span className="inspector__label">Lane</span>
      <select
        className="select"
        value={value ?? ""}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {value === undefined && <option value="">Mixed</option>}
        {data.lanes.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name || "Untitled lane"}
          </option>
        ))}
      </select>
    </label>
  );
}

function ItemEditor({ data, item }: { data: RoadmapData; item: RoadmapItem }): ReactElement {
  const milestone = item.kind === "milestone";
  const color = itemColor(item, data.lanes);
  return (
    <Section title={milestone ? "Milestone" : "Item"}>
      <label className="inspector__field">
        <span className="inspector__label">Title</span>
        <CommitInput
          key={item.title}
          className="input"
          label="Title"
          value={item.title}
          onCommit={(title) => {
            updateItem(item.id, { title: title.trim() || "Untitled" });
          }}
        />
      </label>
      <div className="inspector__field">
        <span className="inspector__label">Shown as</span>
        <div className="segmented segmented--full" role="radiogroup" aria-label="Shown as">
          {(["item", "milestone"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={item.kind === k}
              className={`segmented__option${item.kind === k ? " segmented__option--active" : ""}`}
              onClick={() => {
                updateItem(item.id, { kind: k });
              }}
            >
              {k === "item" ? "Bar" : "Milestone"}
            </button>
          ))}
        </div>
      </div>
      <LaneSelect
        data={data}
        value={item.laneId}
        onChange={(laneId) => {
          updateItem(item.id, { laneId });
        }}
      />
      <div className="inspector__row">
        <label className="inspector__field">
          <span className="inspector__label">{milestone ? "Date" : "Start"}</span>
          <DateInput
            className="input"
            label={milestone ? "Date" : "Start"}
            value={item.start}
            onCommit={(start) => {
              // Moving the start keeps the length, like dragging the bar.
              const days = Math.round((Date.parse(start) - Date.parse(item.start)) / 86_400_000);
              const end = new Date(Date.parse(item.end) + days * 86_400_000).toISOString().slice(0, 10);
              updateItem(item.id, { start, end });
            }}
          />
        </label>
        {!milestone && (
          <label className="inspector__field">
            <span className="inspector__label">End</span>
            <DateInput
              className="input"
              label="End"
              value={item.end}
              min={item.start}
              onCommit={(end) => {
                updateItem(item.id, { end });
              }}
            />
          </label>
        )}
      </div>
      <StatusPicker
        value={item.status}
        onChange={(status) => {
          updateItem(item.id, { status });
        }}
      />
      <label className="inspector__field">
        <span className="inspector__label">Owner</span>
        <CommitInput
          key={item.owner}
          className="input"
          label="Owner"
          maxLength={100}
          placeholder="Person or team"
          value={item.owner}
          onCommit={(owner) => {
            updateItem(item.id, { owner: owner.trim() });
          }}
        />
      </label>
      <div className="inspector__field">
        <span className="inspector__label">Colour</span>
        <div className="swatches" role="group" aria-label="Colour">
          <button
            type="button"
            className={`swatch swatch--none${item.color === null ? " swatch--active" : ""}`}
            title="Lane colour"
            aria-label="Use the lane colour"
            onClick={() => {
              updateItem(item.id, { color: null });
            }}
          />
          {LANE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${item.color === c ? " swatch--active" : ""}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              onClick={() => {
                updateItem(item.id, { color: c });
              }}
            />
          ))}
        </div>
        <span className="inspector__hint" style={{ color }}>
          {item.color === null ? "Using the lane colour" : ""}
        </span>
      </div>
      <label className="inspector__field">
        <span className="inspector__label">Description</span>
        <CommitTextarea
          key={item.description}
          className="input"
          label="Description"
          value={item.description}
          placeholder="Goal, scope or a link to the spec"
          onCommit={(description) => {
            updateItem(item.id, { description });
          }}
        />
      </label>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            useEditor.getState().deleteSelection();
          }}
        >
          Delete {milestone ? "milestone" : "item"}
        </button>
      </div>
    </Section>
  );
}

function ManyItems({ data, items }: { data: RoadmapData; items: readonly RoadmapItem[] }): ReactElement {
  const ids = items.map((i) => i.id);
  const statuses = new Set(items.map((i) => i.status));
  const lanes = new Set(items.map((i) => i.laneId));
  return (
    <Section title={`${String(items.length)} items`}>
      <StatusPicker
        value={statuses.size === 1 ? [...statuses][0] : undefined}
        onChange={(status) => {
          updateItems(ids, { status });
        }}
      />
      <LaneSelect
        data={data}
        value={lanes.size === 1 ? [...lanes][0] : undefined}
        onChange={(laneId) => {
          if (laneId) updateItems(ids, { laneId });
        }}
      />
      <p className="inspector__hint">
        Use the arrow keys to move them a day at a time, with Shift for a week.
      </p>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            useEditor.getState().deleteSelection();
          }}
        >
          Delete {items.length} items
        </button>
      </div>
    </Section>
  );
}

function RoadmapSettings({ data, styleId }: { data: RoadmapData; styleId: string }): ReactElement {
  const info = CHART_TYPE_INFO.roadmap;
  const { setStyle } = useEditor.getState();
  return (
    <>
      <Section title="Roadmap">
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
        <label className="inspector__field">
          <span className="inspector__label">Financial year starts in</span>
          <select
            className="select"
            value={data.fiscalYearStart}
            onChange={(event) => {
              updateRoadmapSettings({ fiscalYearStart: Number(event.target.value) });
            }}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
                {i === 0 ? " (calendar year)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="kanban-settings__done">
          <input
            type="checkbox"
            checked={data.showToday}
            onChange={(event) => {
              updateRoadmapSettings({ showToday: event.target.checked });
            }}
          />
          Show today
        </label>
      </Section>
      <Section title="Lanes">
        <ul className="kanban-settings">
          {data.lanes.map((lane, i) => (
            <li key={lane.id} className="kanban-settings__row">
              <select
                className="kanban-settings__color"
                aria-label={`Colour of ${lane.name}`}
                value={lane.color}
                style={{ background: lane.color }}
                onChange={(event) => {
                  updateLane(lane.id, { color: event.target.value });
                }}
              >
                {[...new Set([lane.color, ...LANE_COLORS])].map((c) => (
                  <option key={c} value={c} style={{ background: c }}>
                    {c}
                  </option>
                ))}
              </select>
              <CommitInput
                key={lane.name}
                className="input kanban-settings__name"
                label="Lane name"
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
                disabled={i === data.lanes.length - 1}
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
                  const count = data.items.filter((x) => x.laneId === lane.id).length;
                  const neighbour = data.lanes[i === 0 ? 1 : i - 1];
                  const message =
                    count === 0
                      ? null
                      : neighbour
                        ? `Delete ${lane.name}? Its ${String(count)} items move to ${neighbour.name}.`
                        : `Delete ${lane.name} and its ${String(count)} items?`;
                  if (!message || window.confirm(message)) deleteLane(lane.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Working with roadmaps">
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

export function RoadmapInspector(): ReactElement | null {
  const data = useEditor((s) => s.diagram?.roadmap);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const selectedIds = useEditor((s) => s.selection.taskIds);
  if (!data) return null;
  const items = data.items.filter((i) => selectedIds.includes(i.id));
  const only = items.length === 1 ? items[0] : undefined;
  return (
    <div className="inspector__content" aria-label="Properties">
      {only ? (
        <ItemEditor key={only.id} data={data} item={only} />
      ) : items.length > 1 ? (
        <ManyItems data={data} items={items} />
      ) : (
        <RoadmapSettings data={data} styleId={styleId} />
      )}
    </div>
  );
}
