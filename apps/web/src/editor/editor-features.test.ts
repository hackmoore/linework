import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { searchIcons } from "../library/icons";
import { visibleNodesInOrder } from "../render/DiagramSvg";
import { alignBoxes, distributeBoxes, layeredLayout, snapToGuides } from "./arrange";
import { insertSnippet, parseSnippet } from "./clipboard";
import { addLayer, deleteLayer, moveSelectionToLayer, updateLayer } from "./layers";
import { useEditor } from "./store";
import { applyTheme, THEMES } from "./themes";

function diagram(): Diagram {
  const d = useEditor.getState().diagram;
  if (!d) throw new Error("No diagram");
  return d;
}

beforeEach(() => {
  useEditor.getState().load(createDiagram("Test"));
});

describe("align and distribute", () => {
  const a = { id: "a", x: 0, y: 0, width: 100, height: 40 };
  const b = { id: "b", x: 200, y: 50, width: 50, height: 20 };
  const c = { id: "c", x: 500, y: 10, width: 100, height: 30 };

  it("aligns to the shared bounds", () => {
    expect(alignBoxes([a, b], "right").get("a")).toEqual({ x: 150, y: 0 });
    expect(alignBoxes([a, b], "middle").get("b")).toEqual({ x: 200, y: 25 });
    expect(alignBoxes([a], "left").size).toBe(0);
  });

  it("evens out gaps, keeping the ends in place", () => {
    const out = distributeBoxes([c, a, b], "horizontal");
    expect(out.get("a")?.x).toBe(0);
    expect(out.get("c")?.x).toBe(500);
    // Span 600, occupied 250, two gaps of 175.
    expect(out.get("b")?.x).toBe(275);
  });
});

describe("smart guides", () => {
  it("snaps to a nearby edge and reports the guide", () => {
    const result = snapToGuides(
      { x: 103, y: 300, width: 50, height: 50 },
      [{ x: 100, y: 0, width: 80, height: 40 }],
      6,
    );
    expect(result.dx).toBe(-3);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([{ axis: "x", at: 100, from: 0, to: 350 }]);
  });

  it("ignores far-away shapes", () => {
    expect(
      snapToGuides({ x: 0, y: 0, width: 10, height: 10 }, [{ x: 500, y: 500, width: 10, height: 10 }], 6)
        .guides,
    ).toEqual([]);
  });
});

describe("layered layout", () => {
  it("puts each node below its predecessors and keeps ranks apart", () => {
    const n1 = createNode("rectangle", 0, 0);
    const n2 = createNode("rectangle", 500, 500);
    const n3 = createNode("rectangle", -300, 200);
    const pos = layeredLayout([n1, n2, n3], [createEdge(n1.id, n2.id), createEdge(n2.id, n3.id)], "TB");
    const y = (id: string): number => pos.get(id)?.y ?? NaN;
    expect(y(n1.id)).toBeLessThan(y(n2.id));
    expect(y(n2.id)).toBeLessThan(y(n3.id));
    expect(y(n2.id) - y(n1.id)).toBeGreaterThanOrEqual(n1.height + 80);
  });

  it("survives cycles", () => {
    const a = createNode("rectangle", 0, 0);
    const b = createNode("rectangle", 0, 0);
    const pos = layeredLayout([a, b], [createEdge(a.id, b.id), createEdge(b.id, a.id)], "LR");
    expect(pos.size).toBe(2);
  });
});

describe("clipboard", () => {
  it("parses only Linework payloads", () => {
    expect(parseSnippet("hello")).toBeNull();
    expect(parseSnippet(JSON.stringify({ type: "other", nodes: [], edges: [] }))).toBeNull();
    const node = createNode("rectangle", 0, 0);
    expect(
      parseSnippet(JSON.stringify({ type: "linework/shapes", nodes: [node], edges: [] }))?.nodes,
    ).toHaveLength(1);
  });

  it("pastes copies with new ids and their connectors", () => {
    const a = createNode("rectangle", 0, 0);
    const b = createNode("rectangle", 300, 0);
    insertSnippet({ nodes: [a, b], edges: [createEdge(a.id, b.id)] }, { x: 1000, y: 1000 });
    const d = diagram();
    expect(d.nodes).toHaveLength(2);
    expect(d.nodes.map((n) => n.id)).not.toContain(a.id);
    expect(d.edges[0]?.source).toBe(d.nodes[0]?.id);
    expect(parseDiagram(d).ok).toBe(true);
  });
});

describe("layers", () => {
  it("adds shapes to the active layer and hides them with it", () => {
    const layer = addLayer();
    const id = useEditor.getState().addNode("rectangle", 0, 0);
    expect(diagram().nodes[0]?.layerId).toBe(layer);
    updateLayer(layer, { visible: false });
    expect(visibleNodesInOrder(diagram())).toHaveLength(0);
    // Hidden shapes drop out of the selection.
    expect(useEditor.getState().selection.nodeIds).not.toContain(id);
  });

  it("draws higher layers on top regardless of document order", () => {
    const bottom = diagram().layers[0]?.id ?? "";
    const top = addLayer();
    const first = useEditor.getState().addNode("rectangle", 0, 0);
    useEditor.getState().setActiveLayer(bottom);
    const second = useEditor.getState().addNode("rectangle", 0, 0);
    expect(visibleNodesInOrder(diagram()).map((n) => n.id)).toEqual([second, first]);
    expect(diagram().nodes.find((n) => n.id === first)?.layerId).toBe(top);
  });

  it("doesn't select shapes on locked layers", () => {
    const id = useEditor.getState().addNode("rectangle", 0, 0);
    updateLayer(diagram().layers[0]?.id ?? "", { locked: true });
    useEditor.getState().selectAll();
    expect(useEditor.getState().selection.nodeIds).not.toContain(id);
  });

  it("moves shapes between layers and deletes layers with their shapes", () => {
    const base = diagram().layers[0]?.id ?? "";
    const a = useEditor.getState().addNode("rectangle", 0, 0);
    const b = useEditor.getState().addNode("rectangle", 200, 0);
    useEditor.getState().connect(a, b);
    const extra = addLayer();
    useEditor.getState().select({ nodeIds: [b] });
    moveSelectionToLayer(extra);
    deleteLayer(extra);
    expect(diagram().nodes.map((n) => n.id)).toEqual([a]);
    expect(diagram().edges).toHaveLength(0);
    deleteLayer(base);
    expect(diagram().layers).toHaveLength(1);
    expect(parseDiagram(diagram()).ok).toBe(true);
  });
});

describe("themes", () => {
  it("recolours strokes, text and fills while keeping colour coding", () => {
    const d = {
      ...createDiagram("T"),
      nodes: [
        createNode("rectangle", 0, 0, { fill: "#e8f0fe" }),
        createNode("rectangle", 0, 0, { fill: "#e6f4ea" }),
        createNode("rectangle", 0, 0),
      ],
    };
    const dark = THEMES.find((t) => t.id === "dark");
    if (!dark) throw new Error("missing theme");
    const themed = applyTheme(d, dark);
    expect(themed.background).toBe(dark.background);
    expect(themed.nodes.map((n) => n.fill)).toEqual([dark.fills[1], dark.fills[2], "transparent"]);
    expect(themed.nodes.every((n) => n.stroke === dark.stroke)).toBe(true);
    // Round trip back to light restores the palette.
    const light = THEMES.find((t) => t.id === "light");
    if (!light) throw new Error("missing theme");
    expect(applyTheme(themed, light).nodes[0]?.fill).toBe("#e8f0fe");
  });
});

describe("icon search", () => {
  it("matches names, keywords and categories", () => {
    expect(searchIcons("database").map((i) => i.id)).toContain("database");
    expect(searchIcons("serverless").map((i) => i.id)).toContain("function");
    expect(searchIcons("zzzz")).toEqual([]);
  });
});
