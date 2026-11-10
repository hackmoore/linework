import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { useEditor } from "../editor/store";
import { diagramToMermaid } from "../mermaid/mermaid";
import { importText } from "../share/importText";
import { parseSimpleSpec } from "../share/simpleSpec";
import { buildTemplate } from "../templates/build";
import { addPeer, addReport, setManager } from "./OrgPanel";
import {
  createPersonNode,
  isPerson,
  orgDirection,
  orgIssues,
  orgToCsv,
  orgTree,
  reportingLine,
} from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

const byName = (d: Diagram, name: string): Diagram["nodes"][number] => {
  const node = d.nodes.find((n) => n.label === name);
  if (!node) throw new Error(`no ${name}`);
  return node;
};

describe("org charts", () => {
  it("lays the template out as a tree, managers above their reports", () => {
    const d = valid(buildTemplate("org-chart"));
    expect(d.chartType).toBe("org");
    expect(orgIssues(d)).toEqual([]);
    expect(orgDirection(d)).toBe("TB");
    const tree = orgTree(d);
    expect(tree.roots).toHaveLength(1);
    for (const [child, parent] of tree.parent) {
      const c = d.nodes.find((n) => n.id === child);
      const p = d.nodes.find((n) => n.id === parent);
      expect((c?.y ?? 0) > (p?.y ?? 0) + (p?.height ?? 0)).toBe(true);
    }
    // No two cards overlap.
    const people = d.nodes.filter(isPerson);
    for (const a of people)
      for (const b of people)
        if (a !== b)
          expect(
            a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
          ).toBe(true);
    // Departments get their own colours.
    expect(byName(d, "Tom Okafor").stroke).toBe(byName(d, "Noah Kim").stroke);
    expect(byName(d, "Tom Okafor").stroke).not.toBe(byName(d, "Lena Fischer").stroke);
  });

  it("imports and exports CSV", () => {
    const csv = [
      "Name,Job title,Reports to,Team",
      "Ada,CEO,,Leadership",
      "Bo,CTO,Ada,Engineering",
      'Cy,"Engineer, backend",Bo,Engineering',
    ].join("\n");
    const result = importText(csv, "people.csv");
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.chartType).toBe("org");
    expect(byName(d, "Cy").meta).toMatchObject({ subtitle: "Engineer, backend", department: "Engineering" });
    expect(orgTree(d).parent.get(byName(d, "Cy").id)).toBe(byName(d, "Bo").id);
    const out = orgToCsv(d);
    expect(out).toContain('Cy,"Engineer, backend",Engineering,,Bo');
    const back = importText(out, "again.csv");
    if (!back.ok) throw new Error(back.error);
    expect(back.diagram.nodes).toHaveLength(3);
    expect(diagramToMermaid(d)).toMatch(/^flowchart TD\n {2}p1\["Ada<br>CEO"\]/);
  });

  it("builds from the simple spec, rejecting unknown managers", () => {
    const ok = parseSimpleSpec({
      type: "org",
      direction: "LR",
      people: [{ name: "Ada" }, { name: "Bo", manager: "Ada", vacant: true }],
    });
    if (!ok.ok) throw new Error(ok.error);
    expect(orgDirection(valid(ok.diagram))).toBe("LR");
    expect(byName(ok.diagram, "Bo").strokePattern).toBe("dashed");
    const bad = parseSimpleSpec({ type: "org", people: [{ name: "Bo", manager: "Zed" }] });
    expect(bad.ok).toBe(false);
  });

  it("flags people with two managers or none", () => {
    const a = createPersonNode({ name: "A" });
    const b = createPersonNode({ name: "B" });
    const c = createPersonNode({ name: "C" });
    const loner = createPersonNode({ name: "Loner" });
    const d = {
      ...buildTemplate("org-blank"),
      nodes: [a, b, c, loner],
      edges: [reportingLine(a.id, c.id), reportingLine(b.id, c.id)],
    };
    const messages = orgIssues(d).map((i) => i.message);
    expect(messages).toContain("C reports to 2 people");
    expect(messages).toContain("Loner doesn't report to anyone");
  });
});

describe("editing org charts", () => {
  beforeEach(() => {
    useEditor.getState().load(buildTemplate("org-chart"));
  });

  it("adds reports with Tab and peers with Enter, keeping the tree tidy", () => {
    const d = useEditor.getState().diagram;
    if (!d) throw new Error("no diagram");
    const cto = byName(d, "Tom Okafor").id;
    expect(addReport(cto)).toBe(true);
    const report = useEditor.getState().selection.nodeIds[0] ?? "";
    expect(addPeer(report)).toBe(true);
    const after = useEditor.getState().diagram;
    if (!after) throw new Error("no diagram");
    valid(after);
    const tree = orgTree(after);
    expect(tree.parent.get(report)).toBe(cto);
    expect(tree.parent.get(useEditor.getState().selection.nodeIds[0] ?? "")).toBe(cto);
    expect(after.nodes.find((n) => n.id === report)?.meta?.department).toBe("Engineering");
  });

  it("moves a person and their team to a new manager", () => {
    const d = useEditor.getState().diagram;
    if (!d) throw new Error("no diagram");
    const platform = byName(d, "Arjun Mehta").id;
    const ops = byName(d, "Sam Rivera").id;
    setManager(platform, ops);
    const after = useEditor.getState().diagram;
    if (!after) throw new Error("no diagram");
    const tree = orgTree(after);
    expect(tree.parent.get(platform)).toBe(ops);
    expect(tree.parent.get(byName(after, "Noah Kim").id)).toBe(platform);
    expect(orgIssues(after)).toEqual([]);
  });
});
