import type { ReactElement, ReactNode } from "react";
import {
  DEPENDENCY_TYPES,
  toDayNumber,
  type DependencyType,
  type GanttData,
  type GanttTask,
} from "@linework/shared";
import { CHART_TYPE_INFO } from "../charts/chartTypes";
import { DIAGRAM_STYLES, STYLE_IDS } from "../diagram/styles";
import { useEditor } from "../editor/store";
import {
  addDependency,
  clearBaseline,
  ganttRecipe,
  moveTaskRow,
  moveTaskStart,
  removeDependency,
  saveBaseline,
  updateDependency,
  updateGanttSettings,
  updateTask,
} from "./actions";
import { CommitInput, DateInput, NumberCommitInput } from "./inputs";
import { calendarOf, criticalPath } from "./schedule";
import { SECTION_COLORS, taskColor, wouldCreateCycle } from "./model";

const DEPENDENCY_LABELS: Readonly<Record<DependencyType, string>> = {
  FS: "Finish to start",
  SS: "Start to start",
  FF: "Finish to finish",
  SF: "Start to finish",
};

const DEPENDENCY_HELP: Readonly<Record<DependencyType, string>> = {
  FS: "This task starts after the other finishes.",
  SS: "This task starts after the other starts.",
  FF: "This task finishes after the other finishes.",
  SF: "This task finishes after the other starts.",
};

function dayWord(gantt: GanttData): string {
  return gantt.calendar.skipWeekends || gantt.calendar.holidays.length > 0 ? "working day" : "day";
}

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

function TaskDetails({ task, gantt }: { task: GanttTask; gantt: GanttData }): ReactElement {
  const color = taskColor(task, gantt.sections);
  const predecessors = task.dependencies.flatMap((dep) => {
    const pred = gantt.tasks.find((t) => t.id === dep.taskId);
    return pred ? [{ dep, pred }] : [];
  });
  const candidates = gantt.tasks.filter(
    (t) =>
      t.id !== task.id &&
      !task.dependencies.some((d) => d.taskId === t.id) &&
      !wouldCreateCycle(gantt.tasks, task.id, t.id),
  );
  const cal = calendarOf(gantt);
  const timing = criticalPath(gantt.tasks, cal).timings.get(task.id);
  const base = gantt.baseline?.tasks.find((b) => b.id === task.id);
  // Positive variance means the task now finishes later than planned.
  const variance = base ? cal.index(toDayNumber(task.end) + 1) - cal.index(toDayNumber(base.end) + 1) : null;
  const { deleteSelection } = useEditor.getState();
  return (
    <>
      <Section title={task.kind === "milestone" ? "Milestone" : "Task"}>
        <Field label="Name">
          <CommitInput
            key={task.name}
            className="input"
            label="Name"
            value={task.name}
            onCommit={(name) => {
              updateTask(task.id, { name: name.trim() || "Untitled task" });
            }}
          />
        </Field>
        <div className="segmented segmented--full" role="radiogroup" aria-label="Type">
          {(["task", "milestone"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={task.kind === kind}
              className={`segmented__option${task.kind === kind ? " segmented__option--active" : ""}`}
              onClick={() => {
                updateTask(task.id, { kind });
              }}
            >
              {kind === "task" ? "Task" : "Milestone"}
            </button>
          ))}
        </div>
        <div className="inspector__row">
          <Field label={task.kind === "milestone" ? "Date" : "Start"}>
            <DateInput
              className="input"
              label="Start date"
              value={task.start}
              onCommit={(start) => {
                moveTaskStart(task.id, start);
              }}
            />
          </Field>
          {task.kind === "task" && (
            <Field label="End">
              <DateInput
                className="input"
                label="End date"
                value={task.end}
                min={task.start}
                onCommit={(end) => {
                  updateTask(task.id, { end });
                }}
              />
            </Field>
          )}
        </div>
        {task.kind === "task" && (
          <Field label={`Progress: ${String(task.progress)}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={task.progress}
              aria-label="Percent complete"
              // One undo step per slide: checkpoint when it starts, then update without history.
              onPointerDown={() => {
                useEditor.getState().checkpoint();
              }}
              onKeyDown={() => {
                useEditor.getState().checkpoint();
              }}
              onChange={(event) => {
                const progress = Number(event.target.value);
                useEditor.getState().transient(
                  ganttRecipe((g) => ({
                    ...g,
                    tasks: g.tasks.map((t) => (t.id === task.id ? { ...t, progress } : t)),
                  })),
                );
              }}
            />
          </Field>
        )}
        <Field label="Owner">
          <CommitInput
            key={task.owner}
            className="input"
            label="Owner"
            value={task.owner}
            maxLength={100}
            placeholder="Who is responsible?"
            onCommit={(owner) => {
              updateTask(task.id, { owner: owner.trim() });
            }}
          />
        </Field>
        <Field label="Section">
          <select
            className="select"
            value={task.sectionId ?? ""}
            onChange={(event) => {
              updateTask(task.id, { sectionId: event.target.value || null });
            }}
          >
            <option value="">No section</option>
            {gantt.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="inspector__field">
          <span className="inspector__label">Colour</span>
          <div className="swatches" role="group" aria-label="Colour">
            <button
              type="button"
              className={`swatch swatch--auto${task.color === null ? " swatch--active" : ""}`}
              title="Use section colour"
              aria-label="Use section colour"
              aria-pressed={task.color === null}
              style={{ background: color }}
              onClick={() => {
                updateTask(task.id, { color: null });
              }}
            >
              A
            </button>
            {SECTION_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`swatch${task.color === swatch ? " swatch--active" : ""}`}
                style={{ background: swatch }}
                aria-label={swatch}
                aria-pressed={task.color === swatch}
                onClick={() => {
                  updateTask(task.id, { color: swatch });
                }}
              />
            ))}
          </div>
        </div>
      </Section>
      <Section title="Depends on">
        {predecessors.length === 0 ? (
          <p className="inspector__hint">No dependencies. This task can start any time.</p>
        ) : (
          <ul className="dep-list">
            {predecessors.map(({ dep, pred }) => (
              <li key={pred.id} className="dep-list__item">
                <span className="dep-list__name" title={pred.name}>
                  {pred.name}
                </span>
                <select
                  className="select dep-list__type"
                  aria-label={`Dependency type for ${pred.name}`}
                  title={DEPENDENCY_HELP[dep.type]}
                  value={dep.type}
                  onChange={(event) => {
                    updateDependency(task.id, pred.id, { type: event.target.value as DependencyType });
                  }}
                >
                  {DEPENDENCY_TYPES.map((type) => (
                    <option key={type} value={type} title={DEPENDENCY_HELP[type]}>
                      {DEPENDENCY_LABELS[type]}
                    </option>
                  ))}
                </select>
                <NumberCommitInput
                  key={dep.lag}
                  className="input dep-list__lag"
                  label={`Lag in days after ${pred.name}`}
                  value={dep.lag}
                  min={-999}
                  max={999}
                  onCommit={(lag) => {
                    updateDependency(task.id, pred.id, { lag });
                  }}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={`Remove dependency on ${pred.name}`}
                  onClick={() => {
                    removeDependency(task.id, pred.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {predecessors.length > 0 && (
          <p className="inspector__hint">
            Lag is in {gantt.calendar.skipWeekends ? "working " : ""}days. Use a negative number to overlap.
          </p>
        )}
        {candidates.length > 0 && (
          <select
            className="select"
            value=""
            aria-label="Add dependency"
            onChange={(event) => {
              if (event.target.value) addDependency(task.id, event.target.value);
            }}
          >
            <option value="">Add a task this one waits for...</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </Section>
      <Section title="Schedule">
        <dl className="facts">
          <div>
            <dt>Slack</dt>
            <dd>
              {timing
                ? timing.critical
                  ? "None - on the critical path"
                  : `${String(timing.slack)} ${dayWord(gantt)}${timing.slack === 1 ? "" : "s"}`
                : "-"}
            </dd>
          </div>
          {base && variance !== null && (
            <div>
              <dt>Vs baseline</dt>
              <dd className={variance > 0 ? "facts__bad" : variance < 0 ? "facts__good" : undefined}>
                {variance === 0
                  ? "On plan"
                  : `${String(Math.abs(variance))} ${dayWord(gantt)}${Math.abs(variance) === 1 ? "" : "s"} ${variance > 0 ? "late" : "early"}`}
                <small>
                  {" "}
                  (planned {base.start} to {base.end})
                </small>
              </dd>
            </div>
          )}
        </dl>
      </Section>
      <Section title="Arrange">
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              moveTaskRow(task.id, -1);
            }}
          >
            Move up
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              moveTaskRow(task.id, 1);
            }}
          >
            Move down
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Section>
    </>
  );
}

function ChartSettings({ gantt, styleId }: { gantt: GanttData; styleId: string }): ReactElement {
  const { setStyle } = useEditor.getState();
  const info = CHART_TYPE_INFO.gantt;
  return (
    <>
      <Section title="Chart">
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
        <label className="toggle">
          <input
            type="checkbox"
            checked={gantt.autoSchedule}
            onChange={(event) => {
              updateGanttSettings({ autoSchedule: event.target.checked });
            }}
          />
          <span>
            <strong>Auto-schedule</strong>
            <small>Push dependent tasks later when a task moves.</small>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={gantt.showCriticalPath}
            onChange={(event) => {
              updateGanttSettings({ showCriticalPath: event.target.checked });
            }}
          />
          <span>
            <strong>Highlight critical path</strong>
            <small>Tasks that move the end date if they slip.</small>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={gantt.showToday}
            onChange={(event) => {
              updateGanttSettings({ showToday: event.target.checked });
            }}
          />
          <span>
            <strong>Show today</strong>
            <small>Draw a line at today&apos;s date.</small>
          </span>
        </label>
      </Section>
      <Section title="Working days">
        <label className="toggle">
          <input
            type="checkbox"
            checked={gantt.calendar.skipWeekends}
            onChange={(event) => {
              updateGanttSettings({ calendar: { ...gantt.calendar, skipWeekends: event.target.checked } });
            }}
          />
          <span>
            <strong>Skip weekends</strong>
            <small>Durations and lags count Monday to Friday only.</small>
          </span>
        </label>
        <div className="inspector__field">
          <span className="inspector__label">Holidays</span>
          {gantt.calendar.holidays.length > 0 && (
            <ul className="chips chips--removable">
              {[...gantt.calendar.holidays].sort().map((day) => (
                <li key={day}>
                  {day}
                  <button
                    type="button"
                    aria-label={`Remove holiday ${day}`}
                    onClick={() => {
                      updateGanttSettings({
                        calendar: {
                          ...gantt.calendar,
                          holidays: gantt.calendar.holidays.filter((h) => h !== day),
                        },
                      });
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DateInput
            key={gantt.calendar.holidays.length}
            className="input"
            label="Add holiday"
            value=""
            onCommit={(day) => {
              if (!gantt.calendar.holidays.includes(day)) {
                updateGanttSettings({
                  calendar: { ...gantt.calendar, holidays: [...gantt.calendar.holidays, day] },
                });
              }
            }}
          />
        </div>
      </Section>
      <Section title="Baseline">
        {gantt.baseline ? (
          <>
            <p className="inspector__hint">
              Saved {new Date(gantt.baseline.savedAt).toLocaleString()}. Grey bars show the planned dates.
            </p>
            <div className="inspector__actions">
              <button type="button" className="btn btn--sm" onClick={saveBaseline}>
                Update baseline
              </button>
              <button type="button" className="btn btn--sm btn--danger" onClick={clearBaseline}>
                Clear
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="inspector__hint">
              Save the current dates as the plan, then track slips against it.
            </p>
            <div className="inspector__actions">
              <button type="button" className="btn btn--sm" onClick={saveBaseline}>
                Save baseline
              </button>
            </div>
          </>
        )}
      </Section>
      <Section title="Working with Gantt charts">
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

export function GanttInspector(): ReactElement | null {
  const gantt = useEditor((s) => s.diagram?.gantt);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const taskIds = useEditor((s) => s.selection.taskIds);
  if (!gantt) return null;
  const selected = gantt.tasks.filter((t) => taskIds.includes(t.id));
  const only = selected.length === 1 ? selected[0] : undefined;
  return (
    <div className="inspector__content" aria-label="Properties">
      {only ? (
        <TaskDetails key={only.id} task={only} gantt={gantt} />
      ) : selected.length > 1 ? (
        <Section title={`${String(selected.length)} tasks selected`}>
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
        <ChartSettings gantt={gantt} styleId={styleId} />
      )}
    </div>
  );
}
