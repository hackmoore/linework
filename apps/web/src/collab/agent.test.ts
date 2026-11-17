import { describe, expect, it } from "vitest";
import type { Diagram } from "@linework/shared";
import { buildCommand, parseAgentLink } from "../agent/cli";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { createFlowchartData } from "../flowchart/model";
import { createGanttData, createTask } from "../gantt/model";
import { createKanbanData } from "../kanban/model";
import { runAgentCommand } from "./agent";

function flowchart(): Diagram {
  const a = createNode("rectangle", 0, 0, { id: "a", label: "Start" });
  const b = createNode("rectangle", 200, 0, { id: "b", label: "End" });
  return { ...createDiagram("Doc"), nodes: [a, b], edges: [createEdge("a", "b", { id: "ab" })] };
}

function edited(d: Diagram, command: unknown): Diagram {
  const outcome = runAgentCommand(d, command);
  if (!outcome.ok) throw new Error(outcome.error);
  if (!outcome.next) throw new Error("no change");
  return outcome.next;
}

describe("agent commands", () => {
  it("returns the chart for get without changing it", () => {
    const d = flowchart();
    const outcome = runAgentCommand(d, { op: "get" });
    expect(outcome).toMatchObject({ ok: true, next: null, reply: { chart: d } });
  });

  it("merges partial fields into existing items", () => {
    const next = edited(flowchart(), { op: "edit", upsert: { nodes: [{ id: "a", label: "Begin" }] } });
    const a = next.nodes.find((n) => n.id === "a");
    expect(a?.label).toBe("Begin");
    expect(a?.width).toBeGreaterThan(0);
  });

  it("adds new items with defaults, using the agent's ids", () => {
    const outcome = runAgentCommand(flowchart(), {
      op: "edit",
      upsert: {
        nodes: [{ id: "check", kind: "diamond", label: "OK?" }],
        edges: [{ source: "b", target: "check", label: "next" }],
      },
    });
    if (!outcome.ok || !outcome.next) throw new Error("edit failed");
    const check = outcome.next.nodes.find((n) => n.id === "check");
    expect(check?.kind).toBe("diamond");
    expect(check?.x).toBeGreaterThan(200);
    expect(
      outcome.next.edges.some((e) => e.source === "b" && e.target === "check" && e.label === "next"),
    ).toBe(true);
    expect(outcome.touched).toContain("check");
  });

  it("removes items and the connectors that hung off them", () => {
    const next = edited(flowchart(), { op: "edit", remove: { nodes: ["b"] } });
    expect(next.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(next.edges).toEqual([]);
  });

  it("sets scalars and rejects unknown keys and collections", () => {
    expect(edited(flowchart(), { op: "edit", set: { title: "Renamed" } }).title).toBe("Renamed");
    expect(runAgentCommand(flowchart(), { op: "edit", set: { id: "x" } })).toMatchObject({ ok: false });
    expect(runAgentCommand(flowchart(), { op: "edit", upsert: { shapes: [] } })).toMatchObject({ ok: false });
  });

  it("sets and clears where connector ends attach", () => {
    const anchored = edited(flowchart(), {
      op: "edit",
      upsert: { edges: [{ id: "ab", sourceAnchor: "bottom-end" }] },
    });
    expect(anchored.edges[0]?.sourceAnchor).toBe("bottom-end");
    const cleared = edited(anchored, { op: "edit", upsert: { edges: [{ id: "ab", sourceAnchor: null }] } });
    expect(cleared.edges[0]).not.toHaveProperty("sourceAnchor");
    expect(
      runAgentCommand(flowchart(), { op: "edit", upsert: { edges: [{ id: "ab", sourceAnchor: "middle" }] } })
        .ok,
    ).toBe(false);
  });

  it("refuses edits that would make the chart invalid", () => {
    const outcome = runAgentCommand(flowchart(), {
      op: "edit",
      upsert: { nodes: [{ id: "a", width: "wide" }] },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/invalid/);
  });

  it("adds gantt tasks and reschedules dependants", () => {
    const build = createTask("task", "Build", "2026-03-02", 5, null, { id: "build" });
    const d: Diagram = {
      ...createDiagram("Plan", "professional", "gantt"),
      gantt: createGanttData([], [build]),
    };
    const next = edited(d, {
      op: "edit",
      upsert: {
        "gantt.tasks": [
          {
            id: "qa",
            name: "QA",
            start: "2026-01-01",
            dependencies: [{ taskId: "build", type: "FS", lag: 0 }],
          },
        ],
      },
    });
    const qa = next.gantt?.tasks.find((t) => t.id === "qa");
    expect(qa?.start).toBe("2026-03-07");
  });

  it("adds kanban cards to the first column by default", () => {
    const d: Diagram = { ...createDiagram("Board", "professional", "kanban"), kanban: createKanbanData() };
    const next = edited(d, { op: "edit", upsert: { "kanban.cards": [{ title: "Fix login" }] } });
    const card = next.kanban?.cards.find((c) => c.title === "Fix login");
    expect(card?.columnId).toBe(d.kanban?.columns[0]?.id);
  });

  it("replaces the chart from Mermaid but keeps the document's identity", () => {
    const d = flowchart();
    const next = edited(d, { op: "replace", text: "flowchart LR\n  A --> B --> C" });
    expect(next.id).toBe(d.id);
    expect(next.chartType).toBe("flowchart");
    expect(next.nodes).toHaveLength(3);
  });

  it("reports the chart's Checks warnings so the agent can fix them", () => {
    const d: Diagram = { ...flowchart(), chartType: "flowchart", flowchart: createFlowchartData() };
    const outcome = runAgentCommand(d, {
      op: "edit",
      upsert: { nodes: [{ id: "q", kind: "diamond", label: "OK?" }], edges: [{ source: "b", target: "q" }] },
    });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.reply.issues).toEqual(expect.arrayContaining([expect.stringMatching(/OK\?/)]));
  });

  it("explains unknown ops", () => {
    expect(runAgentCommand(flowchart(), { op: "draw" })).toMatchObject({ ok: false });
    expect(runAgentCommand(flowchart(), null)).toMatchObject({ ok: false });
  });
});

describe("agent client", () => {
  it("reads live links and works out the relay address", () => {
    const key = "abcdefghijklmnopqrstuv";
    expect(parseAgentLink(`https://lw.example/live#room=room_abcdefghijklmnop&key=${key}`)).toEqual({
      roomId: "room_abcdefghijklmnop",
      key,
      relay: "wss://lw.example/api/rooms/room_abcdefghijklmnop",
    });
    const relay = encodeURIComponent("wss://relay.example/api/rooms/room_abcdefghijklmnop");
    expect(
      parseAgentLink(`http://localhost:5173/live#room=room_abcdefghijklmnop&key=${key}&relay=${relay}`)
        ?.relay,
    ).toBe("wss://relay.example/api/rooms/room_abcdefghijklmnop");
    expect(parseAgentLink("https://lw.example/live#room=short&key=x")).toBeNull();
    expect(parseAgentLink("not a link")).toBeNull();
  });

  it("turns arguments into commands or usage errors", () => {
    expect(buildCommand("get", undefined)).toEqual({ op: "get" });
    expect(buildCommand("edit", '{"set":{"title":"T"}}')).toEqual({ op: "edit", set: { title: "T" } });
    expect(buildCommand("edit", "{nope")).toMatch(/malformed/);
    expect(buildCommand("tidy", "XY")).toMatch(/TB or LR/);
    expect(buildCommand("dance", undefined)).toMatch(/Unknown command/);
  });
});
