import { z } from "zod";
import type { KindAi } from "../ai/kinds";

const output = z.object({
  title: z.string().describe("Short chart title"),
  direction: z.enum(["TB", "LR"]),
  states: z.array(
    z.object({
      name: z.string().describe("State name, usually an adjective or -ing word such as Idle or Charging"),
      kind: z.enum(["state", "choice", "composite"]),
      parent: z.string().nullable().describe("Name of the composite state it's inside; usually null"),
      entry: z.string().nullable().describe("Action on entering the state, if any"),
      exit: z.string().nullable().describe("Action on leaving the state, if any"),
    }),
  ),
  transitions: z.array(
    z.object({
      from: z.string().describe('State name, or "[*]" for the start'),
      to: z.string().describe('State name, or "[*]" for the end'),
      event: z.string().nullable().describe("What triggers it; null only from [*] or a choice"),
      guard: z
        .string()
        .nullable()
        .describe("Condition that must hold; required on every branch out of a choice"),
      action: z.string().nullable(),
    }),
  ),
});

export const stateAi: KindAi = {
  label: "State machine",
  example:
    "A vending machine: idle until a coin is inserted, then it counts credit until a product is selected. If there's enough credit it vends and gives change, otherwise it asks for more. Refund returns the coins at any time.",
  output,
  prompt: [
    "Produce a UML state machine. Layout is automatic.",
    'Start with one transition from "[*]" to the first state. Add transitions to "[*]" where the machine ends, if it does.',
    "Label transitions with the event that triggers them, plus a [guard] condition or / action where they matter. Use a choice state when one event leads to different states depending on conditions, with a guard on every branch.",
    "Use composite states only when a group of states shares transitions, such as a Cancel that applies to all of them.",
  ],
  toSpec: (raw) => {
    const o = raw as z.infer<typeof output>;
    const names = new Set(o.states.map((s) => s.name));
    return {
      type: "state",
      title: o.title,
      direction: o.direction,
      states: o.states.map((s) => ({
        name: s.name.slice(0, 200),
        kind: s.kind,
        ...(s.parent && names.has(s.parent) && s.parent !== s.name ? { parent: s.parent } : {}),
        ...(s.entry ? { entry: s.entry.slice(0, 200) } : {}),
        ...(s.exit ? { exit: s.exit.slice(0, 200) } : {}),
      })),
      transitions: o.transitions
        .filter((t) => (t.from === "[*]" || names.has(t.from)) && (t.to === "[*]" || names.has(t.to)))
        .map((t) => ({
          from: t.from,
          to: t.to,
          ...(t.event ? { event: t.event.slice(0, 200) } : {}),
          ...(t.guard ? { guard: t.guard.slice(0, 200) } : {}),
          ...(t.action ? { action: t.action.slice(0, 200) } : {}),
        })),
    };
  },
};
