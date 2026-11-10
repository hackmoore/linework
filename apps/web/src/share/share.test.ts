import { describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { ICONS } from "../library/icons";
import { buildTemplate } from "../templates/build";
import { importText } from "./importText";
import { compressDiagram, decodeFragment, shareLink } from "./link";
import { llmsGuide } from "./llmsGuide";
import { parseSimpleSpec } from "./simpleSpec";

function valid(d: Diagram): void {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
}

describe("share links", () => {
  it("round-trips a diagram through a compressed link", async () => {
    const original = buildTemplate("architecture");
    const link = await shareLink(original, "https://example.test");
    expect(link.startsWith("https://example.test/open#d=")).toBe(true);
    const result = await decodeFragment(new URL(link).hash);
    expect(result.ok && result.diagram).toEqual(original);
  });

  it("compresses well enough for typical charts", async () => {
    const payload = await compressDiagram(buildTemplate("gantt-launch"));
    expect(payload.length).toBeLessThan(JSON.stringify(buildTemplate("gantt-launch")).length / 2);
  });

  it("opens URL-encoded and base64url Mermaid", async () => {
    const mermaid = "flowchart LR\n  A[One] --> B[Two & more]";
    const encoded = await decodeFragment(`#m=${encodeURIComponent(mermaid)}`);
    expect(encoded.ok && encoded.diagram.nodes.map((n) => n.label)).toEqual(["One", "Two & more"]);
    const b64 = btoa(mermaid).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    expect((await decodeFragment(`#m=${b64}`)).ok).toBe(true);
  });

  it("opens the simple JSON spec", async () => {
    const spec = {
      type: "flowchart",
      nodes: [{ id: "a" }, { id: "b", icon: "database" }],
      edges: [{ from: "a", to: "b" }],
    };
    const result = await decodeFragment(`#s=${encodeURIComponent(JSON.stringify(spec))}`);
    expect(result.ok && result.diagram.nodes[1]?.kind).toBe("icon");
  });

  it("explains broken links", async () => {
    expect(await decodeFragment("")).toEqual({ ok: false, error: "This link doesn't contain a chart" });
    const bad = await decodeFragment("#s=%7Bnope");
    expect(bad.ok).toBe(false);
    const wrong = await decodeFragment(
      `#s=${encodeURIComponent(JSON.stringify({ type: "flowchart", nodes: [] }))}`,
    );
    expect(!wrong.ok && wrong.error).toMatch(/nodes/);
  });
});

describe("simple spec", () => {
  it("builds laid-out, valid flowcharts with groups and colours", () => {
    const result = parseSimpleSpec({
      type: "flowchart",
      direction: "LR",
      nodes: [
        { id: "a", label: "A", color: "blue", group: "G" },
        { id: "b", shape: "diamond", group: "G" },
        { id: "c", shape: "cylinder" },
      ],
      edges: [
        { from: "a", to: "b", label: "go" },
        { from: "b", to: "c", style: "dashed", arrow: "both" },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    valid(result.diagram);
    const [group, a, b] = result.diagram.nodes;
    expect(group?.kind).toBe("container");
    expect(a?.fill).toBe("#e8f0fe");
    expect((b?.x ?? 0) > (a?.x ?? 0)).toBe(true);
    expect(result.diagram.edges[1]?.arrowStart).toBe("arrow");
  });

  it("reports unknown edge targets and duplicate ids", () => {
    const missing = parseSimpleSpec({
      type: "flowchart",
      nodes: [{ id: "a" }],
      edges: [{ from: "a", to: "x" }],
    });
    expect(!missing.ok && missing.error).toMatch(/unknown node/);
    expect(parseSimpleSpec({ type: "flowchart", nodes: [{ id: "a" }, { id: "a" }] }).ok).toBe(false);
  });

  it("builds gantt charts with working days and dependencies", () => {
    const result = parseSimpleSpec({
      type: "gantt",
      skipWeekends: true,
      sections: [
        {
          name: "Build",
          tasks: [
            { id: "a", name: "A", start: "2026-03-02", days: 5 },
            { id: "b", name: "B", days: 2, after: ["a"] },
            { name: "Done", milestone: true, after: ["b"] },
          ],
        },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    valid(result.diagram);
    const tasks = result.diagram.gantt?.tasks ?? [];
    expect(tasks.map((t) => [t.start, t.end])).toEqual([
      ["2026-03-02", "2026-03-06"],
      ["2026-03-09", "2026-03-10"],
      ["2026-03-11", "2026-03-11"],
    ]);
  });
});

describe("text import", () => {
  it("detects files, specs and Mermaid", () => {
    const file = buildTemplate("kanban");
    expect(importText(JSON.stringify(file)).ok).toBe(true);
    expect(importText('{"type":"gantt","sections":[{"name":"S","tasks":[{"name":"T"}]}]}').ok).toBe(true);
    expect(importText("gantt\n dateFormat YYYY-MM-DD\n A :2026-03-02, 2d").ok).toBe(true);
    expect(importText("Name,Start\nA,2026-03-02", "plan.csv").ok).toBe(true);
    expect(importText("hello").ok).toBe(false);
  });
});

describe("LLM guide", () => {
  const guide = llmsGuide({ origin: "https://example.test", iconIds: ICONS.map((i) => i.id) });

  it("lists every icon and uses the given origin", () => {
    for (const icon of ICONS) expect(guide).toContain(icon.id);
    expect(guide).toContain("https://example.test/open#");
  });

  it("has an example link that opens", async () => {
    const link = /Link: (\S+)/.exec(guide)?.[1];
    if (!link) throw new Error("no example link");
    const result = await decodeFragment(new URL(link).hash);
    if (!result.ok) throw new Error(result.error);
    expect(result.diagram.nodes.map((n) => n.label)).toEqual(["Start", "Approved?", "Build", "Revise"]);
  });

  it("has JSON examples that import", () => {
    // Indented code blocks starting with "{" are the JSON examples.
    const blocks = guide.split("\n\n").filter((b) => b.startsWith("    {"));
    expect(blocks).toHaveLength(12);
    for (const block of blocks) {
      const result = parseSimpleSpec(JSON.parse(block));
      if (!result.ok) throw new Error(result.error);
      valid(result.diagram);
    }
  });
});
