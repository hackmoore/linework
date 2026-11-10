import { z } from "zod";
import { FRAGMENT_KINDS, MESSAGE_ARROWS, PARTICIPANT_KINDS, fragmentAllowsElse } from "@linework/shared";
import type { KindAi } from "../ai/kinds";
import type { FragmentSpec, StepSpec } from "./spec";

const output = z.object({
  title: z.string().describe("Short chart title"),
  autonumber: z.boolean().describe("True for long diagrams where numbered steps help discussion"),
  participants: z.array(
    z.object({
      name: z.string().describe("Unique short name, such as Browser, Auth service or Orders DB"),
      kind: z.enum(PARTICIPANT_KINDS),
    }),
  ),
  steps: z
    .array(
      z.object({
        type: z.enum(["message", "note", "fragment", "else", "end"]),
        from: z.string().nullable().describe("message: sender name"),
        to: z.string().nullable().describe("message: receiver name"),
        text: z.string().nullable().describe("message text, note text, or fragment / else condition"),
        arrow: z.enum(MESSAGE_ARROWS).nullable().describe("message: sync call, async message or reply"),
        activate: z.boolean().nullable().describe("message: the receiver starts working on it"),
        deactivate: z.boolean().nullable().describe("message: the sender has finished (usually on replies)"),
        participants: z.array(z.string()).nullable().describe("note: one or two participant names"),
        kind: z
          .enum(FRAGMENT_KINDS)
          .nullable()
          .describe("fragment: loop, alt, opt, par, critical, break or group"),
      }),
    )
    .describe("In order, top to bottom. A fragment step opens a frame that an end step closes."),
});

/** Turns the flat list of steps into the nested simple spec, closing anything left open. */
export function nestSteps(flat: z.infer<typeof output>["steps"]): StepSpec[] {
  const root: StepSpec[] = [];
  const stack: { fragment: FragmentSpec; target: StepSpec[] }[] = [];
  const target = (): StepSpec[] => stack.at(-1)?.target ?? root;
  for (const s of flat) {
    if (s.type === "message" && s.from && s.to)
      target().push({
        type: "message",
        from: s.from,
        to: s.to,
        text: (s.text ?? "").slice(0, 500),
        arrow: s.arrow ?? "sync",
        activate: s.activate ?? false,
        deactivate: s.deactivate ?? false,
      });
    else if (s.type === "note" && s.participants && s.participants.length > 0)
      target().push({
        type: "note",
        text: (s.text ?? "").slice(0, 1_000),
        participants: s.participants.slice(0, 2),
        position: s.participants.length > 1 ? "over" : "right",
      });
    else if (s.type === "fragment") {
      const fragment: FragmentSpec = {
        type: "fragment",
        kind: s.kind ?? "group",
        label: (s.text ?? "").slice(0, 200),
        steps: [],
      };
      target().push(fragment);
      stack.push({ fragment, target: fragment.steps });
    } else if (s.type === "else") {
      const top = stack.at(-1);
      if (!top || !fragmentAllowsElse(top.fragment.kind)) continue;
      const section = { label: (s.text ?? "").slice(0, 200), steps: [] as StepSpec[] };
      top.fragment.sections = [...(top.fragment.sections ?? []), section];
      top.target = section.steps;
    } else if (s.type === "end") stack.pop();
  }
  return root;
}

export const sequenceAi: KindAi = {
  label: "Sequence diagram",
  example:
    "How signing in with Google works in our web app: the user clicks Sign in, the browser goes to Google, Google redirects back with a code, our API swaps it for tokens, looks up or creates the user in Postgres and sets a session cookie.",
  output,
  prompt: [
    "Produce a UML sequence diagram. Layout is automatic.",
    "Participants are listed left to right in the order they first take part. Use actor for people, database for data stores, queue for message queues, participant for systems and services. Use boundary, control and entity only if the user asks for UML analysis classes.",
    "Messages read as what the sender asks for, such as POST /orders or Validate token. Use sync for calls the sender waits on, a reply (with deactivate true) for each answer that matters, and async for fire-and-forget events.",
    "Set activate true on a call when the receiver does real work before replying, and deactivate true on the matching reply.",
    "Wrap repeated steps in a loop, if / else branches in an alt with else steps, optional steps in opt, and concurrent steps in par. Close every fragment with an end step.",
    "Every message and note must use existing participant names.",
  ],
  toSpec: (raw) => {
    const o = raw as z.infer<typeof output>;
    const names = new Set<string>();
    const participants = o.participants
      .map((p) => ({ name: p.name.slice(0, 100), kind: p.kind }))
      .filter((p) => {
        const key = p.name.toLowerCase();
        if (!p.name || names.has(key)) return false;
        names.add(key);
        return true;
      });
    return {
      type: "sequence",
      title: o.title,
      autonumber: o.autonumber,
      participants,
      steps: nestSteps(o.steps),
    };
  },
};
