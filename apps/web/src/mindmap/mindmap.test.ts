import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { useEditor } from "../editor/store";
import { diagramToMermaid } from "../mermaid/mermaid";
import { importText } from "../share/importText";
import { parseSimpleSpec } from "../share/simpleSpec";
import { buildTemplate } from "../templates/build";
import { addChild, addSibling, currentLayout, deleteBranch, layoutMindmap } from "./MindmapPanel";
import { depths, isTopic, mindmapIssues, mindmapToOutline, mindmapTree, parseOutline, rootOf } from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

const overlaps = (d: Diagram): boolean => {
  const topics = d.nodes.filter(isTopic);
  return topics.some((a) =>
    topics.some(
      (b) =>
        a !== b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height,
    ),
  );
};

describe("mind maps", () => {
  it("lays the template out on both sides without overlaps", () => {
    const d = valid(buildTemplate("mindmap"));
    const root = rootOf(d);
    if (!root) throw new Error("no root");
    expect(d.chartType).toBe("mindmap");
    expect(overlaps(d)).toBe(false);
    const branches = mindmapTree(d).children.get(root.id) ?? [];
    expect(branches).toHaveLength(6);
    const sides = branches.map((id) => (d.nodes.find((n) => n.id === id)?.x ?? 0) < root.x);
    expect(sides.filter(Boolean)).toHaveLength(3);
    expect(currentLayout(d)).toBe("balanced");
    // Lines are curved, coloured like their branch.
    const edge = d.edges.find((e) => e.target === branches[0]);
    expect(edge).toMatchObject({ routing: "curved", arrowEnd: "none", strokeWidth: 4 });
    expect(mindmapIssues(d)).toEqual([]);
    expect(rootOf(valid(buildTemplate("mindmap-blank")))?.label).toBe("Central topic");
  });

  it("imports Markdown outlines and Mermaid mind maps, and exports outlines", () => {
    const md = "# Trip\n\n- Travel\n  - Flights\n  - Trains\n- Food\n    - Street food\n- Budget\n";
    expect(parseOutline(md)).toEqual({
      root: "Trip",
      branches: [
        {
          text: "Travel",
          children: [
            { text: "Flights", children: [] },
            { text: "Trains", children: [] },
          ],
        },
        { text: "Food", children: [{ text: "Street food", children: [] }] },
        { text: "Budget", children: [] },
      ],
    });
    const result = importText(md, "trip.md");
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.chartType).toBe("mindmap");
    expect(mindmapToOutline(d)).toBe(
      "# Trip\n\n- Travel\n  - Flights\n  - Trains\n- Food\n  - Street food\n- Budget\n",
    );
    const mermaid = importText("mindmap\n  root((Trip))\n    Travel\n      Flights\n    [Food]\n");
    if (!mermaid.ok) throw new Error(mermaid.error);
    expect(mindmapToOutline(mermaid.diagram)).toBe("# Trip\n\n- Travel\n  - Flights\n- Food\n");
    expect(diagramToMermaid(d)).toBe(
      "mindmap\n  root((Trip))\n    Travel\n      Flights\n      Trains\n    Food\n      Street food\n    Budget\n",
    );
  });

  it("builds from the simple spec with colours and a one-sided layout", () => {
    const result = parseSimpleSpec({
      type: "mindmap",
      root: "Ideas",
      layout: "right",
      branches: [{ text: "A", color: "red", children: [{ text: "A1" }] }, { text: "B" }],
    });
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(currentLayout(d)).toBe("right");
    expect(d.nodes.find((n) => n.label === "A")?.fill).toBe("#b91c1c");
    expect(d.nodes.find((n) => n.label === "A1")?.stroke).toBe("#b91c1c");
  });
});

describe("editing mind maps", () => {
  beforeEach(() => {
    useEditor.getState().load(buildTemplate("mindmap"));
  });

  it("adds subtopics with Tab and siblings with Enter, ready to type", () => {
    const d = useEditor.getState().diagram;
    const audience = d?.nodes.find((n) => n.label === "Audience")?.id ?? "";
    expect(addChild(audience)).toBe(true);
    const child = useEditor.getState().selection.nodeIds[0] ?? "";
    expect(useEditor.getState().editingNodeId).toBe(child);
    expect(addSibling(child)).toBe(true);
    const after = useEditor.getState().diagram;
    if (!after) throw new Error("no diagram");
    valid(after);
    const tree = mindmapTree(after);
    expect(tree.parent.get(child)).toBe(audience);
    expect(tree.parent.get(useEditor.getState().selection.nodeIds[0] ?? "")).toBe(audience);
    expect(depths(after).get(child)).toBe(2);
    expect(overlaps(after)).toBe(false);
  });

  it("restyles topics as they are renamed and deletes whole branches", () => {
    const state = useEditor.getState();
    const d = state.diagram;
    const risks = d?.nodes.find((n) => n.label === "Risks");
    if (!risks) throw new Error("no risks");
    state.updateNodes([risks.id], { label: "Risks and things that could go wrong" });
    const renamed = useEditor.getState().diagram?.nodes.find((n) => n.id === risks.id);
    expect(renamed?.width).toBeGreaterThan(risks.width);
    const before = useEditor.getState().diagram?.nodes.length ?? 0;
    deleteBranch(risks.id);
    expect(useEditor.getState().diagram?.nodes.length).toBe(before - 3);
    layoutMindmap("right");
    const after = useEditor.getState().diagram;
    if (!after) throw new Error("no diagram");
    expect(currentLayout(after)).toBe("right");
    expect(overlaps(after)).toBe(false);
  });
});
