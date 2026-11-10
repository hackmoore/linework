import { z } from "zod";

const id = z.string().min(1).max(64);
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected #RRGGBB or #RRGGBBAA");

/** How a participant is drawn at the top of its lifeline. */
export const PARTICIPANT_KINDS = [
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "queue",
] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

/** Synchronous call (filled head), asynchronous message (open head) or reply (dashed). */
export const MESSAGE_ARROWS = ["sync", "async", "reply"] as const;
export type MessageArrow = (typeof MESSAGE_ARROWS)[number];

/** UML combined fragments, plus a plain highlighted region. */
export const FRAGMENT_KINDS = ["loop", "alt", "opt", "par", "critical", "break", "group"] as const;
export type FragmentKind = (typeof FRAGMENT_KINDS)[number];

export const NOTE_POSITIONS = ["left", "right", "over"] as const;
export type NotePosition = (typeof NOTE_POSITIONS)[number];

/** A lifeline: a person, system or object taking part in the interaction. */
export const sequenceParticipantSchema = z.object({
  id,
  name: z.string().max(100),
  kind: z.enum(PARTICIPANT_KINDS),
  color: hexColor,
});
export type SequenceParticipant = z.infer<typeof sequenceParticipantSchema>;

const messageStepSchema = z.object({
  id,
  type: z.literal("message"),
  from: id,
  to: id,
  text: z.string().max(500),
  arrow: z.enum(MESSAGE_ARROWS),
  /** Starts an activation bar on the receiver. */
  activate: z.boolean(),
  /** Ends the sender's innermost activation bar. */
  deactivate: z.boolean(),
  /** The receiver's lifeline starts at this message. */
  create: z.boolean(),
  /** The receiver's lifeline ends here, with a cross. */
  destroy: z.boolean(),
});

const noteStepSchema = z.object({
  id,
  type: z.literal("note"),
  position: z.enum(NOTE_POSITIONS),
  /** One participant, or two for a note spanning both (position "over"). */
  participants: z.array(id).min(1).max(2),
  text: z.string().max(1_000),
});

/** Opens a combined fragment; the steps up to its matching "end" are inside it. */
const fragmentStepSchema = z.object({
  id,
  type: z.literal("fragment"),
  kind: z.enum(FRAGMENT_KINDS),
  /** Condition or description, such as "every 5 seconds" or "card accepted". */
  label: z.string().max(200),
});

/** Starts another operand of the enclosing alt, par or critical fragment. */
const elseStepSchema = z.object({
  id,
  type: z.literal("else"),
  label: z.string().max(200),
});

const endStepSchema = z.object({ id, type: z.literal("end") });

/** Steps run top to bottom, in array order. */
export const sequenceStepSchema = z.discriminatedUnion("type", [
  messageStepSchema,
  noteStepSchema,
  fragmentStepSchema,
  elseStepSchema,
  endStepSchema,
]);
export type SequenceStep = z.infer<typeof sequenceStepSchema>;
export type SequenceMessage = z.infer<typeof messageStepSchema>;
export type SequenceNote = z.infer<typeof noteStepSchema>;
export type SequenceFragment = z.infer<typeof fragmentStepSchema>;

export const sequenceDataSchema = z.object({
  /** Numbers each message in order. */
  autonumber: z.boolean(),
  participants: z.array(sequenceParticipantSchema).max(100),
  steps: z.array(sequenceStepSchema).max(5_000),
});
export type SequenceData = z.infer<typeof sequenceDataSchema>;

/** Fragments whose operands may be split by "else" steps. */
export function fragmentAllowsElse(kind: FragmentKind): boolean {
  return kind === "alt" || kind === "par" || kind === "critical";
}

/** Structural problems zod can't see. Each entry is [path, message]. */
export function validateSequence(data: SequenceData): [(string | number)[], string][] {
  const issues: [(string | number)[], string][] = [];
  const participantIds = new Set<string>();
  data.participants.forEach((p, index) => {
    if (participantIds.has(p.id)) issues.push([["participants", index, "id"], "Duplicate participant id"]);
    participantIds.add(p.id);
  });
  const stepIds = new Set<string>();
  const open: FragmentKind[] = [];
  data.steps.forEach((step, index) => {
    if (stepIds.has(step.id)) issues.push([["steps", index, "id"], "Duplicate step id"]);
    stepIds.add(step.id);
    if (step.type === "message") {
      if (!participantIds.has(step.from)) issues.push([["steps", index, "from"], "Unknown participant"]);
      if (!participantIds.has(step.to)) issues.push([["steps", index, "to"], "Unknown participant"]);
    } else if (step.type === "note") {
      if (step.participants.some((p) => !participantIds.has(p)))
        issues.push([["steps", index, "participants"], "Unknown participant"]);
    } else if (step.type === "fragment") {
      open.push(step.kind);
    } else if (step.type === "else") {
      const kind = open.at(-1);
      if (!kind || !fragmentAllowsElse(kind))
        issues.push([["steps", index], "Else is only allowed in alt, par and critical fragments"]);
    } else if (open.pop() === undefined) {
      issues.push([["steps", index], "End without a fragment to close"]);
    }
  });
  if (open.length > 0) issues.push([["steps"], "Fragment is never closed"]);
  return issues;
}
