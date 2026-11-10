import { describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { buildTemplate } from "../templates/build";
import { diagramToMermaid, parseMermaid } from "./mermaid";

function ok(text: string): { diagram: Diagram; skipped: number } {
  const result = parseMermaid(text);
  if (!result.ok) throw new Error(result.error);
  const valid = parseDiagram(result.diagram);
  if (!valid.ok) throw new Error(valid.error);
  return result;
}

describe("Mermaid flowchart import", () => {
  it("reads shapes, chains, labels and arrow styles", () => {
    const { diagram } = ok(`flowchart LR
      %% a comment
      A([Start]) --> B{Valid?}
      B -->|yes| C[(Database)]
      B -- no --> D[/Error/]
      C -.-> E((Done)) ==> F{{Prep}}
      A & D --- F
      style A fill:#f9f`);
    const byLabel = new Map(diagram.nodes.map((n) => [n.label, n]));
    expect(byLabel.get("Start")?.kind).toBe("rounded");
    expect(byLabel.get("Valid?")?.kind).toBe("diamond");
    expect(byLabel.get("Database")?.kind).toBe("cylinder");
    expect(byLabel.get("Error")?.kind).toBe("parallelogram");
    expect(byLabel.get("Done")?.kind).toBe("ellipse");
    expect(byLabel.get("Prep")?.kind).toBe("hexagon");
    expect(diagram.edges).toHaveLength(7);
    const labels = diagram.edges.map((e) => e.label).filter(Boolean);
    expect(labels).toEqual(["yes", "no"]);
    const dotted = diagram.edges.find((e) => e.strokePattern === "dashed");
    expect(dotted).toBeDefined();
    expect(diagram.edges.some((e) => e.strokeWidth === 3)).toBe(true);
    expect(diagram.edges.filter((e) => e.arrowEnd === "none")).toHaveLength(2);
  });

  it("lays nodes out along the flow direction", () => {
    const { diagram } = ok("graph TD\n  a --> b\n  b --> c");
    const ys = diagram.nodes.map((n) => n.y);
    expect(ys[0]).toBeLessThan(ys[1] ?? 0);
    expect(ys[1]).toBeLessThan(ys[2] ?? 0);
  });

  it("turns subgraphs into groups around their members", () => {
    const { diagram } = ok(`flowchart TB
      subgraph api [Backend services]
        a[Auth] --> b[Orders]
      end
      c[Web] --> a`);
    const group = diagram.nodes.find((n) => n.kind === "container");
    expect(group?.label).toBe("Backend services");
    const auth = diagram.nodes.find((n) => n.label === "Auth");
    expect(group && auth && auth.x >= group.x && auth.y >= group.y).toBe(true);
  });

  it("handles quoted labels with brackets and line breaks", () => {
    const { diagram } = ok('flowchart TD\n  a["Call [api] <br> now"] --> b');
    expect(diagram.nodes[0]?.label).toBe("Call [api] \n now");
  });

  it("rejects unsupported diagram types", () => {
    expect(parseMermaid("sequenceDiagram\n A->>B: hi").ok).toBe(false);
  });
});

describe("Mermaid gantt import", () => {
  it("reads sections, tags, ids, after-dependencies and durations", () => {
    const { diagram } = ok(`gantt
      title Release
      dateFormat YYYY-MM-DD
      excludes weekends
      section Build
      Design :done, des, 2026-03-02, 3d
      Code   :active, code, after des, 5d
      section Ship
      QA     :qa, after code, 2d
      Launch :milestone, after qa, 0d`);
    expect(diagram.title).toBe("Release");
    const gantt = diagram.gantt;
    if (!gantt) throw new Error("no gantt");
    expect(gantt.calendar.skipWeekends).toBe(true);
    expect(gantt.sections.map((s) => s.name)).toEqual(["Build", "Ship"]);
    const [design, code, qa, launch] = gantt.tasks;
    expect(design?.progress).toBe(100);
    expect([design?.start, design?.end]).toEqual(["2026-03-02", "2026-03-04"]);
    // 5 working days after Wed 4 Mar: Thu 5 to Wed 11.
    expect([code?.start, code?.end]).toEqual(["2026-03-05", "2026-03-11"]);
    expect(code?.dependencies[0]?.taskId).toBe(design?.id);
    expect(qa?.start).toBe("2026-03-12");
    expect(launch?.kind).toBe("milestone");
    expect(launch?.start).toBe("2026-03-16");
  });

  it("chains tasks without a start after the previous task", () => {
    const { diagram } = ok("gantt\n  dateFormat YYYY-MM-DD\n  A :2026-03-02, 2d\n  B :3d");
    expect(diagram.gantt?.tasks[1]?.start).toBe("2026-03-04");
  });

  it("rejects other date formats", () => {
    expect(parseMermaid("gantt\n dateFormat DD-MM-YYYY\n A :01-03-2026, 2d").ok).toBe(false);
  });
});

describe("Mermaid export", () => {
  it("round-trips the flowchart template", () => {
    const original = buildTemplate("flowchart");
    const text = diagramToMermaid(original);
    expect(text.startsWith("flowchart TD")).toBe(true);
    const { diagram } = ok(text);
    expect(diagram.nodes.map((n) => n.label).sort()).toEqual(original.nodes.map((n) => n.label).sort());
    expect(diagram.edges).toHaveLength(original.edges.length);
  });

  it("round-trips the gantt template with dependencies", () => {
    const original = buildTemplate("gantt-launch");
    const { diagram } = ok(diagramToMermaid(original));
    const before = original.gantt?.tasks.map((t) => [t.name, t.start, t.end]);
    const after = diagram.gantt?.tasks.map((t) => [t.name, t.start, t.end]);
    expect(after).toEqual(before);
    const deps = (d: Diagram): number => d.gantt?.tasks.reduce((n, t) => n + t.dependencies.length, 0) ?? 0;
    expect(deps(diagram)).toBe(deps(original));
  });
});
