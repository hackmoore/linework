import { z } from "zod";
import {
  FRAGMENT_KINDS,
  fragmentAllowsElse,
  MESSAGE_ARROWS,
  NOTE_POSITIONS,
  PARTICIPANT_KINDS,
  type Diagram,
  type FragmentKind,
  type SequenceParticipant,
  type SequenceStep,
} from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { createElse, createEnd, createFragment, createMessage, createNote, createParticipant } from "./model";

const text = (max: number): z.ZodString => z.string().max(max);

const messageSpec = z.object({
  type: z.literal("message"),
  from: text(100),
  to: text(100),
  text: text(500).optional(),
  arrow: z.enum(MESSAGE_ARROWS).optional(),
  activate: z.boolean().optional(),
  deactivate: z.boolean().optional(),
  create: z.boolean().optional(),
  destroy: z.boolean().optional(),
});

const noteSpec = z.object({
  type: z.literal("note"),
  text: text(1_000),
  position: z.enum(NOTE_POSITIONS).optional(),
  participants: z.array(text(100)).min(1).max(2),
});

export interface FragmentSpec {
  type: "fragment";
  kind: FragmentKind;
  label?: string | undefined;
  steps: StepSpec[];
  sections?: { label?: string | undefined; steps: StepSpec[] }[] | undefined;
}
export type StepSpec = z.infer<typeof messageSpec> | z.infer<typeof noteSpec> | FragmentSpec;

const stepSpec: z.ZodType<StepSpec> = z.lazy(() =>
  z.union([
    messageSpec,
    noteSpec,
    z.object({
      type: z.literal("fragment"),
      kind: z.enum(FRAGMENT_KINDS),
      label: text(200).optional(),
      steps: z.array(stepSpec).max(5_000),
      sections: z
        .array(z.object({ label: text(200).optional(), steps: z.array(stepSpec).max(5_000) }))
        .max(50)
        .optional(),
    }),
  ]),
);

/** Simple spec for sequence diagrams. Documented at /llms; keep in sync. */
export const sequenceSpecSchema = z.object({
  type: z.literal("sequence"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  autonumber: z.boolean().optional(),
  participants: z
    .array(z.object({ name: text(100).min(1), kind: z.enum(PARTICIPANT_KINDS).optional() }))
    .min(1)
    .max(100),
  steps: z.array(stepSpec).max(5_000),
});
export type SequenceSpec = z.infer<typeof sequenceSpecSchema>;

export type SequenceSpecResult = { ok: true; diagram: Diagram } | { ok: false; error: string };

export function buildSequence(spec: SequenceSpec): SequenceSpecResult {
  const participants: SequenceParticipant[] = [];
  const byName = new Map<string, string>();
  for (const p of spec.participants) {
    const key = p.name.toLowerCase();
    if (byName.has(key)) return { ok: false, error: `Two participants are called ${p.name}` };
    const created = createParticipant(p.name, participants.length, p.kind ?? "participant");
    participants.push(created);
    byName.set(key, created.id);
  }
  const steps: SequenceStep[] = [];
  const idOf = (name: string): string | null => byName.get(name.toLowerCase()) ?? null;
  const add = (list: readonly StepSpec[]): string | null => {
    for (const s of list) {
      if (s.type === "message") {
        const from = idOf(s.from);
        const to = idOf(s.to);
        if (!from) return `Unknown participant ${s.from}`;
        if (!to) return `Unknown participant ${s.to}`;
        steps.push(
          createMessage(from, to, s.text ?? "", {
            arrow: s.arrow ?? "sync",
            activate: s.activate ?? false,
            deactivate: s.deactivate ?? false,
            create: s.create ?? false,
            destroy: s.destroy ?? false,
          }),
        );
      } else if (s.type === "note") {
        const ids: string[] = [];
        for (const name of s.participants) {
          const id = idOf(name);
          if (!id) return `Unknown participant ${name}`;
          ids.push(id);
        }
        const position = s.position ?? (ids.length > 1 ? "over" : "right");
        steps.push(createNote(position === "over" ? ids : ids.slice(0, 1), s.text, position));
      } else {
        steps.push(createFragment(s.kind, s.label ?? ""));
        const error = add(s.steps);
        if (error) return error;
        if (s.sections && s.sections.length > 0) {
          if (!fragmentAllowsElse(s.kind)) return `A ${s.kind} fragment can't have sections`;
          for (const section of s.sections) {
            steps.push(createElse(section.label ?? ""));
            const inner = add(section.steps);
            if (inner) return inner;
          }
        }
        steps.push(createEnd());
      }
      if (steps.length > 5_000) return "Too many steps (the limit is 5,000)";
    }
    return null;
  };
  const error = add(spec.steps);
  if (error) return { ok: false, error };
  const diagram = createDiagram(
    spec.title ?? "Untitled sequence diagram",
    spec.style ?? "professional",
    "sequence",
  );
  return {
    ok: true,
    diagram: { ...diagram, sequence: { autonumber: spec.autonumber ?? false, participants, steps } },
  };
}
