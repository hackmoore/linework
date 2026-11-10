import {
  fragmentAllowsElse,
  type FragmentKind,
  type MessageArrow,
  type NotePosition,
  type ParticipantKind,
  type SequenceData,
  type SequenceFragment,
  type SequenceMessage,
  type SequenceNote,
  type SequenceParticipant,
  type SequenceStep,
} from "@linework/shared";
import { createId } from "../diagram/factory";

export const PARTICIPANT_COLORS = ["#1a56db", "#0f766e", "#6d28d9", "#b45309", "#be185d", "#4b5563"] as const;

export const PARTICIPANT_LABELS: Readonly<Record<ParticipantKind, string>> = {
  participant: "Participant",
  actor: "Actor",
  boundary: "Boundary",
  control: "Control",
  entity: "Entity",
  database: "Database",
  queue: "Queue",
};

export const PARTICIPANT_HINTS: Readonly<Record<ParticipantKind, string>> = {
  participant: "A system, service or object.",
  actor: "A person or role outside the system.",
  boundary: "The edge of the system, such as a screen or an API.",
  control: "Logic that coordinates the work, such as a controller.",
  entity: "Data the system keeps, such as an Order.",
  database: "A database or other data store.",
  queue: "A message queue or event stream.",
};

export const ARROW_LABELS: Readonly<Record<MessageArrow, string>> = {
  sync: "Call",
  async: "Async",
  reply: "Reply",
};

export const ARROW_HINTS: Readonly<Record<MessageArrow, string>> = {
  sync: "The sender waits for an answer.",
  async: "The sender carries on without waiting.",
  reply: "An answer to an earlier call.",
};

export const FRAGMENT_LABELS: Readonly<Record<FragmentKind, string>> = {
  loop: "Loop",
  alt: "Alternatives",
  opt: "Optional",
  par: "Parallel",
  critical: "Critical",
  break: "Break",
  group: "Group",
};

export const FRAGMENT_HINTS: Readonly<Record<FragmentKind, string>> = {
  loop: "Repeats while a condition holds, such as for each item.",
  alt: "Only one of the sections happens, like if / else.",
  opt: "Happens only if the condition holds.",
  par: "The sections happen at the same time.",
  critical: "Must not be interrupted. Other sections handle what can go wrong.",
  break: "Ends the enclosing interaction when the condition holds.",
  group: "Highlights related steps, with no special meaning.",
};

/** What the extra sections of a fragment are called in Mermaid ("else", "and", "option"). */
export const ELSE_WORD: Partial<Record<FragmentKind, string>> = {
  alt: "else",
  par: "and",
  critical: "option",
};

export function createParticipant(
  name: string,
  index: number,
  kind: ParticipantKind = "participant",
): SequenceParticipant {
  return {
    id: createId(),
    name,
    kind,
    color: PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length] ?? PARTICIPANT_COLORS[0],
  };
}

export function createMessage(
  from: string,
  to: string,
  text: string,
  overrides: Partial<Omit<SequenceMessage, "id" | "type">> = {},
): SequenceMessage {
  return {
    id: createId(),
    type: "message",
    from,
    to,
    text,
    arrow: "sync",
    activate: false,
    deactivate: false,
    create: false,
    destroy: false,
    ...overrides,
  };
}

export function createNote(
  participants: readonly string[],
  text: string,
  position: NotePosition,
): SequenceNote {
  return { id: createId(), type: "note", position, participants: [...participants].slice(0, 2), text };
}

export function createFragment(kind: FragmentKind, label: string): SequenceFragment {
  return { id: createId(), type: "fragment", kind, label };
}

export function createElse(label: string): SequenceStep {
  return { id: createId(), type: "else", label };
}

export function createEnd(): SequenceStep {
  return { id: createId(), type: "end" };
}

/** An empty diagram with two participants. */
export function createSequenceData(): SequenceData {
  return {
    autonumber: false,
    participants: [createParticipant("User", 0, "actor"), createParticipant("System", 1)],
    steps: [],
  };
}

// ---------------------------------------------------------------- structure

export interface FragmentSpan {
  readonly fragment: SequenceFragment;
  /** Index of the fragment step, its else steps and its end step. */
  readonly start: number;
  readonly elses: readonly number[];
  readonly end: number;
  /** How many fragments enclose it. */
  readonly depth: number;
}

/** Every fragment with the indexes of its parts. Assumes the steps are balanced. */
export function fragmentSpans(steps: readonly SequenceStep[]): FragmentSpan[] {
  const spans: FragmentSpan[] = [];
  const open: { fragment: SequenceFragment; start: number; elses: number[] }[] = [];
  steps.forEach((step, index) => {
    if (step.type === "fragment") open.push({ fragment: step, start: index, elses: [] });
    else if (step.type === "else") open.at(-1)?.elses.push(index);
    else if (step.type === "end") {
      const top = open.pop();
      if (top) spans.push({ ...top, end: index, depth: open.length });
    }
  });
  return spans.sort((a, b) => a.start - b.start);
}

/** The fragment a step at `index` opens, separates or closes. */
export function spanOfMarker(steps: readonly SequenceStep[], index: number): FragmentSpan | undefined {
  return fragmentSpans(steps).find((s) => s.start === index || s.end === index || s.elses.includes(index));
}

/**
 * Makes a list of steps valid: steps about missing participants go, an else outside an alt,
 * par or critical fragment goes, a stray end goes and an unclosed fragment is closed at the end.
 */
export function balanceSteps(
  steps: readonly SequenceStep[],
  participantIds: ReadonlySet<string>,
): SequenceStep[] {
  const out: SequenceStep[] = [];
  const open: FragmentKind[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) continue;
    seen.add(step.id);
    if (step.type === "message") {
      if (participantIds.has(step.from) && participantIds.has(step.to)) out.push(step);
    } else if (step.type === "note") {
      const participants = step.participants.filter((p) => participantIds.has(p));
      if (participants.length > 0)
        out.push(participants.length === step.participants.length ? step : { ...step, participants });
    } else if (step.type === "fragment") {
      open.push(step.kind);
      out.push(step);
    } else if (step.type === "else") {
      const kind = open.at(-1);
      if (kind && fragmentAllowsElse(kind)) out.push(step);
    } else if (open.pop() !== undefined) out.push(step);
  }
  while (open.pop() !== undefined) out.push(createEnd());
  return out;
}

/** Removes participants (with their messages and notes) and steps by id. Removing a fragment's start or end removes the whole frame but keeps what was inside. */
export function withoutSequenceItems(data: SequenceData, ids: ReadonlySet<string>): SequenceData {
  if (ids.size === 0) return data;
  const participants = data.participants.filter((p) => !ids.has(p.id));
  const gone = new Set<number>();
  const spans = fragmentSpans(data.steps);
  data.steps.forEach((step, index) => {
    if (!ids.has(step.id)) return;
    if (step.type === "fragment" || step.type === "end") {
      const span = spans.find((s) => s.start === index || s.end === index);
      if (span) for (const i of [span.start, span.end, ...span.elses]) gone.add(i);
    } else gone.add(index);
  });
  const steps = data.steps.filter((_, index) => !gone.has(index));
  if (participants.length === data.participants.length && steps.length === data.steps.length) return data;
  return { ...data, participants, steps: balanceSteps(steps, new Set(participants.map((p) => p.id))) };
}

/** Ids of every participant and step, for select all and pruning the selection. */
export function sequenceIds(data: SequenceData): string[] {
  return [...data.participants.map((p) => p.id), ...data.steps.map((s) => s.id)];
}

export function participantName(data: SequenceData, id: string): string {
  return data.participants.find((p) => p.id === id)?.name ?? "?";
}

// ---------------------------------------------------------------- checks

export interface SequenceIssue {
  readonly message: string;
  /** The participant or step to select. */
  readonly id: string;
}

/** Things that are allowed but probably mistakes. */
export function sequenceIssues(data: SequenceData): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  const name = (id: string): string => participantName(data, id) || "Untitled";
  const created = new Set(data.steps.flatMap((s) => (s.type === "message" && s.create ? [s.to] : [])));
  const alive = new Set(data.participants.filter((p) => !created.has(p.id)).map((p) => p.id));
  const destroyed = new Set<string>();
  const active = new Map<string, number>();
  const used = new Set<string>();
  const reported = new Set<string>();
  const once = (key: string, issue: SequenceIssue): void => {
    if (reported.has(key)) return;
    reported.add(key);
    issues.push(issue);
  };
  for (const step of data.steps) {
    if (step.type === "note") {
      for (const p of step.participants) used.add(p);
      continue;
    }
    if (step.type !== "message") continue;
    used.add(step.from);
    used.add(step.to);
    for (const p of [step.from, step.to]) {
      if (destroyed.has(p))
        once(`dead${p}`, { id: step.id, message: `${name(p)} gets a message after it was destroyed.` });
    }
    if (!alive.has(step.from) && !destroyed.has(step.from))
      once(`early${step.from}`, {
        id: step.id,
        message: `${name(step.from)} sends a message before it is created.`,
      });
    if (step.create) {
      if (alive.has(step.to))
        once(`twice${step.to}`, {
          id: step.id,
          message: `${name(step.to)} is created after it already exists.`,
        });
      alive.add(step.to);
    } else if (!alive.has(step.to) && !destroyed.has(step.to))
      once(`early${step.to}`, {
        id: step.id,
        message: `${name(step.to)} gets a message before it is created.`,
      });
    if (step.deactivate) {
      const n = active.get(step.from) ?? 0;
      if (n === 0)
        once(`deact${step.id}`, {
          id: step.id,
          message: `${name(step.from)} ends an activation it never started.`,
        });
      else active.set(step.from, n - 1);
    }
    if (step.activate) active.set(step.to, (active.get(step.to) ?? 0) + 1);
    if (step.destroy) {
      alive.delete(step.to);
      destroyed.add(step.to);
    }
  }
  for (const p of data.participants)
    if (!used.has(p.id) && data.steps.length > 0)
      issues.push({ id: p.id, message: `${p.name || "Untitled"} takes no part in the interaction.` });
  return issues;
}
