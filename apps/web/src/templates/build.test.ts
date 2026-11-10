import { describe, expect, it } from "vitest";
import { itemCount, parseDiagram } from "@linework/shared";
import { diagramToJson, diagramToSvg, safeFileName } from "../export/exporters";
import { parseDiagramJson } from "../export/importJson";
import { buildTemplate } from "./build";
import { TEMPLATE_CATALOG, TEMPLATE_IDS } from "./catalog";

describe("templates", () => {
  it.each(TEMPLATE_IDS)("%s builds a valid diagram", (id) => {
    const diagram = buildTemplate(id);
    const result = parseDiagram(diagram);
    expect(result.ok ? true : result.error).toBe(true);
    const info = TEMPLATE_CATALOG.find((t) => t.id === id);
    expect(diagram.chartType).toBe(info?.chartType);
    if (!info?.blank) {
      expect(itemCount(diagram)).toBeGreaterThan(0);
    }
  });

  it("creates fresh ids each time", () => {
    expect(buildTemplate("flowchart").id).not.toBe(buildTemplate("flowchart").id);
  });
});

describe("exporters", () => {
  it.each(["professional", "sketch"] as const)("renders %s style to standalone SVG", (styleId) => {
    const diagram = buildTemplate("flowchart", styleId);
    const { svg, width, height } = diagramToSvg(diagram);
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("Valid?");
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it("renders gantt charts to SVG with task names and dates", () => {
    const diagram = buildTemplate("gantt-launch", "sketch");
    const { svg, width } = diagramToSvg(diagram);
    expect(svg).toContain("User research");
    expect(svg).toContain("Discovery");
    expect(width).toBeGreaterThan(400);
  });

  it("renders kanban boards to SVG with columns, cards and WIP counts", () => {
    const { svg, width } = diagramToSvg(buildTemplate("kanban", "sketch"));
    expect(svg).toContain("Fix login timeout on Safari");
    expect(svg).toContain("In progress");
    expect(svg).toContain("2 / 3");
    expect(width).toBeGreaterThan(1000);
  });

  it("round-trips JSON", () => {
    const diagram = buildTemplate("architecture");
    const parsed = parseDiagramJson(diagramToJson(diagram));
    expect(parsed.ok && parsed.value).toEqual(diagram);
  });

  it("reports bad JSON", () => {
    const parsed = parseDiagramJson("{nope");
    expect(parsed.ok).toBe(false);
  });

  it("makes safe file names", () => {
    expect(safeFileName("  My / Diagram: v2 ")).toBe("my-diagram-v2");
    expect(safeFileName("???")).toBe("diagram");
  });
});
