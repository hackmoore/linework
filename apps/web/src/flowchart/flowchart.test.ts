import { beforeEach, describe, expect, it } from "vitest";
import { itemCount, parseDiagram, type Diagram, type DiagramNode } from "@linework/shared";
import { applyPatch, diffDiagrams } from "../collab/patch";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToSvg } from "../export/exporters";
import { diagramToMermaid, parseMermaid } from "../mermaid/mermaid";
import { parseSimpleSpec } from "../share/simpleSpec";
import { edgePoints } from "../render/geometry";
import { buildTemplate } from "../templates/build";
import { addLane, addNextStep, deleteLane, moveLane, moveToLane, resizeLane, setDirection } from "./actions";
import { tidyFlowchart } from "./layout";
import { contentBounds, createFlowLane, flowIssues, laneBands, laneOf } from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

function lanesOf(d: Diagram): Map<string, string | null> {
  const data = d.flowchart;
  if (!data) throw new Error("not a flowchart");
  return new Map(d.nodes.map((n) => [n.label, laneOf(data, n)]));
}

const node = (d: Diagram, label: string): DiagramNode => {
  const found = d.nodes.find((n) => n.label === label);
  if (!found) throw new Error(`no ${label}`);
  return found;
};

/** start -> a -> decide -> (yes) b -> end, (no) c -> end */
function sample(): Diagram {
  const start = createNode("terminal", 0, 0, { label: "Start" });
  const a = createNode("rectangle", 0, 0, { label: "A" });
  const decide = createNode("diamond", 0, 0, { label: "Ok?" });
  const b = createNode("rectangle", 0, 0, { label: "B" });
  const c = createNode("rectangle", 0, 0, { label: "C" });
  const end = createNode("terminal", 0, 0, { label: "End" });
  return {
    ...createDiagram("Flow", "professional", "flowchart"),
    nodes: [start, a, decide, b, c, end],
    edges: [
      createEdge(start.id, a.id),
      createEdge(a.id, decide.id),
      createEdge(decide.id, b.id, { label: "Yes" }),
      createEdge(decide.id, c.id, { label: "No" }),
      createEdge(b.id, end.id),
      createEdge(c.id, end.id),
    ],
  };
}

describe("flowchart documents", () => {
  it("validates and counts steps", () => {
    const d = valid(tidyFlowchart(sample()));
    expect(itemCount(d)).toBe(6);
    expect(parseDiagram({ ...d, flowchart: undefined }).ok).toBe(false);
    const lane = createFlowLane("A", 0);
    expect(parseDiagram({ ...d, flowchart: { ...d.flowchart, lanes: [lane, lane] } }).ok).toBe(false);
  });

  it("tidies along the direction, top to bottom or left to right", () => {
    const d = tidyFlowchart(sample());
    expect(node(d, "Start").y).toBeLessThan(node(d, "A").y);
    expect(node(d, "Ok?").y).toBeLessThan(node(d, "B").y);
    expect(node(d, "B").y).toBe(node(d, "C").y);
    const lr = setDirection(d, "LR");
    expect(lr.flowchart?.direction).toBe("LR");
    expect(node(lr, "Start").x).toBeLessThan(node(lr, "A").x);
    expect(node(lr, "B").x).toBe(node(lr, "C").x);
  });
});

describe("loops", () => {
  it("ranks steps in reading order when a branch loops back", () => {
    const d = sample();
    const c = node(d, "C");
    const a = node(d, "A");
    // "No" path goes back to A instead of on to the end.
    const looped = tidyFlowchart({
      ...d,
      edges: [...d.edges.filter((e) => !(e.source === c.id)), createEdge(c.id, a.id)],
    });
    expect(node(looped, "Start").y).toBeLessThan(node(looped, "A").y);
    expect(node(looped, "A").y).toBeLessThan(node(looped, "Ok?").y);
    expect(node(looped, "Ok?").y).toBeLessThan(node(looped, "C").y);
  });

  it("routes links that go back around the side", () => {
    const top = createNode("rectangle", 100, 50);
    const bottom = createNode("rectangle", 100, 300);
    const points = edgePoints({ routing: "elbow" }, bottom, top, "TB");
    expect(points).toHaveLength(4);
    expect(points.every((p) => p.x >= top.x + top.width)).toBe(true);
    // Without a flow direction the usual elbow is used.
    expect(edgePoints({ routing: "elbow" }, bottom, top)[0]?.x).toBe(100);
  });
});

describe("swimlanes", () => {
  it("keeps lanes when the direction changes", () => {
    let d = addLane(addLane(tidyFlowchart(sample())));
    const second = d.flowchart?.lanes[1]?.id ?? "";
    d = tidyFlowchart(moveToLane(d, [node(d, "C").id], second));
    const before = lanesOf(d);
    const lr = valid(setDirection(d, "LR"));
    expect(lanesOf(lr)).toEqual(before);
    expect(lanesOf(valid(setDirection(lr, "TB")))).toEqual(before);
  });

  it("sizes the first lane around existing steps", () => {
    const d = addLane(tidyFlowchart(sample()));
    const lane = d.flowchart?.lanes[0];
    expect(lane?.name).toBe("Lane 1");
    expect([...lanesOf(d).values()].every((id) => id === lane?.id)).toBe(true);
    const bounds = contentBounds(d);
    const band = laneBands(d)[0];
    expect(band && bounds && band.y <= bounds.y).toBe(true);
  });

  it("keeps steps in their lanes when tidying, and fits lanes to them", () => {
    let d = addLane(addLane(tidyFlowchart(sample())));
    const second = d.flowchart?.lanes[1]?.id ?? "";
    d = moveToLane(d, [node(d, "C").id, node(d, "End").id], second);
    d = valid(tidyFlowchart(d));
    const lanes = lanesOf(d);
    expect(lanes.get("C")).toBe(second);
    expect(lanes.get("End")).toBe(second);
    expect(lanes.get("B")).toBe(d.flowchart?.lanes[0]?.id);
    // Ranks still read top to bottom across lanes.
    expect(node(d, "Ok?").y).toBeLessThan(node(d, "C").y);
    expect(node(d, "C").y).toBeLessThan(node(d, "End").y);
  });

  it("resizes, reorders and deletes lanes without losing steps", () => {
    let d = addLane(addLane(tidyFlowchart(sample())));
    const [first, second] = d.flowchart?.lanes ?? [];
    if (!first || !second) throw new Error("lanes");
    d = tidyFlowchart(moveToLane(d, [node(d, "C").id], second.id));
    const before = lanesOf(d);

    const wider = resizeLane(d, first.id, (d.flowchart?.lanes[0]?.size ?? 0) + 100);
    expect(lanesOf(wider)).toEqual(before);
    expect(node(wider, "C").x).toBe(node(d, "C").x + 100);

    const swapped = moveLane(d, second.id, -1);
    expect(swapped.flowchart?.lanes.map((l) => l.id)).toEqual([second.id, first.id]);
    expect(lanesOf(swapped)).toEqual(before);

    const removed = valid(deleteLane(d, second.id));
    expect(removed.flowchart?.lanes).toHaveLength(1);
    expect(lanesOf(removed).get("C")).toBe(first.id);
  });
});

describe("building flowcharts", () => {
  beforeEach(() => {
    useEditor.getState().load(createDiagram("Flow", "professional", "flowchart"));
  });

  it("colours new steps and labels decision branches", () => {
    const state = useEditor.getState();
    const q = state.addNode("diamond", 0, 0);
    const yes = state.addNode("rectangle", 0, 200);
    const no = state.addNode("rectangle", 200, 200);
    state.connect(q, yes);
    state.connect(q, no);
    const d = useEditor.getState().diagram;
    expect(d?.nodes.find((n) => n.id === q)?.fill).toBe("#fff4e0");
    expect(d?.edges.map((e) => e.label)).toEqual(["Yes", "No"]);
    expect(d?.edges.every((e) => e.routing === "elbow")).toBe(true);
  });

  it("adds connected next steps beside existing branches", () => {
    const base = tidyFlowchart(sample());
    const q = node(base, "Ok?");
    const first = addNextStep(base, q.id, "rectangle");
    if (!first) throw new Error("no step");
    const added = first.diagram.nodes.find((n) => n.id === first.nodeId);
    expect(added && added.y > q.y + q.height).toBe(true);
    expect(first.diagram.edges.at(-1)?.source).toBe(q.id);
    // Two branches exist already, so the third is unlabelled and placed clear of them.
    expect(first.diagram.edges.at(-1)?.label).toBe("");
    const overlaps = first.diagram.nodes.filter(
      (n) =>
        added &&
        n.id !== added.id &&
        n.x < added.x + added.width &&
        n.x + n.width > added.x &&
        n.y < added.y + added.height &&
        n.y + n.height > added.y,
    );
    expect(overlaps).toHaveLength(0);
    const lr = addNextStep(setDirection(base, "LR"), q.id, "terminal");
    const end = lr?.diagram.nodes.find((n) => n.id === lr.nodeId);
    expect(end?.label).toBe("End");
    expect(end && end.x > node(setDirection(base, "LR"), "Ok?").x).toBe(true);
  });
});

describe("flowchart checks", () => {
  it("passes a complete flowchart", () => {
    expect(flowIssues(sample())).toEqual([]);
  });

  it("finds missing starts, unreachable steps, weak decisions and dead ends", () => {
    const d = sample();
    const noStart = {
      ...d,
      nodes: d.nodes.map((n) => (n.label === "Start" ? { ...n, kind: "rectangle" as const } : n)),
    };
    expect(flowIssues(noStart)[0]?.message).toMatch(/Add a Start/);

    const orphan = createNode("rectangle", 0, 0, { label: "Orphan" });
    const messages = flowIssues({ ...d, nodes: [...d.nodes, orphan] }).map((i) => i.message);
    expect(messages.some((m) => m.includes('"Orphan" can\'t be reached'))).toBe(true);
    expect(messages.some((m) => m.includes('"Orphan" has no next step'))).toBe(true);

    const unlabelled = { ...d, edges: d.edges.map((e) => (e.label === "No" ? { ...e, label: "" } : e)) };
    expect(flowIssues(unlabelled).map((i) => i.message)).toEqual([
      'Label every branch of decision "Ok?", such as Yes and No.',
    ]);
    const oneBranch = { ...d, edges: d.edges.filter((e) => e.label !== "No") };
    expect(flowIssues(oneBranch).some((i) => i.message.includes("needs at least two branches"))).toBe(true);
  });
});

describe("flowchart import and export", () => {
  it("turns Mermaid subgraphs that split every node into swimlanes", () => {
    const result = parseMermaid(`flowchart TD
      subgraph c [Customer]
        s([Start]) --> o[Order]
      end
      subgraph w [Warehouse]
        p[[Pack]] --> e([Done])
      end
      o --> p`);
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.flowchart?.lanes.map((l) => l.name)).toEqual(["Customer", "Warehouse"]);
    const lanes = lanesOf(d);
    expect(lanes.get("Order")).toBe(d.flowchart?.lanes[0]?.id);
    expect(lanes.get("Pack")).toBe(d.flowchart?.lanes[1]?.id);
    expect(node(d, "Pack").kind).toBe("subroutine");

    const text = diagramToMermaid(d);
    expect(text).toMatch(/^flowchart TD/);
    expect(text).toContain('subgraph lane2["Warehouse"]');
    expect(text).toContain('[["Pack"]]');
    const again = parseMermaid(text);
    expect(again.ok && again.diagram.flowchart?.lanes).toHaveLength(2);
  });

  it("keeps groups for nested or partial subgraphs", () => {
    const result = parseMermaid("flowchart LR\n  subgraph g [Group]\n    a --> b\n  end\n  b --> c");
    if (!result.ok) throw new Error(result.error);
    expect(result.diagram.flowchart?.lanes).toHaveLength(0);
    expect(result.diagram.nodes.some((n) => n.kind === "container")).toBe(true);
  });

  it("builds flowcharts with lanes from the simple spec", () => {
    const result = parseSimpleSpec({
      type: "flowchart",
      lanes: ["Team"],
      nodes: [
        { id: "s", label: "Start", shape: "start" },
        { id: "x", label: "Do it", lane: "Other" },
        { id: "e", label: "End", shape: "end", lane: "Team" },
      ],
      edges: [
        { from: "s", to: "x" },
        { from: "x", to: "e" },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.chartType).toBe("flowchart");
    expect(d.flowchart?.lanes.map((l) => l.name)).toEqual(["Team", "Other"]);
    expect(lanesOf(d).get("Do it")).toBe(d.flowchart?.lanes[1]?.id);
    expect(lanesOf(d).get("Start")).toBe(d.flowchart?.lanes[0]?.id);
    expect(node(d, "Start").kind).toBe("terminal");
    expect(node(d, "Do it").kind).toBe("rectangle");
  });

  it("exports lanes to SVG and builds the templates", () => {
    const approval = valid(buildTemplate("flowchart-approval"));
    expect(approval.flowchart?.lanes.map((l) => l.name)).toEqual(["Employee", "Manager", "Finance"]);
    const lanes = lanesOf(approval);
    expect(lanes.get("Submit expense claim")).toBe(approval.flowchart?.lanes[0]?.id);
    expect(lanes.get("Pay expenses")).toBe(approval.flowchart?.lanes[2]?.id);
    expect(flowIssues(approval)).toEqual([]);
    expect(flowIssues(buildTemplate("flowchart"))).toEqual([]);
    const { svg } = diagramToSvg(approval);
    expect(svg).toContain("Finance");
    expect(svg).toContain("Approved?");
  });
});

describe("flowchart collaboration", () => {
  it("syncs lanes and direction", () => {
    const original = addLane(tidyFlowchart(sample()));
    const theirs = setDirection(addLane(original), "LR");
    const patch = diffDiagrams(original, theirs);
    if (!patch) throw new Error("no patch");
    expect(patch.set["flowchart.direction"]).toBe("LR");
    const merged = valid(applyPatch(original, patch));
    expect(merged.flowchart?.lanes).toHaveLength(2);
    expect(merged.flowchart?.direction).toBe("LR");
  });
});
