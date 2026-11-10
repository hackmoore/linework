import { useState, type ReactElement } from "react";
import {
  FRAGMENT_KINDS,
  fragmentAllowsElse,
  MESSAGE_ARROWS,
  NOTE_POSITIONS,
  PARTICIPANT_KINDS,
  type SequenceData,
  type SequenceFragment,
  type SequenceMessage,
  type SequenceNote,
  type SequenceParticipant,
  type SequenceStep,
} from "@linework/shared";
import { DIAGRAM_STYLES, STYLE_IDS } from "../diagram/styles";
import { useEditor } from "../editor/store";
import { CommitInput, CommitTextarea } from "../gantt/inputs";
import { GuideSection, Section } from "../kinds/KindPanels";
import {
  addElse,
  addMessage,
  addNote,
  moveParticipant,
  moveStep,
  replaceSequence,
  setAutonumber,
  updateParticipant,
  updateStep,
  wrapSelection,
} from "./actions";
import { parseMermaidSequence, sequenceToMermaid } from "./io";
import {
  ARROW_HINTS,
  ARROW_LABELS,
  ELSE_WORD,
  FRAGMENT_HINTS,
  FRAGMENT_LABELS,
  fragmentSpans,
  PARTICIPANT_COLORS,
  PARTICIPANT_HINTS,
  PARTICIPANT_LABELS,
  participantName,
  sequenceIssues,
} from "./model";

function Segmented<T extends string>({
  label,
  options,
  value,
  names,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | undefined;
  names: Readonly<Record<T, string>>;
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <div className="inspector__field">
      <span className="inspector__label">{label}</span>
      <div className="segmented segmented--full" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            className={`segmented__option${value === o ? " segmented__option--active" : ""}`}
            onClick={() => {
              onChange(o);
            }}
          >
            {names[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ParticipantSelect({
  data,
  label,
  value,
  onChange,
  allowNone = false,
}: {
  data: SequenceData;
  label: string;
  value: string;
  onChange: (id: string) => void;
  allowNone?: boolean;
}): ReactElement {
  return (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      <select
        className="select"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {allowNone && <option value="">Nobody else</option>}
        {data.participants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || "Untitled"}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
}): ReactElement {
  return (
    <label className="kanban-settings__done">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {children}
    </label>
  );
}

function StepActions({ id, label }: { id: string; label: string }): ReactElement {
  return (
    <div className="inspector__actions">
      <button
        type="button"
        className="btn btn--sm"
        title="Move up (↑)"
        onClick={() => {
          moveStep(id, -1);
        }}
      >
        ↑ Up
      </button>
      <button
        type="button"
        className="btn btn--sm"
        title="Move down (↓)"
        onClick={() => {
          moveStep(id, 1);
        }}
      >
        ↓ Down
      </button>
      <button
        type="button"
        className="btn btn--sm btn--danger"
        onClick={() => {
          useEditor.getState().deleteSelection();
        }}
      >
        Delete {label}
      </button>
    </div>
  );
}

function ParticipantEditor({ data, p }: { data: SequenceData; p: SequenceParticipant }): ReactElement {
  const index = data.participants.indexOf(p);
  const messages = data.steps.filter(
    (s) => s.type === "message" && (s.from === p.id || s.to === p.id),
  ).length;
  return (
    <Section title={PARTICIPANT_LABELS[p.kind]}>
      <label className="inspector__field">
        <span className="inspector__label">Name</span>
        <CommitInput
          key={p.name}
          className="input"
          label="Name"
          maxLength={100}
          value={p.name}
          onCommit={(name) => {
            updateParticipant(p.id, { name: name.trim() || "Untitled" });
          }}
        />
      </label>
      <label className="inspector__field">
        <span className="inspector__label">Type</span>
        <select
          className="select"
          value={p.kind}
          onChange={(event) => {
            updateParticipant(p.id, { kind: event.target.value as SequenceParticipant["kind"] });
          }}
        >
          {PARTICIPANT_KINDS.map((k) => (
            <option key={k} value={k}>
              {PARTICIPANT_LABELS[k]}
            </option>
          ))}
        </select>
        <span className="inspector__hint">{PARTICIPANT_HINTS[p.kind]}</span>
      </label>
      <div className="inspector__field">
        <span className="inspector__label">Colour</span>
        <div className="swatches" role="group" aria-label="Colour">
          {PARTICIPANT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${p.color === c ? " swatch--active" : ""}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              onClick={() => {
                updateParticipant(p.id, { color: c });
              }}
            />
          ))}
        </div>
      </div>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm"
          title="Move left (←)"
          disabled={index === 0}
          onClick={() => {
            moveParticipant(p.id, index - 1);
          }}
        >
          ← Left
        </button>
        <button
          type="button"
          className="btn btn--sm"
          title="Move right (→)"
          disabled={index === data.participants.length - 1}
          onClick={() => {
            moveParticipant(p.id, index + 1);
          }}
        >
          Right →
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            addNote([p.id], "right");
          }}
        >
          + Note
        </button>
      </div>
      <p className="inspector__hint">
        Drag from its dashed lifeline to another to send a message. Drag the box sideways to reorder.
      </p>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            if (
              messages === 0 ||
              window.confirm(`Delete ${p.name || "this participant"} and its ${String(messages)} messages?`)
            )
              useEditor.getState().deleteSelection();
          }}
        >
          Delete participant
        </button>
      </div>
    </Section>
  );
}

function MessageEditor({ data, step }: { data: SequenceData; step: SequenceMessage }): ReactElement {
  const index = data.steps.indexOf(step);
  const self = step.from === step.to;
  return (
    <Section title="Message">
      <label className="inspector__field">
        <span className="inspector__label">Text</span>
        <CommitTextarea
          key={step.text}
          className="input"
          label="Message text"
          value={step.text}
          placeholder="Such as getOrder(id) or Card details"
          onCommit={(text) => {
            updateStep(step.id, { text: text.slice(0, 500) });
          }}
        />
      </label>
      <div className="inspector__row">
        <ParticipantSelect
          data={data}
          label="From"
          value={step.from}
          onChange={(from) => {
            updateStep(step.id, { from });
          }}
        />
        <ParticipantSelect
          data={data}
          label="To"
          value={step.to}
          onChange={(to) => {
            updateStep(step.id, { to });
          }}
        />
      </div>
      <Segmented
        label="Kind"
        options={MESSAGE_ARROWS}
        value={step.arrow}
        names={ARROW_LABELS}
        onChange={(arrow) => {
          updateStep(step.id, { arrow });
        }}
      />
      <p className="inspector__hint">{ARROW_HINTS[step.arrow]}</p>
      <Check
        checked={step.activate}
        onChange={(activate) => {
          updateStep(step.id, { activate });
        }}
      >
        {`${participantName(data, step.to)} becomes active`}
      </Check>
      <Check
        checked={step.deactivate}
        onChange={(deactivate) => {
          updateStep(step.id, { deactivate });
        }}
      >
        {`${participantName(data, step.from)} finishes its activation`}
      </Check>
      {!self && (
        <>
          <Check
            checked={step.create}
            onChange={(create) => {
              updateStep(step.id, { create });
            }}
          >
            {`Creates ${participantName(data, step.to)}`}
          </Check>
          <Check
            checked={step.destroy}
            onChange={(destroy) => {
              updateStep(step.id, { destroy });
            }}
          >
            {`Destroys ${participantName(data, step.to)}`}
          </Check>
        </>
      )}
      <div className="inspector__actions">
        {step.arrow === "sync" && !self && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              addMessage(step.to, step.from, index + 1, { arrow: "reply", deactivate: step.activate });
            }}
          >
            + Reply
          </button>
        )}
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            addNote(self ? [step.from] : [step.from, step.to], "over", index + 1);
          }}
        >
          + Note
        </button>
      </div>
      <StepActions id={step.id} label="message" />
    </Section>
  );
}

const POSITION_NAMES = { left: "Left of", right: "Right of", over: "Over" } as const;

function NoteEditor({ data, step }: { data: SequenceData; step: SequenceNote }): ReactElement {
  const [first = "", second = ""] = step.participants;
  return (
    <Section title="Note">
      <label className="inspector__field">
        <span className="inspector__label">Text</span>
        <CommitTextarea
          key={step.text}
          className="input"
          label="Note text"
          value={step.text}
          onCommit={(text) => {
            updateStep(step.id, { text: text.slice(0, 1_000) });
          }}
        />
      </label>
      <Segmented
        label="Position"
        options={NOTE_POSITIONS}
        value={step.position}
        names={POSITION_NAMES}
        onChange={(position) => {
          updateStep(step.id, { position, participants: position === "over" ? step.participants : [first] });
        }}
      />
      <ParticipantSelect
        data={data}
        label="Participant"
        value={first}
        onChange={(id) => {
          updateStep(step.id, { participants: second && second !== id ? [id, second] : [id] });
        }}
      />
      {step.position === "over" && (
        <ParticipantSelect
          data={data}
          label="Spanning to"
          value={second}
          allowNone
          onChange={(id) => {
            updateStep(step.id, { participants: id && id !== first ? [first, id] : [first] });
          }}
        />
      )}
      <StepActions id={step.id} label="note" />
    </Section>
  );
}

function FragmentEditor({ data, step }: { data: SequenceData; step: SequenceFragment }): ReactElement {
  const span = fragmentSpans(data.steps).find((s) => s.fragment.id === step.id);
  const hasElse = (span?.elses.length ?? 0) > 0;
  const word = ELSE_WORD[step.kind];
  return (
    <Section title={`${FRAGMENT_LABELS[step.kind]} fragment`}>
      <label className="inspector__field">
        <span className="inspector__label">Kind</span>
        <select
          className="select"
          value={step.kind}
          onChange={(event) => {
            updateStep(step.id, { kind: event.target.value });
          }}
        >
          {FRAGMENT_KINDS.map((k) => (
            <option key={k} value={k} disabled={hasElse && !fragmentAllowsElse(k)}>
              {FRAGMENT_LABELS[k]}
            </option>
          ))}
        </select>
        <span className="inspector__hint">{FRAGMENT_HINTS[step.kind]}</span>
      </label>
      <label className="inspector__field">
        <span className="inspector__label">{step.kind === "group" ? "Title" : "Condition"}</span>
        <CommitInput
          key={step.label}
          className="input"
          label="Condition"
          maxLength={200}
          placeholder={step.kind === "loop" ? "Such as for each item" : "Such as payment accepted"}
          value={step.label}
          onCommit={(label) => {
            updateStep(step.id, { label: label.trim() });
          }}
        />
      </label>
      {word && (
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              addElse(step.id);
            }}
          >
            {`+ ${word === "else" ? "Else" : word === "and" ? "Parallel" : "Option"} section`}
          </button>
        </div>
      )}
      <p className="inspector__hint">Deleting the fragment keeps the steps inside it.</p>
      <StepActions id={step.id} label="fragment" />
    </Section>
  );
}

function ElseEditor({ step }: { step: Extract<SequenceStep, { type: "else" }> }): ReactElement {
  return (
    <Section title="Section">
      <label className="inspector__field">
        <span className="inspector__label">Condition</span>
        <CommitInput
          key={step.label}
          className="input"
          label="Condition"
          maxLength={200}
          placeholder="Such as otherwise"
          value={step.label}
          onCommit={(label) => {
            updateStep(step.id, { label: label.trim() });
          }}
        />
      </label>
      <StepActions id={step.id} label="section" />
    </Section>
  );
}

function ManySelected({ count }: { count: number }): ReactElement {
  return (
    <Section title={`${String(count)} selected`}>
      <div className="inspector__field">
        <span className="inspector__label">Put them in a fragment</span>
        <div className="inspector__actions">
          {(["loop", "alt", "opt", "par"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="btn btn--sm"
              title={FRAGMENT_HINTS[k]}
              onClick={() => {
                wrapSelection(k);
              }}
            >
              {FRAGMENT_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            useEditor.getState().deleteSelection();
          }}
        >
          Delete {count}
        </button>
      </div>
    </Section>
  );
}

function MermaidText({ title, data }: { title: string; data: SequenceData }): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = draft ?? sequenceToMermaid(title, data);
  return (
    <Section title="Edit as text">
      <textarea
        className="input input--mono sequence__text"
        aria-label="Mermaid text"
        spellCheck={false}
        rows={10}
        value={text}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
      />
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm btn--primary"
          disabled={draft === null}
          onClick={() => {
            const result = parseMermaidSequence(text);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            replaceSequence(result.data);
            if (result.title) useEditor.getState().setTitle(result.title);
            setDraft(null);
          }}
        >
          Apply
        </button>
        <button
          type="button"
          className="btn btn--sm"
          disabled={draft === null}
          onClick={() => {
            setDraft(null);
            setError(null);
          }}
        >
          Revert
        </button>
      </div>
      <p className="inspector__hint">
        Mermaid sequenceDiagram syntax, such as <code>A-&gt;&gt;+B: request</code>. Apply replaces the
        diagram; you can undo it.
      </p>
    </Section>
  );
}

function Settings({
  data,
  styleId,
  title,
}: {
  data: SequenceData;
  styleId: string;
  title: string;
}): ReactElement {
  const { setStyle } = useEditor.getState();
  const issues = sequenceIssues(data);
  return (
    <>
      <Section title="Sequence diagram">
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
        <Check checked={data.autonumber} onChange={setAutonumber}>
          Number the messages
        </Check>
      </Section>
      <Section title={issues.length === 0 ? "Checks" : `Checks (${String(issues.length)})`}>
        {data.steps.length === 0 ? (
          <p className="inspector__hint">Drag from one lifeline to another to send the first message.</p>
        ) : issues.length === 0 ? (
          <p className="inspector__hint">No problems found.</p>
        ) : (
          <ul className="flow-issues">
            {issues.slice(0, 30).map((issue) => (
              <li key={`${issue.id}${issue.message}`}>
                <button
                  type="button"
                  className="flow-issues__item"
                  onClick={() => {
                    useEditor.getState().select({ taskIds: [issue.id] });
                  }}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <MermaidText title={title} data={data} />
      <GuideSection chartType="sequence" />
    </>
  );
}

export function SequenceInspector(): ReactElement | null {
  const data = useEditor((s) => s.diagram?.sequence);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const title = useEditor((s) => s.diagram?.title ?? "");
  const selectedIds = useEditor((s) => s.selection.taskIds);
  if (!data) return null;
  const selected = selectedIds.length;
  const id = selected === 1 ? selectedIds[0] : undefined;
  const participant = data.participants.find((p) => p.id === id);
  const step = data.steps.find((s) => s.id === id);
  const end =
    step?.type === "end" ? fragmentSpans(data.steps).find((s) => data.steps[s.end] === step) : undefined;
  return (
    <div className="inspector__content" aria-label="Properties">
      {participant ? (
        <ParticipantEditor key={participant.id} data={data} p={participant} />
      ) : step?.type === "message" ? (
        <MessageEditor key={step.id} data={data} step={step} />
      ) : step?.type === "note" ? (
        <NoteEditor key={step.id} data={data} step={step} />
      ) : step?.type === "fragment" ? (
        <FragmentEditor key={step.id} data={data} step={step} />
      ) : end ? (
        <FragmentEditor key={end.fragment.id} data={data} step={end.fragment} />
      ) : step?.type === "else" ? (
        <ElseEditor key={step.id} step={step} />
      ) : selected > 1 ? (
        <ManySelected count={selected} />
      ) : (
        <Settings data={data} styleId={styleId} title={title} />
      )}
    </div>
  );
}
