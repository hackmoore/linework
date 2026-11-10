import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import { FRAGMENT_KINDS, PARTICIPANT_KINDS, type FragmentKind, type SequenceData } from "@linework/shared";
import { useEditor } from "../editor/store";
import {
  addMessage,
  addNextMessage,
  addNextNote,
  addParticipant,
  moveParticipant,
  moveStep,
  setAutonumber,
  updateParticipant,
  updateStep,
  wrapSelection,
} from "./actions";
import {
  computeSequenceLayout,
  HEAD_HEIGHT,
  insertIndexAt,
  LINE_HEIGHT,
  participantAtX,
  type SequenceLayout,
} from "./layout";
import { FRAGMENT_LABELS, PARTICIPANT_LABELS } from "./model";
import { SequenceContent } from "./SequenceSvg";

interface Point {
  readonly x: number;
  readonly y: number;
}

type Gesture =
  | { readonly type: "message"; readonly from: string; readonly start: Point; current: Point; moved: boolean }
  | { readonly type: "reorder"; readonly id: string; readonly start: Point; current: Point; moved: boolean };

/** What is being typed into in place, and where the box goes. */
interface Editing {
  readonly id: string;
  readonly value: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly multiline: boolean;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Where the in-place editor for a participant or step goes, with its current text. */
function editingFor(layout: SequenceLayout, id: string): Editing | null {
  const head = layout.participants.find((p) => p.participant.id === id);
  if (head)
    return {
      id,
      value: head.participant.name,
      x: head.x - Math.max(head.width, 140) / 2,
      y: head.headY + HEAD_HEIGHT / 2 - 15,
      width: Math.max(head.width, 140),
      multiline: false,
    };
  const message = layout.messages.find((m) => m.step.id === id);
  if (message) {
    const width = Math.max(180, Math.abs(message.x2 - message.x1) - 16);
    return {
      id,
      value: message.step.text,
      x: message.self ? message.x1 + 4 : message.labelX - width / 2,
      y: message.y - Math.max(1, message.lines.length) * LINE_HEIGHT - 12,
      width,
      multiline: true,
    };
  }
  const note = layout.notes.find((n) => n.step.id === id);
  if (note)
    return {
      id,
      value: note.step.text,
      x: note.x,
      y: note.y,
      width: Math.max(note.width, 180),
      multiline: true,
    };
  for (const f of layout.fragments) {
    if (f.span.fragment.id === id)
      return { id, value: f.span.fragment.label, x: f.x1 + 50, y: f.y1, width: 200, multiline: false };
    const sep = f.separators.find((s) => s.id === id);
    if (sep) return { id, value: sep.label, x: f.x1 + 6, y: sep.y + 2, width: 200, multiline: false };
  }
  return null;
}

function commitEditing(data: SequenceData, editing: Editing, value: string): void {
  if (value === editing.value) return;
  if (data.participants.some((p) => p.id === editing.id)) {
    updateParticipant(editing.id, { name: value.replace(/\n/g, " ").trim().slice(0, 100) || "Untitled" });
    return;
  }
  const step = data.steps.find((s) => s.id === editing.id);
  if (!step) return;
  if (step.type === "message") updateStep(step.id, { text: value.slice(0, 500) });
  else if (step.type === "note") updateStep(step.id, { text: value.slice(0, 1_000) });
  else if (step.type === "fragment" || step.type === "else")
    updateStep(step.id, { label: value.replace(/\n/g, " ").slice(0, 200) });
}

export function SequenceEditor(): ReactElement | null {
  const data = useEditor((s) => s.diagram?.sequence);
  const styleId = useEditor((s) => s.diagram?.styleId ?? "professional");
  const selectedIds = useEditor((s) => s.selection.taskIds);
  const layout = useMemo(() => (data ? computeSequenceLayout(data) : null), [data]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const startEditing = (id: string): void => {
    const state = useEditor.getState();
    const d = state.diagram?.sequence;
    if (!d) return;
    const e = editingFor(computeSequenceLayout(d), id);
    if (e) setEditing(e);
  };

  // Keys for the selection: arrows reorder, Enter or F2 edits the text, M adds a message.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey) return;
      const state = useEditor.getState();
      const d = state.diagram?.sequence;
      if (!d) return;
      const ids = state.selection.taskIds;
      const only = ids.length === 1 ? ids[0] : undefined;
      const key = event.key;
      const participantIndex = d.participants.findIndex((p) => p.id === only);
      const isStep = d.steps.some((s) => s.id === only);
      if (only && (key === "Enter" || key === "F2")) startEditing(only);
      else if (only && isStep && (key === "ArrowUp" || key === "ArrowDown"))
        moveStep(only, key === "ArrowUp" ? -1 : 1);
      else if (only && participantIndex >= 0 && (key === "ArrowLeft" || key === "ArrowRight"))
        moveParticipant(only, participantIndex + (key === "ArrowLeft" ? -1 : 1));
      else if (key === "m" && !event.altKey) {
        const id = addNextMessage();
        if (id) startEditing(id);
      } else if (key === "n" && !event.altKey) {
        const id = addNextNote();
        if (id) startEditing(id);
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!data || !layout) return null;

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return;
    const state = useEditor.getState();
    const target = event.target as Element;
    const p = localPoint(event);
    const participantId = target.closest("[data-participant-id]")?.getAttribute("data-participant-id");
    const lifelineId = target.closest("[data-lifeline-id]")?.getAttribute("data-lifeline-id");
    const stepId = target.closest("[data-step-id]")?.getAttribute("data-step-id");
    const id = participantId ?? stepId;
    if (lifelineId && !participantId) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setGesture({ type: "message", from: lifelineId, start: p, current: p, moved: false });
      return;
    }
    if (!id) {
      state.clearSelection();
      return;
    }
    if (event.shiftKey) {
      const ids = state.selection.taskIds;
      state.select({ taskIds: ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id] });
      return;
    }
    state.select({ taskIds: [id] });
    if (participantId) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setGesture({ type: "reorder", id: participantId, start: p, current: p, moved: false });
    }
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    if (!gesture) return;
    const p = localPoint(event);
    const moved = gesture.moved || Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 5;
    setGesture({ ...gesture, current: p, moved });
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const g = gesture;
    setGesture(null);
    if (!g) return;
    if (g.type === "reorder") {
      if (!g.moved) return;
      const to = participantAtX(layout, g.current.x);
      if (to) moveParticipant(g.id, to.index);
      return;
    }
    if (!g.moved) {
      useEditor.getState().select({ taskIds: [g.from] });
      return;
    }
    const to = participantAtX(layout, g.current.x);
    if (!to) return;
    const id = addMessage(g.from, to.participant.id, insertIndexAt(layout, g.start.y));
    if (id) startEditing(id);
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    const target = event.target as Element;
    const id =
      target.closest("[data-participant-id]")?.getAttribute("data-participant-id") ??
      target.closest("[data-step-id]")?.getAttribute("data-step-id");
    if (id) startEditing(id);
  };

  const preview = gesture?.type === "message" && gesture.moved ? gesture : null;
  const previewFrom = preview && layout.participants.find((p) => p.participant.id === preview.from);
  const previewTo = preview ? participantAtX(layout, preview.current.x) : undefined;
  const reorder =
    gesture?.type === "reorder" && gesture.moved ? participantAtX(layout, gesture.current.x) : undefined;

  return (
    <div className="sequence">
      <div className="gantt__toolbar" role="toolbar" aria-label="Sequence diagram">
        <button
          type="button"
          className="btn btn--sm"
          title="Add a participant"
          onClick={() => {
            const id = addParticipant();
            if (id) startEditing(id);
          }}
        >
          + Participant
        </button>
        <select
          className="select select--sm"
          aria-label="Add a participant of a type"
          value=""
          onChange={(event) => {
            const kind = event.target.value as (typeof PARTICIPANT_KINDS)[number] | "";
            if (!kind) return;
            const id = addParticipant(kind);
            if (id) startEditing(id);
          }}
        >
          <option value="">More…</option>
          {PARTICIPANT_KINDS.filter((k) => k !== "participant").map((k) => (
            <option key={k} value={k}>
              {PARTICIPANT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--sm"
          title="Add a message (M). Or drag from one lifeline to another."
          disabled={data.participants.length === 0}
          onClick={() => {
            const id = addNextMessage();
            if (id) startEditing(id);
          }}
        >
          + Message
        </button>
        <button
          type="button"
          className="btn btn--sm"
          title="Add a note (N)"
          disabled={data.participants.length === 0}
          onClick={() => {
            const id = addNextNote();
            if (id) startEditing(id);
          }}
        >
          + Note
        </button>
        <select
          className="select select--sm"
          aria-label="Put the selected steps in a fragment"
          title="Put the selected steps in a loop, alternatives or another fragment"
          value=""
          onChange={(event) => {
            const kind = event.target.value as FragmentKind | "";
            if (kind) wrapSelection(kind);
          }}
        >
          <option value="">+ Fragment…</option>
          {FRAGMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {`${FRAGMENT_LABELS[k]}${k === "group" ? "" : ` (${k})`}`}
            </option>
          ))}
        </select>
        <label className="sequence__toggle">
          <input
            type="checkbox"
            checked={data.autonumber}
            onChange={(event) => {
              setAutonumber(event.target.checked);
            }}
          />
          Number messages
        </label>
      </div>
      <div className="sequence__scroll">
        <div className="sequence__page" style={{ width: layout.width, height: layout.height }}>
          <svg
            ref={svgRef}
            width={layout.width}
            height={layout.height}
            className="sequence__svg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              setGesture(null);
            }}
            onDoubleClick={onDoubleClick}
            role="application"
            aria-label="Sequence diagram. Drag from one lifeline to another to add a message. Double-click anything to edit its text."
          >
            <SequenceContent layout={layout} styleId={styleId} selectedIds={selected} interactive />
            {preview && previewFrom && (
              <g pointerEvents="none">
                <line
                  x1={previewFrom.x}
                  y1={preview.start.y}
                  x2={previewTo ? previewTo.x : preview.current.x}
                  y2={preview.start.y}
                  stroke="#4f46e5"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                {previewTo?.participant.id === preview.from && (
                  <path
                    d={`M${String(previewFrom.x)} ${String(preview.start.y)}h34v26h-34`}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                )}
              </g>
            )}
            {reorder && (
              <line
                x1={reorder.x}
                x2={reorder.x}
                y1={0}
                y2={layout.height}
                stroke="#4f46e5"
                strokeWidth={3}
                opacity={0.5}
                pointerEvents="none"
              />
            )}
          </svg>
          {editing && (
            <InlineEditor
              key={editing.id}
              editing={editing}
              onDone={(value) => {
                const d = useEditor.getState().diagram?.sequence;
                if (d && value !== null) commitEditing(d, editing, value);
                setEditing(null);
              }}
            />
          )}
        </div>
        {data.steps.length === 0 && (
          <p className="sequence__hint">
            Drag from one dashed lifeline to another to send a message, or press M. Double-click anything to
            change its text, and use + Participant to add more lifelines.
          </p>
        )}
      </div>
    </div>
  );
}

function InlineEditor({
  editing,
  onDone,
}: {
  editing: Editing;
  onDone: (value: string | null) => void;
}): ReactElement {
  const [value, setValue] = useState(editing.value);
  const done = useRef(false);
  const finish = (result: string | null): void => {
    if (done.current) return;
    done.current = true;
    onDone(result);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") finish(null);
    else if (event.key === "Enter" && !(editing.multiline && event.shiftKey)) {
      event.preventDefault();
      finish(value);
    }
  };
  const style = { left: editing.x, top: editing.y, width: editing.width };
  return editing.multiline ? (
    <textarea
      className="sequence__inline"
      style={style}
      aria-label="Text"
      autoFocus
      rows={Math.max(1, value.split("\n").length)}
      value={value}
      placeholder="Message"
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        finish(value);
      }}
    />
  ) : (
    <input
      className="sequence__inline"
      style={style}
      aria-label="Text"
      autoFocus
      value={value}
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        finish(value);
      }}
    />
  );
}
