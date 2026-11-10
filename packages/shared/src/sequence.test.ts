import { describe, expect, it } from "vitest";
import { validateSequence, type SequenceData, type SequenceStep } from "./sequence.js";

const a = { id: "a", name: "Client", kind: "actor" as const, color: "#1a56db" };
const b = { id: "b", name: "Server", kind: "participant" as const, color: "#0f766e" };
const message = (id: string, from = "a", to = "b"): SequenceStep => ({
  id,
  type: "message",
  from,
  to,
  text: "call",
  arrow: "sync",
  activate: false,
  deactivate: false,
  create: false,
  destroy: false,
});
const base: SequenceData = { autonumber: false, participants: [a, b], steps: [message("m1")] };

describe("sequence diagrams", () => {
  it("accepts messages inside balanced fragments", () => {
    expect(
      validateSequence({
        ...base,
        steps: [
          { id: "f", type: "fragment", kind: "alt", label: "ok" },
          message("m1"),
          { id: "e", type: "else", label: "error" },
          message("m2", "b", "a"),
          { id: "x", type: "end" },
        ],
      }),
    ).toEqual([]);
  });

  it("flags unknown participants, stray ends, misplaced else and unclosed fragments", () => {
    const issues = validateSequence({
      ...base,
      steps: [
        message("m1", "a", "z"),
        { id: "x", type: "end" },
        { id: "f", type: "fragment", kind: "loop", label: "" },
        { id: "e", type: "else", label: "" },
      ],
    }).map(([, m]) => m);
    expect(issues).toEqual([
      "Unknown participant",
      "End without a fragment to close",
      "Else is only allowed in alt, par and critical fragments",
      "Fragment is never closed",
    ]);
  });
});
