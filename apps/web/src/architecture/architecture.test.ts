import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToSvg } from "../export/exporters";
import { diagramToMermaid } from "../mermaid/mermaid";
import { importText } from "../share/importText";
import { parseSimpleSpec } from "../share/simpleSpec";
import { buildTemplate } from "../templates/build";
import { addElement, updateElements } from "./ArchitecturePanel";
import { architectureIssues, c4KindOf, c4Level, elementOf } from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

const inside = (inner: Diagram["nodes"][number], outer: Diagram["nodes"][number]): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe("architecture diagrams", () => {
  it("builds the template as a C4 container diagram with its boundary around its containers", () => {
    const d = valid(buildTemplate("architecture"));
    expect(d.chartType).toBe("architecture");
    expect(c4Level(d)).toBe("container");
    const boundary = d.nodes.find((n) => c4KindOf(n) === "boundary");
    if (!boundary) throw new Error("no boundary");
    for (const node of d.nodes) {
      const e = elementOf(node);
      if (!e) continue;
      // Containers sit inside the system boundary; people and external systems stay outside.
      expect(inside(node, boundary)).toBe(e.type === "container" || e.type === "database");
    }
    expect(architectureIssues(d)).toEqual([]);
    const { svg } = diagramToSvg(d);
    expect(svg).toContain("[Container: React]");
    expect(svg).toContain("[JSON/HTTPS]");
    valid(buildTemplate("architecture-blank"));
  });

  it("exports Mermaid C4 with boundaries and relationships", () => {
    const mermaid = diagramToMermaid(buildTemplate("architecture"));
    expect(mermaid).toMatch(/^C4Container\n/);
    expect(mermaid).toMatch(/System_Boundary\(b\d+, "Online shop"\) \{\n {2}Container\(/);
    expect(mermaid).toContain("ContainerDb(");
    expect(mermaid).toContain("System_Ext(");
    expect(mermaid).toMatch(/Rel\(e\d+, e\d+, "Calls", "JSON\/HTTPS"\)/);
  });

  it("builds from the simple spec and reports problems", () => {
    const result = parseSimpleSpec({
      type: "architecture",
      elements: [
        { id: "u", name: "User", type: "person" },
        { id: "s", name: "Billing", type: "system", external: true, description: "Bills people" },
        { id: "lonely", type: "component" },
      ],
      relationships: [{ from: "u", to: "s", label: "" }],
    });
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(c4Level(d)).toBe("component");
    const messages = architectureIssues(d).map((i) => i.message);
    expect(messages).toContain("User has no description");
    expect(messages).toContain("lonely has no technology");
    expect(messages).toContain("lonely isn't connected to anything");
    expect(messages).toContain("User → Billing has no label");
    expect(importText(JSON.stringify({ type: "architecture", elements: [] })).ok).toBe(false);
  });
});

describe("editing architecture diagrams", () => {
  beforeEach(() => {
    useEditor.getState().load(createDiagram("A", "professional", "architecture"));
  });

  it("adds elements and restyles them when their type changes", () => {
    addElement("container", { x: 0, y: 0 });
    const id = useEditor.getState().selection.nodeIds[0] ?? "";
    updateElements([id], { technology: "Go", description: "Does work" });
    let node = useEditor.getState().diagram?.nodes.find((n) => n.id === id);
    expect(node?.meta).toMatchObject({ c4: "container", technology: "Go", subtitle: "[Container: Go]" });
    updateElements([id], { type: "database" });
    node = useEditor.getState().diagram?.nodes.find((n) => n.id === id);
    expect(node?.kind).toBe("cylinder");
    expect(node?.meta?.subtitle).toBe("[Database: Go]");
    updateElements([id], { type: "system", external: true });
    node = useEditor.getState().diagram?.nodes.find((n) => n.id === id);
    expect(node?.meta?.subtitle).toBe("[External system]");
    expect(node?.meta?.technology).toBeUndefined();
    expect(node?.fill).toBe("#8a8a8a");
    const d = useEditor.getState().diagram;
    if (d) valid(d);
  });

  it("connects elements with labelled relationships", () => {
    addElement("person", { x: 0, y: 0 });
    const a = useEditor.getState().selection.nodeIds[0] ?? "";
    addElement("system", { x: 400, y: 0 });
    const b = useEditor.getState().selection.nodeIds[0] ?? "";
    const edgeId = useEditor.getState().connect(a, b);
    const edge = useEditor.getState().diagram?.edges.find((e) => e.id === edgeId);
    expect(edge).toMatchObject({ label: "Uses", arrowEnd: "arrow" });
  });
});
