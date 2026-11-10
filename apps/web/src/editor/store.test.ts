import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "./store";

const state = (): ReturnType<typeof useEditor.getState> => useEditor.getState();

function diagram(): NonNullable<ReturnType<typeof state>["diagram"]> {
  const d = state().diagram;
  if (!d) throw new Error("No diagram loaded");
  return d;
}

beforeEach(() => {
  state().load(createDiagram("Test"));
});

describe("editor store", () => {
  it("adds and selects nodes, with undo and redo", () => {
    const id = state().addNode("rectangle", 100, 100);
    expect(diagram().nodes.map((n) => n.id)).toEqual([id]);
    expect(state().selection.nodeIds).toEqual([id]);

    state().undo();
    expect(diagram().nodes).toHaveLength(0);
    expect(state().selection.nodeIds).toEqual([]);

    state().redo();
    expect(diagram().nodes).toHaveLength(1);
  });

  it("refuses self-connections and unknown nodes", () => {
    const a = state().addNode("rectangle", 0, 0);
    expect(state().connect(a, a)).toBeNull();
    expect(state().connect(a, "nope")).toBeNull();
    expect(diagram().edges).toHaveLength(0);
  });

  it("deletes edges attached to deleted nodes so the document stays valid", () => {
    const a = state().addNode("rectangle", 0, 0);
    const b = state().addNode("ellipse", 300, 0);
    state().connect(a, b);
    state().select({ nodeIds: [a] });
    state().deleteSelection();
    expect(diagram().edges).toHaveLength(0);
    expect(parseDiagram(diagram()).ok).toBe(true);
  });

  it("duplicates nodes with their internal edges", () => {
    const a = state().addNode("rectangle", 0, 0);
    const b = state().addNode("rectangle", 300, 0);
    state().connect(a, b);
    state().select({ nodeIds: [a, b] });
    state().duplicateSelection();
    expect(diagram().nodes).toHaveLength(4);
    expect(diagram().edges).toHaveLength(2);
    expect(state().selection.nodeIds).toHaveLength(2);
    expect(state().selection.nodeIds).not.toContain(a);
    expect(parseDiagram(diagram()).ok).toBe(true);
  });

  it("records a drag as a single undo step", () => {
    const id = state().addNode("rectangle", 100, 100);
    const startX = diagram().nodes[0]?.x;
    state().checkpoint();
    for (let i = 1; i <= 5; i++) {
      state().transient((d) => ({ ...d, nodes: d.nodes.map((n) => ({ ...n, x: n.x + 10 })) }));
    }
    expect(diagram().nodes[0]?.x).toBe((startX ?? 0) + 50);
    state().undo();
    expect(diagram().nodes.find((n) => n.id === id)?.x).toBe(startX);
  });

  it("selects nodes intersecting a marquee", () => {
    const a = state().addNode("rectangle", 0, 0);
    state().addNode("rectangle", 1000, 1000);
    state().selectInRect({ x: -10, y: -10, width: 20, height: 20 }, false);
    expect(state().selection.nodeIds).toEqual([a]);
  });

  it("reorders the selection", () => {
    const a = state().addNode("rectangle", 0, 0);
    const b = state().addNode("rectangle", 10, 10);
    state().select({ nodeIds: [a] });
    state().reorderSelection("front");
    expect(diagram().nodes.map((n) => n.id)).toEqual([b, a]);
  });

  it("ignores no-op title changes", () => {
    const before = state().past.length;
    state().setTitle("Test");
    expect(state().past.length).toBe(before);
    state().setTitle("Renamed");
    expect(diagram().title).toBe("Renamed");
    expect(state().past.length).toBe(before + 1);
  });
});
