import { describe, expect, it } from "vitest";
import { DIAGRAM_FORMAT_VERSION, parseDiagram, summarize, type Diagram } from "./diagram.js";

const now = new Date("2026-01-01T00:00:00.000Z").toISOString();

function makeDiagram(overrides: Partial<Diagram> = {}): Diagram {
  return {
    version: DIAGRAM_FORMAT_VERSION,
    id: "d1",
    chartType: "freeform",
    title: "Test",
    styleId: "professional",
    background: "#ffffff",
    nodes: [
      {
        id: "a",
        kind: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        label: "A",
        fill: "transparent",
        stroke: "#000000",
        strokeWidth: 2,
        strokePattern: "solid",
        textColor: "#000000",
        fontSize: 16,
        textAlign: "center",
        icon: null,
        layerId: "l1",
      },
    ],
    edges: [],
    layers: [{ id: "l1", name: "Layer 1", visible: true, locked: false }],
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("parseDiagram", () => {
  it("accepts a valid diagram", () => {
    const result = parseDiagram(makeDiagram());
    expect(result.ok).toBe(true);
  });

  it("rejects edges pointing at missing nodes", () => {
    const diagram = makeDiagram({
      edges: [
        {
          id: "e1",
          source: "a",
          target: "missing",
          label: "",
          routing: "straight",
          arrowStart: "none",
          arrowEnd: "arrow",
          stroke: "#000000",
          strokeWidth: 2,
          strokePattern: "solid",
        },
      ],
    });
    const result = parseDiagram(diagram);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("missing node");
  });

  it("rejects malformed colours", () => {
    const base = makeDiagram();
    const result = parseDiagram({ ...base, background: "red" });
    expect(result.ok).toBe(false);
  });
});

describe("layers", () => {
  it("rejects nodes on a missing layer", () => {
    const base = makeDiagram();
    const result = parseDiagram({
      ...base,
      layers: [{ id: "other", name: "x", visible: true, locked: false }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("migration", () => {
  it("upgrades v1 freeform and gantt documents", () => {
    const v1Node = { ...makeDiagram().nodes[0] } as Record<string, unknown>;
    delete v1Node.icon;
    delete v1Node.layerId;
    const freeform = parseDiagram({
      version: 1,
      id: "d1",
      title: "Old",
      styleId: "professional",
      background: "#ffffff",
      nodes: [v1Node],
      edges: [],
      createdAt: now,
      updatedAt: now,
    });
    expect(freeform.ok ? freeform.value.chartType : freeform.error).toBe("freeform");
    expect(freeform.ok && freeform.value.nodes[0]?.layerId).toBe(freeform.ok && freeform.value.layers[0]?.id);

    const gantt = parseDiagram({
      version: 1,
      id: "g1",
      chartType: "gantt",
      title: "Old plan",
      styleId: "professional",
      background: "#ffffff",
      nodes: [],
      edges: [],
      gantt: {
        sections: [{ id: "s", name: "S", color: "#1a56db" }],
        tasks: [
          {
            id: "a",
            kind: "task",
            name: "A",
            start: "2026-03-02",
            end: "2026-03-03",
            progress: 0,
            sectionId: "s",
            color: null,
            owner: "",
            dependsOn: [],
          },
          {
            id: "b",
            kind: "task",
            name: "B",
            start: "2026-03-04",
            end: "2026-03-05",
            progress: 0,
            sectionId: "s",
            color: null,
            owner: "",
            dependsOn: ["a"],
          },
        ],
        scale: "day",
        autoSchedule: true,
        showToday: true,
      },
      createdAt: now,
      updatedAt: now,
    });
    expect(gantt.ok ? gantt.value.gantt?.tasks[1]?.dependencies : gantt.error).toEqual([
      { taskId: "a", type: "FS", lag: 0 },
    ]);
  });
});

describe("summarize", () => {
  it("counts nodes", () => {
    expect(summarize(makeDiagram()).itemCount).toBe(1);
  });
});
