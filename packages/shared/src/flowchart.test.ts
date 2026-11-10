import { describe, expect, it } from "vitest";
import { DIAGRAM_FORMAT_VERSION, itemCount, parseDiagram } from "./diagram.js";

function flowchart(extra: Record<string, unknown>): unknown {
  return {
    version: DIAGRAM_FORMAT_VERSION,
    id: "f1",
    chartType: "flowchart",
    title: "Flow",
    styleId: "professional",
    background: "#ffffff",
    nodes: [
      {
        id: "n1",
        kind: "terminal",
        x: 0,
        y: 0,
        width: 150,
        height: 60,
        label: "Start",
        fill: "transparent",
        stroke: "#1f2937",
        strokeWidth: 2,
        strokePattern: "solid",
        textColor: "#1f2937",
        fontSize: 16,
        textAlign: "center",
        icon: null,
        layerId: "l1",
      },
    ],
    edges: [],
    layers: [{ id: "l1", name: "Layer 1", visible: true, locked: false }],
    comments: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...extra,
  };
}

const lane = { id: "a", name: "Team", size: 280, color: "#1a56db" };

describe("flowcharts", () => {
  it("accepts direction, lanes and the terminal shape", () => {
    const result = parseDiagram(flowchart({ flowchart: { direction: "LR", laneStart: 0, lanes: [lane] } }));
    if (!result.ok) throw new Error(result.error);
    expect(itemCount(result.value)).toBe(1);
  });

  it("requires flowchart data and rejects bad lanes", () => {
    const missing = parseDiagram(flowchart({}));
    expect(!missing.ok && missing.error).toMatch(/missing its data/);
    const duplicate = parseDiagram(
      flowchart({ flowchart: { direction: "TB", laneStart: 0, lanes: [lane, lane] } }),
    );
    expect(!duplicate.ok && duplicate.error).toMatch(/Duplicate lane id/);
    const tiny = parseDiagram(
      flowchart({ flowchart: { direction: "TB", laneStart: 0, lanes: [{ ...lane, size: 10 }] } }),
    );
    expect(tiny.ok).toBe(false);
  });
});
