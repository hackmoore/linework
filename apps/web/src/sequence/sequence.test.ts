import { describe, expect, it } from "vitest";
import { parseDiagram, validateSequence, type SequenceData } from "@linework/shared";
import { applyPatch, diffDiagrams } from "../collab/patch";
import { createDiagram } from "../diagram/factory";
import { parseMermaid } from "../mermaid/mermaid";
import { buildTemplate } from "../templates/build";
import { parseSimpleSpec } from "../share/simpleSpec";
import { moveStepBy, wrapInFragment, wrapRange } from "./actions";
import { nestSteps } from "./ai";
import { parseMermaidSequence, sequenceToMermaid } from "./io";
import { computeSequenceLayout, insertIndexAt } from "./layout";
import {
  balanceSteps,
  createEnd,
  createFragment,
  createMessage,
  createParticipant,
  sequenceIssues,
  withoutSequenceItems,
} from "./model";

function sample(): SequenceData {
  const a = createParticipant("Client", 0, "actor");
  const b = createParticipant("Server", 1);
  const c = createParticipant("DB", 2, "database");
  return {
    autonumber: false,
    participants: [a, b, c],
    steps: [
      createMessage(a.id, b.id, "request", { activate: true }),
      createFragment("loop", "each row"),
      createMessage(b.id, c.id, "query"),
      createEnd(),
      createMessage(b.id, a.id, "response", { arrow: "reply", deactivate: true }),
    ],
  };
}

describe("sequence layout", () => {
  it("puts lifelines left to right and steps top to bottom", () => {
    const layout = computeSequenceLayout(sample());
    const xs = layout.participants.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    const ys = layout.messages.map((m) => m.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(layout.fragments).toHaveLength(1);
    const frame = layout.fragments[0];
    const query = layout.messages[1];
    expect(frame && query && frame.y1 < query.y && frame.y2 > query.y).toBe(true);
  });

  it("draws an activation bar from the call to the reply", () => {
    const layout = computeSequenceLayout(sample());
    const [call, , reply] = layout.messages;
    expect(layout.activations).toHaveLength(1);
    expect(layout.activations[0]?.y1).toBe(call?.y);
    expect(layout.activations[0]?.y2).toBe(reply?.y);
  });

  it("leaves room for long labels between lifelines", () => {
    const data = sample();
    const long = {
      ...data,
      steps: [createMessage(data.participants[0]?.id ?? "", data.participants[1]?.id ?? "", "x".repeat(80))],
    };
    const [a, b] = computeSequenceLayout(long).participants;
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBeGreaterThan(80 * 13 * 0.56);
  });

  it("works out where a dropped message goes", () => {
    const layout = computeSequenceLayout(sample());
    expect(insertIndexAt(layout, 0)).toBe(0);
    expect(insertIndexAt(layout, 10_000)).toBe(5);
  });
});

describe("sequence structure", () => {
  it("deleting a participant takes its messages and keeps fragments valid", () => {
    const data = sample();
    const db = data.participants[2]?.id ?? "";
    const next = withoutSequenceItems(data, new Set([db]));
    expect(next.participants).toHaveLength(2);
    expect(next.steps.filter((s) => s.type === "message")).toHaveLength(2);
    expect(validateSequence(next)).toEqual([]);
  });

  it("deleting a fragment keeps what was inside", () => {
    const data = sample();
    const loop = data.steps[1]?.id ?? "";
    const next = withoutSequenceItems(data, new Set([loop]));
    expect(next.steps.map((s) => s.type)).toEqual(["message", "message", "message"]);
  });

  it("wraps a selection without cutting a fragment in two", () => {
    const data = sample();
    const query = data.steps[2]?.id ?? "";
    const response = data.steps[4]?.id ?? "";
    expect(wrapRange(data, [query])).toEqual([2, 2]);
    expect(wrapRange(data, [query, response])).toEqual([1, 4]);
    const wrapped = wrapInFragment(data, [query, response], "opt", "if ok").data;
    expect(validateSequence(wrapped)).toEqual([]);
    expect(wrapped.steps[1]?.type).toBe("fragment");
  });

  it("won't move a step if that breaks a fragment", () => {
    const data = { ...sample(), steps: [createFragment("loop", ""), createEnd()] };
    const start = data.steps[0]?.id ?? "";
    expect(moveStepBy(data, start, 1)).toBe(data);
  });

  it("balances steps after concurrent edits", () => {
    const data = sample();
    const steps = balanceSteps(
      [createEnd(), createFragment("alt", ""), ...data.steps],
      new Set(data.participants.map((p) => p.id)),
    );
    expect(validateSequence({ ...data, steps })).toEqual([]);
  });

  it("checks for messages after a participant is destroyed", () => {
    const data = sample();
    const [a, b] = data.participants;
    const steps = [
      createMessage(a?.id ?? "", b?.id ?? "", "bye", { destroy: true }),
      createMessage(a?.id ?? "", b?.id ?? "", "hello?"),
    ];
    expect(sequenceIssues({ ...data, steps }).map((i) => i.message)).toContain(
      "Server gets a message after it was destroyed.",
    );
  });
});

describe("sequence Mermaid", () => {
  it("round-trips through Mermaid text", () => {
    const data = sample();
    const text = sequenceToMermaid("Lookup", data);
    expect(text).toContain("actor Client");
    expect(text).toContain('participant DB@{ "type": "database" }');
    expect(text).toContain("Client->>+Server: request");
    expect(text).toContain("Server-->>-Client: response");
    const back = parseMermaidSequence(text);
    if (!back.ok) throw new Error(back.error);
    expect(back.title).toBe("Lookup");
    expect(back.data.participants.map((p) => [p.name, p.kind])).toEqual([
      ["Client", "actor"],
      ["Server", "participant"],
      ["DB", "database"],
    ]);
    expect(back.data.steps.map((s) => s.type)).toEqual(data.steps.map((s) => s.type));
  });

  it("imports common Mermaid syntax", () => {
    const result = parseMermaid(`sequenceDiagram
      autonumber
      participant A as Alice
      actor B
      A->>B: Hello<br/>there
      activate B
      alt is sick
        B-->>A: Not so good
      else is well
        B-)A: Great
      end
      deactivate B
      Note over A,B: done
      box Aqua Group
      end
      create participant C
      A->>C: make
      destroy C
      A-xC: bye`);
    if (!result.ok) throw new Error(result.error);
    const seq = result.diagram.sequence;
    expect(result.diagram.chartType).toBe("sequence");
    expect(seq?.autonumber).toBe(true);
    expect(seq?.participants.map((p) => p.name)).toEqual(["Alice", "B", "C"]);
    const messages = seq?.steps.filter((s) => s.type === "message") ?? [];
    expect(messages.map((m) => [m.text, m.arrow, m.activate, m.deactivate, m.create, m.destroy])).toEqual([
      ["Hello\nthere", "sync", true, false, false, false],
      ["Not so good", "reply", false, false, false, false],
      ["Great", "async", false, true, false, false],
      ["make", "sync", false, false, true, false],
      ["bye", "sync", false, false, false, true],
    ]);
    expect(parseDiagram(result.diagram).ok).toBe(true);
  });
});

describe("sequence specs, templates and collaboration", () => {
  it("builds nested fragments from the simple spec", () => {
    const result = parseSimpleSpec({
      type: "sequence",
      participants: [{ name: "A" }, { name: "B" }],
      steps: [
        {
          type: "fragment",
          kind: "alt",
          label: "x",
          steps: [{ type: "message", from: "A", to: "B", text: "one" }],
          sections: [{ label: "y", steps: [{ type: "message", from: "B", to: "A", text: "two" }] }],
        },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.diagram.sequence?.steps.map((s) => s.type)).toEqual([
      "fragment",
      "message",
      "else",
      "message",
      "end",
    ]);
    expect(
      parseSimpleSpec({
        type: "sequence",
        participants: [{ name: "A" }],
        steps: [{ type: "message", from: "A", to: "Z" }],
      }).ok,
    ).toBe(false);
  });

  it("nests the flat AI output", () => {
    const step = {
      from: null,
      to: null,
      text: null,
      arrow: null,
      activate: null,
      deactivate: null,
      participants: null,
      kind: null,
    };
    const nested = nestSteps([
      { ...step, type: "fragment", kind: "loop", text: "again" },
      { ...step, type: "message", from: "A", to: "B", text: "hi" },
      { ...step, type: "else", text: "ignored in a loop" },
    ]);
    expect(nested).toEqual([
      {
        type: "fragment",
        kind: "loop",
        label: "again",
        steps: [expect.objectContaining({ type: "message", text: "hi" })],
      },
    ]);
  });

  it("templates are valid documents", () => {
    for (const id of ["sequence", "sequence-blank"] as const) {
      const d = buildTemplate(id, "professional");
      const parsed = parseDiagram(d);
      if (!parsed.ok) throw new Error(parsed.error);
    }
  });

  it("syncs changes between collaborators", () => {
    const base = { ...createDiagram("S", "professional", "sequence"), sequence: sample() };
    const next = {
      ...base,
      sequence: {
        ...sample(),
        autonumber: true,
        participants: base.sequence.participants,
        steps: base.sequence.steps.slice(0, 1),
      },
    };
    const patch = diffDiagrams(base, next);
    expect(patch).not.toBeNull();
    if (!patch) return;
    const applied = applyPatch(base, patch);
    expect(applied.sequence?.autonumber).toBe(true);
    expect(applied.sequence?.steps).toHaveLength(1);
  });
});
