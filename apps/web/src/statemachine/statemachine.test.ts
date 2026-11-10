import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToSvg } from "../export/exporters";
import { groupMembers } from "../kinds/groups";
import { diagramToMermaid } from "../mermaid/mermaid";
import { edgePoints } from "../render/geometry";
import { importText } from "../share/importText";
import { parseSimpleSpec } from "../share/simpleSpec";
import { buildTemplate } from "../templates/build";
import { addNextState, addSelfTransition, updateActivities, updateTrigger } from "./StatePanel";
import { createStateNode, parseTrigger, stateIssues, transition, triggerLabel } from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

describe("state machines", () => {
  it("reads and writes event [guard] / action labels", () => {
    expect(parseTrigger("pay [amount > 0] / send receipt")).toEqual({
      event: "pay",
      guard: "amount > 0",
      action: "send receipt",
    });
    expect(parseTrigger("[ok]")).toEqual({ event: "", guard: "ok", action: "" });
    expect(parseTrigger("/ log")).toEqual({ event: "", guard: "", action: "log" });
    expect(triggerLabel({ event: "tick", guard: "", action: "count" })).toBe("tick / count");
  });

  it("builds the template with no problems", () => {
    const d = valid(buildTemplate("state"));
    expect(d.chartType).toBe("state");
    expect(stateIssues(d)).toEqual([]);
    expect(diagramToSvg(d).svg).toContain("entry / send invoice");
    valid(buildTemplate("state-blank"));
  });

  it("exports Mermaid and imports it back, composite states included", () => {
    const text = [
      "stateDiagram-v2",
      "  [*] --> Idle",
      "  Idle --> Active : start",
      '  state "Active" as Active {',
      "    [*] --> Warming",
      "    Warming --> Running : warm [temp ok]",
      "  }",
      "  Active --> Idle : stop / save",
      "  Idle : entry / reset",
      "  state check <<choice>>",
      "  Running --> check : done",
      "  check --> [*] : [finished]",
      "  check --> Idle : [more]",
    ].join("\n");
    const result = importText(text);
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.chartType).toBe("state");
    const active = d.nodes.find((n) => n.kind === "container");
    if (!active) throw new Error("no composite");
    const inside = groupMembers(d.nodes).get(active.id);
    expect(inside?.size).toBe(3);
    expect(d.nodes.find((n) => n.label === "Idle")?.meta?.entry).toBe("reset");
    expect(stateIssues(d)).toEqual([]);
    const out = diagramToMermaid(d);
    expect(out).toMatch(/state "Active" as s\d+ \{\n {4}state "Warming" as s\d+/);
    expect(out).toMatch(/\n {4}\[\*\] --> s\d+\n/);
    expect(out).toContain("<<choice>>");
    expect(out).toMatch(/s\d+ --> s\d+ : stop \/ save/);
    const again = importText(out);
    if (!again.ok) throw new Error(again.error);
    expect(again.diagram.nodes).toHaveLength(d.nodes.length);
    expect(again.diagram.edges).toHaveLength(d.edges.length);
  });

  it("builds from the simple spec", () => {
    const result = parseSimpleSpec({
      type: "state",
      direction: "LR",
      states: [{ name: "Off" }, { name: "On", entry: "light on" }],
      transitions: [
        { from: "[*]", to: "Off" },
        { from: "Off", to: "On", event: "flip" },
        { from: "On", to: "Off", event: "flip" },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(stateIssues(d)).toEqual([]);
    const off = d.nodes.find((n) => n.label === "Off");
    const on = d.nodes.find((n) => n.label === "On");
    expect((on?.x ?? 0) > (off?.x ?? 0)).toBe(true);
    expect(
      parseSimpleSpec({ type: "state", states: [{ name: "A" }], transitions: [{ from: "A", to: "B" }] }).ok,
    ).toBe(false);
  });

  it("finds unreachable states, dead ends, unguarded choices and clashing events", () => {
    const start = createStateNode("initial");
    const a = createStateNode("rounded", "A");
    const b = createStateNode("rounded", "B");
    const lost = createStateNode("rounded", "Lost");
    const choice = createStateNode("diamond");
    const d = {
      ...createDiagram("S", "professional", "state"),
      nodes: [start, a, b, lost, choice],
      edges: [
        transition(start.id, a.id),
        transition(a.id, b.id, "go"),
        transition(a.id, choice.id, "go"),
        transition(choice.id, a.id, "back"),
        transition(lost.id, a.id, "x"),
      ],
    };
    const messages = stateIssues(d).map((i) => i.message);
    expect(messages).toContain("Lost can't be reached");
    expect(messages).toContain("B has no way out");
    expect(messages).toContain("Each branch out of a choice needs a [guard]");
    expect(messages).toContain("A has two transitions on go with no guard");
    expect(stateIssues({ ...d, nodes: [a], edges: [] }).map((i) => i.message)).toContain(
      "There's no initial state. Add one where the machine starts.",
    );
  });
});

describe("editing state machines", () => {
  beforeEach(() => {
    const start = createStateNode("initial");
    useEditor.getState().load({ ...createDiagram("S", "professional", "state"), nodes: [start] });
  });

  it("adds the next state with Tab and edits triggers and activities", () => {
    const start = useEditor.getState().diagram?.nodes[0]?.id ?? "";
    expect(addNextState(start)).toBe(true);
    const first = useEditor.getState().selection.nodeIds[0] ?? "";
    expect(addNextState(first)).toBe(true);
    let d = useEditor.getState().diagram;
    if (!d) throw new Error("no diagram");
    valid(d);
    expect(d.edges.map((e) => e.label)).toEqual(["", "event"]);
    const edge = d.edges[1];
    if (!edge) throw new Error("no edge");
    updateTrigger(edge, { event: "start", guard: "ready" });
    const node = d.nodes.find((n) => n.id === first);
    if (!node) throw new Error("no node");
    updateActivities(node, { entry: "beep", exit: "log" });
    d = useEditor.getState().diagram;
    expect(d?.edges[1]?.label).toBe("start [ready]");
    const updated = d?.nodes.find((n) => n.id === first);
    expect(updated?.meta).toMatchObject({
      entry: "beep",
      exit: "log",
      description: "entry / beep\nexit / log",
    });
    expect(updated?.height).toBeGreaterThan(56);
  });

  it("draws self-transitions as loops", () => {
    const start = useEditor.getState().diagram?.nodes[0]?.id ?? "";
    addNextState(start);
    const id = useEditor.getState().selection.nodeIds[0] ?? "";
    addSelfTransition(id);
    const d = useEditor.getState().diagram;
    const node = d?.nodes.find((n) => n.id === id);
    const loop = d?.edges.find((e) => e.source === id && e.target === id);
    if (!node || !loop) throw new Error("no loop");
    const points = edgePoints(loop, node, node);
    expect(points).toHaveLength(5);
    expect(Math.min(...points.map((p) => p.y))).toBeLessThan(node.y);
  });
});
