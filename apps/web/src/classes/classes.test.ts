import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToMermaid } from "../mermaid/mermaid";
import { parseClass } from "../render/compartments";
import { importText } from "../share/importText";
import { buildTemplate } from "../templates/build";
import { addSubclass, setRelation, updateClass } from "./ClassPanel";
import {
  classesOf,
  classIssues,
  createClassNode,
  relationOf,
  relationship,
  relationStyle,
  RELATIONS,
} from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

const cls = (name: string, stereotype = ""): ReturnType<typeof createClassNode> =>
  createClassNode({ name, stereotype, attributes: [], operations: [] });

describe("class diagrams", () => {
  it("builds the template with parents above children and no problems", () => {
    const d = valid(buildTemplate("class"));
    expect(d.chartType).toBe("class");
    expect(classIssues(d)).toEqual([]);
    const y = (name: string): number => classesOf(d).find((c) => c.cls.name === name)?.node.y ?? 0;
    expect(y("PaymentMethod")).toBeLessThan(y("CardPayment"));
    expect(y("Order")).toBeLessThan(y("OrderLine"));
    valid(buildTemplate("class-blank"));
  });

  it("reads every relationship type back from its arrowheads", () => {
    for (const r of RELATIONS) {
      expect(
        relationOf({ arrowStart: "none", arrowEnd: "none", strokePattern: "solid", ...relationStyle(r) }),
      ).toBe(r);
    }
  });

  it("exports Mermaid and imports it back", () => {
    const original = buildTemplate("class");
    const mermaid = diagramToMermaid(original);
    expect(mermaid).toContain(
      "class PaymentMethod {\n    <<interface>>\n    +charge(amount: Money): Receipt\n  }",
    );
    expect(mermaid).toContain('Customer "1" --> "*" Order : places');
    expect(mermaid).toContain('Order "1" *-- "1..*" OrderLine');
    expect(mermaid).toContain("PaymentMethod <|.. CardPayment");
    const back = importText(mermaid);
    if (!back.ok) throw new Error(back.error);
    const d = valid(back.diagram);
    expect(d.chartType).toBe("class");
    expect(classesOf(d).map((c) => c.cls)).toEqual(classesOf(original).map((c) => c.cls));
    const relations = (x: Diagram): string[] =>
      x.edges.map((e) => `${relationOf(e)}:${e.startLabel ?? ""}:${e.endLabel ?? ""}:${e.label}`).sort();
    expect(relations(d)).toEqual(relations(original));
  });

  it("imports member lines and annotations written outside class blocks", () => {
    const result = importText(
      "classDiagram\n  Animal <|-- Duck\n  <<abstract>> Animal\n  Duck : +swim()\n  Duck : +String beak",
    );
    if (!result.ok) throw new Error(result.error);
    const all = classesOf(result.diagram).map((c) => c.cls);
    const animal = all.find((c) => c.name === "Animal");
    const duck = all.find((c) => c.name === "Duck");
    expect(animal?.stereotype).toBe("abstract");
    expect(duck).toMatchObject({ attributes: ["+ String beak"], operations: ["+ swim()"] });
    expect(relationOf(result.diagram.edges[0] ?? relationship("a", "b", "association"))).toBe("inheritance");
  });

  it("flags realisations of classes, inheritance loops and duplicate names", () => {
    const a = cls("A");
    const b = cls("B");
    const c = cls("A");
    const d = {
      ...createDiagram("C", "professional", "class"),
      nodes: [a, b, c],
      edges: [
        relationship(a.id, b.id, "inheritance"),
        relationship(b.id, a.id, "inheritance"),
        relationship(c.id, b.id, "realization"),
      ],
    };
    const messages = classIssues(d).map((i) => i.message);
    expect(messages).toContain("Two classes are called A");
    expect(messages).toContain("A implements B, which isn't an interface");
    expect(messages).toContain("A inherits from itself");
  });
});

describe("editing class diagrams", () => {
  beforeEach(() => {
    useEditor
      .getState()
      .load({ ...createDiagram("C", "professional", "class"), nodes: [cls("Shape", "interface")] });
  });

  it("adds subclasses with Tab, implementing interfaces", () => {
    const parent = useEditor.getState().diagram?.nodes[0]?.id ?? "";
    expect(addSubclass(parent)).toBe(true);
    const d = useEditor.getState().diagram;
    if (!d) throw new Error("no diagram");
    valid(d);
    expect(relationOf(d.edges[0] ?? relationship("a", "b", "association"))).toBe("realization");
    expect(d.edges[0]?.target).toBe(parent);
  });

  it("edits members, stereotypes and relationship types", () => {
    const id = useEditor.getState().diagram?.nodes[0]?.id ?? "";
    updateClass(id, { stereotype: "abstract", attributes: ["# name: string"] });
    const node = useEditor.getState().diagram?.nodes[0];
    expect(parseClass(node?.label ?? "")).toMatchObject({
      stereotype: "abstract",
      attributes: ["# name: string"],
    });
    expect(node?.stroke).toBe("#1a56db");
    useEditor.getState().addNode("class", 300, 0);
    const other = useEditor.getState().selection.nodeIds[0] ?? "";
    const edgeId = useEditor.getState().connect(other, id) ?? "";
    setRelation(edgeId, "aggregation");
    const edge = useEditor.getState().diagram?.edges.find((e) => e.id === edgeId);
    expect(edge && relationOf(edge)).toBe("aggregation");
  });
});
