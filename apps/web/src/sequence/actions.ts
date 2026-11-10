import {
  validateSequence,
  type Diagram,
  type FragmentKind,
  type NotePosition,
  type ParticipantKind,
  type SequenceData,
  type SequenceParticipant,
} from "@linework/shared";
import { useEditor } from "../editor/store";
import {
  createElse,
  createEnd,
  createFragment,
  createMessage,
  createNote,
  createParticipant,
  fragmentSpans,
  PARTICIPANT_LABELS,
} from "./model";

type SequenceRecipe = (data: SequenceData) => SequenceData;

/** Wraps a sequence change as a diagram recipe. */
export function sequenceRecipe(recipe: SequenceRecipe): (d: Diagram) => Diagram {
  return (d) => {
    if (!d.sequence) return d;
    const next = recipe(d.sequence);
    return next === d.sequence ? d : { ...d, sequence: next };
  };
}

function commitSequence(recipe: SequenceRecipe): void {
  useEditor.getState().commit(sequenceRecipe(recipe));
}

function current(): SequenceData | undefined {
  return useEditor.getState().diagram?.sequence;
}

const insertAt = <T>(list: readonly T[], index: number, ...items: T[]): T[] => [
  ...list.slice(0, index),
  ...items,
  ...list.slice(index),
];

// ---------------------------------------------------------------- pure changes

/** Moves a step up or down one place, unless that would break a fragment apart. */
export function moveStepBy(data: SequenceData, id: string, by: -1 | 1): SequenceData {
  const from = data.steps.findIndex((s) => s.id === id);
  const to = from + by;
  const a = data.steps[from];
  const b = data.steps[to];
  if (!a || !b) return data;
  const steps = [...data.steps];
  steps[from] = b;
  steps[to] = a;
  const next = { ...data, steps };
  return validateSequence(next).length === 0 ? next : data;
}

export function moveParticipantTo(data: SequenceData, id: string, index: number): SequenceData {
  const from = data.participants.findIndex((p) => p.id === id);
  const p = data.participants[from];
  if (!p || from === index) return data;
  const rest = data.participants.filter((x) => x.id !== id);
  const to = Math.max(0, Math.min(rest.length, index));
  return { ...data, participants: insertAt(rest, to, p) };
}

/**
 * The smallest range of steps covering `ids` that doesn't cut a fragment in two, as
 * [first, last] indexes; null when none of the ids are steps.
 */
export function wrapRange(data: SequenceData, ids: readonly string[]): [number, number] | null {
  const spans = fragmentSpans(data.steps);
  const indexes = data.steps.flatMap((s, i) => (ids.includes(s.id) ? [i] : []));
  if (indexes.length === 0) return null;
  let lo = Math.min(...indexes);
  let hi = Math.max(...indexes);
  for (let changed = true; changed;) {
    changed = false;
    for (const s of spans) {
      const parts = [s.start, s.end, ...s.elses];
      const inside = parts.filter((i) => i >= lo && i <= hi).length;
      // A fragment marker selected on its own means the whole fragment.
      const wanted = ids.includes(s.fragment.id) || ids.includes(data.steps[s.end]?.id ?? "");
      // Inside one of its operands is fine (no markers in range); straddling a marker is not.
      if ((inside > 0 || wanted) && inside < parts.length) {
        lo = Math.min(lo, s.start);
        hi = Math.max(hi, s.end);
        changed = true;
      }
    }
  }
  return [lo, hi];
}

/** Puts the steps in `ids` (or nothing, at the end) inside a new fragment. */
export function wrapInFragment(
  data: SequenceData,
  ids: readonly string[],
  kind: FragmentKind,
  label: string,
): { data: SequenceData; fragmentId: string } {
  const fragment = createFragment(kind, label);
  const range = wrapRange(data, ids);
  const [lo, hi] = range ?? [data.steps.length, data.steps.length - 1];
  const steps = [
    ...data.steps.slice(0, lo),
    fragment,
    ...data.steps.slice(lo, hi + 1),
    createEnd(),
    ...data.steps.slice(hi + 1),
  ];
  return { data: { ...data, steps }, fragmentId: fragment.id };
}

/** Adds an else (or "and", or "option") section at the bottom of an alt, par or critical fragment. */
export function addElseTo(data: SequenceData, fragmentId: string, label: string): SequenceData {
  const span = fragmentSpans(data.steps).find((s) => s.fragment.id === fragmentId);
  if (!span) return data;
  return { ...data, steps: insertAt(data.steps, span.end, createElse(label)) };
}

// ---------------------------------------------------------------- editor wrappers

export function addParticipant(kind: ParticipantKind = "participant"): string | null {
  const data = current();
  if (!data || data.participants.length >= 100) return null;
  const count = data.participants.filter((p) => p.kind === kind).length;
  const name = `${PARTICIPANT_LABELS[kind]}${count > 0 ? ` ${String(count + 1)}` : ""}`;
  const p = createParticipant(name, data.participants.length, kind);
  commitSequence((s) => ({ ...s, participants: [...s.participants, p] }));
  useEditor.getState().select({ taskIds: [p.id] });
  return p.id;
}

export function updateParticipant(id: string, patch: Partial<Omit<SequenceParticipant, "id">>): void {
  commitSequence((s) => ({
    ...s,
    participants: s.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
}

export function moveParticipant(id: string, index: number): void {
  commitSequence((s) => moveParticipantTo(s, id, index));
}

/** Adds a message, by default at the end, selects it and returns its id. */
export function addMessage(
  from: string,
  to: string,
  index?: number,
  overrides: Parameters<typeof createMessage>[3] = {},
): string | null {
  const data = current();
  if (!data || data.steps.length >= 5_000) return null;
  const message = createMessage(from, to, overrides.text ?? "", overrides);
  commitSequence((s) => ({ ...s, steps: insertAt(s.steps, index ?? s.steps.length, message) }));
  useEditor.getState().select({ taskIds: [message.id] });
  return message.id;
}

/**
 * "+ Message": from the selected participant (or after the selected step, continuing the
 * conversation), otherwise between the first two participants.
 */
export function addNextMessage(): string | null {
  const data = current();
  if (!data || data.participants.length === 0) return null;
  const selected = useEditor.getState().selection.taskIds;
  const step = data.steps.find((s) => selected.includes(s.id));
  const participant = data.participants.find((p) => selected.includes(p.id));
  const first = data.participants[0];
  const second = data.participants[1] ?? first;
  if (!first || !second) return null;
  if (step?.type === "message") {
    // A reply to a call, or the next call along.
    const index = data.steps.indexOf(step) + 1;
    return step.arrow === "sync" && step.from !== step.to
      ? addMessage(step.to, step.from, index, { arrow: "reply", deactivate: step.activate })
      : addMessage(step.to, nextAfter(data, step.to), index);
  }
  if (step) return addMessage(first.id, second.id, data.steps.indexOf(step) + 1);
  if (participant) return addMessage(participant.id, nextAfter(data, participant.id));
  return addMessage(first.id, second.id);
}

function nextAfter(data: SequenceData, id: string): string {
  const i = data.participants.findIndex((p) => p.id === id);
  return (data.participants[i + 1] ?? data.participants[i - 1] ?? data.participants[i])?.id ?? id;
}

export function addNote(
  participantIds: readonly string[],
  position: NotePosition,
  index?: number,
): string | null {
  const data = current();
  if (!data || participantIds.length === 0) return null;
  const note = createNote(participantIds, "Note", position);
  commitSequence((s) => ({ ...s, steps: insertAt(s.steps, index ?? s.steps.length, note) }));
  useEditor.getState().select({ taskIds: [note.id] });
  return note.id;
}

/** "+ Note": next to the selected participant, or after the selected step. */
export function addNextNote(): string | null {
  const data = current();
  if (!data) return null;
  const selected = useEditor.getState().selection.taskIds;
  const step = data.steps.find((s) => selected.includes(s.id));
  const participant = data.participants.find((p) => selected.includes(p.id));
  const index = step ? data.steps.indexOf(step) + 1 : undefined;
  if (step?.type === "message")
    return addNote(step.from === step.to ? [step.from] : [step.from, step.to], "over", index);
  const target = participant ?? data.participants[0];
  return target ? addNote([target.id], participant ? "right" : "over", index) : null;
}

export function updateStep(id: string, patch: Partial<Record<string, unknown>>): void {
  commitSequence((s) => ({
    ...s,
    steps: s.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
  }));
}

export function moveStep(id: string, by: -1 | 1): void {
  commitSequence((s) => moveStepBy(s, id, by));
}

export function wrapSelection(kind: FragmentKind): void {
  const data = current();
  if (!data) return;
  const ids = useEditor.getState().selection.taskIds;
  const label =
    kind === "loop" ? "for each item" : kind === "group" ? "Group" : kind === "par" ? "" : "condition";
  const result = wrapInFragment(data, ids, kind, label);
  commitSequence(() => result.data);
  useEditor.getState().select({ taskIds: [result.fragmentId] });
}

export function addElse(fragmentId: string): void {
  commitSequence((s) => addElseTo(s, fragmentId, "otherwise"));
}

export function setAutonumber(autonumber: boolean): void {
  commitSequence((s) => ({ ...s, autonumber }));
}

export function replaceSequence(data: SequenceData): void {
  commitSequence(() => data);
  useEditor.getState().clearSelection();
}
