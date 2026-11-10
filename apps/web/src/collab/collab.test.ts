import { describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { createGanttData, createSection, createTask, finishToStart } from "../gantt/model";
import { importRoomKey, liveLink, newRoomSecret, open, parseRoomSecret, seal } from "./crypto";
import { applyPatch, diffDiagrams } from "./patch";

function base(): Diagram {
  const a = createNode("rectangle", 0, 0, { label: "A" });
  const b = createNode("rectangle", 200, 0, { label: "B" });
  return { ...createDiagram("Doc"), nodes: [a, b], edges: [createEdge(a.id, b.id)] };
}

describe("patches", () => {
  it("returns null when nothing changed", () => {
    const d = base();
    expect(diffDiagrams(d, d)).toBeNull();
    expect(diffDiagrams(d, { ...d })).toBeNull();
  });

  it("merges concurrent edits to different shapes", () => {
    const original = base();
    const [a, b] = original.nodes;
    if (!a || !b) throw new Error("setup");
    const mine = { ...original, nodes: [{ ...a, label: "Mine" }, b] };
    const theirs = { ...original, nodes: [a, { ...b, x: 999 }] };
    const patch = diffDiagrams(original, theirs);
    if (!patch) throw new Error("expected a patch");
    const merged = applyPatch(mine, patch);
    expect(merged.nodes.map((n) => [n.label, n.x])).toEqual([
      ["Mine", a.x],
      ["B", 999],
    ]);
  });

  it("sends order only when it changes and keeps z-order", () => {
    const original = base();
    const [a, b] = original.nodes;
    if (!a || !b) throw new Error("setup");
    const reordered = { ...original, nodes: [b, a] };
    const patch = diffDiagrams(original, reordered);
    expect(patch?.collections.nodes?.order).toEqual([b.id, a.id]);
    expect(applyPatch(original, patch ?? { set: {}, collections: {} }).nodes.map((n) => n.id)).toEqual([
      b.id,
      a.id,
    ]);
    const moved = diffDiagrams(original, { ...original, nodes: [{ ...a, x: 5 }, b] });
    expect(moved?.collections.nodes?.order).toBeUndefined();
  });

  it("repairs dangling references after a concurrent delete", () => {
    const original = base();
    const [a] = original.nodes;
    if (!a) throw new Error("setup");
    // They delete A; meanwhile we added a second edge to A.
    const theirs = { ...original, nodes: original.nodes.filter((n) => n.id !== a.id), edges: [] };
    const patch = diffDiagrams(original, theirs);
    const ours = { ...original, edges: [...original.edges, createEdge(original.nodes[1]?.id ?? "", a.id)] };
    const merged = applyPatch(ours, patch ?? { set: {}, collections: {} });
    expect(merged.edges).toEqual([]);
    expect(parseDiagram(merged).ok).toBe(true);
  });

  it("drops dependency cycles created by concurrent edits", () => {
    const s = createSection("S", 0);
    const t1 = createTask("task", "One", "2026-03-02", 2, s.id);
    const t2 = createTask("task", "Two", "2026-03-05", 2, s.id);
    const doc: Diagram = {
      ...createDiagram("Plan", "professional", "gantt"),
      gantt: createGanttData([s], [t1, t2]),
    };
    const mine = {
      ...doc,
      gantt: { ...createGanttData([s], [t1, { ...t2, dependencies: [finishToStart(t1.id)] }]) },
    };
    const theirs = {
      ...doc,
      gantt: { ...createGanttData([s], [{ ...t1, dependencies: [finishToStart(t2.id)] }, t2]) },
    };
    const merged = applyPatch(mine, diffDiagrams(doc, theirs) ?? { set: {}, collections: {} });
    const total = merged.gantt?.tasks.reduce((n, t) => n + t.dependencies.length, 0);
    expect(total).toBe(1);
    expect(parseDiagram(merged).ok).toBe(true);
  });

  it("carries scalar and gantt setting changes", () => {
    const doc: Diagram = { ...createDiagram("Plan", "professional", "gantt"), gantt: createGanttData() };
    const next = { ...doc, title: "Renamed", gantt: { ...createGanttData(), scale: "week" as const } };
    const merged = applyPatch(doc, diffDiagrams(doc, next) ?? { set: {}, collections: {} });
    expect(merged.title).toBe("Renamed");
    expect(merged.gantt?.scale).toBe("week");
  });
});

describe("room encryption", () => {
  it("round-trips messages and rejects other keys", async () => {
    const secret = newRoomSecret();
    const key = await importRoomKey(secret.key);
    const frame = await seal(key, { t: "hello", client: "x" });
    expect(await open(key, frame)).toEqual({ t: "hello", client: "x" });
    const other = await importRoomKey(newRoomSecret().key);
    expect(await open(other, frame)).toBeNull();
    const tampered = frame.slice();
    tampered[20] = (tampered[20] ?? 0) ^ 1;
    expect(await open(key, tampered)).toBeNull();
  });

  it("puts the key only in the link fragment", () => {
    const secret = newRoomSecret();
    const link = new URL(liveLink("https://linework.example", secret));
    expect(link.search).toBe("");
    expect(link.pathname).toBe("/live");
    expect(parseRoomSecret(link.hash)).toEqual(secret);
    expect(parseRoomSecret("#room=short&key=x")).toBeNull();
  });
});
