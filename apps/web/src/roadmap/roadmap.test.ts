import { beforeEach, describe, expect, it } from "vitest";
import { itemCount, parseDiagram, type Diagram, type RoadmapData } from "@linework/shared";
import { applyPatch, diffDiagrams } from "../collab/patch";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToSvg } from "../export/exporters";
import { ganttToCsv } from "../gantt/io";
import { diagramToMermaid } from "../mermaid/mermaid";
import { importText } from "../share/importText";
import { parseSimpleSpec } from "../share/simpleSpec";
import { buildTemplate } from "../templates/build";
import { addItem, moveLaneBy, normaliseItem, removeLane, resizeItem, shiftItem } from "./actions";
import { importRoadmapCsv, isRoadmapCsv, roadmapToCsv } from "./io";
import { computeRoadmapLayout } from "./layout";
import { createRoadmapData, createRoadmapItem, createRoadmapLane, quarterLabel } from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

function data(): RoadmapData {
  const lane = createRoadmapLane("Team", 0);
  return {
    ...createRoadmapData(),
    lanes: [lane],
    items: [
      createRoadmapItem("A", lane.id, "2026-03-02", 30),
      createRoadmapItem("B", lane.id, "2026-03-20", 30),
      createRoadmapItem("C", lane.id, "2026-06-01", 10),
    ],
  };
}

describe("roadmap documents", () => {
  it("builds valid templates dated around today", () => {
    const d = valid(buildTemplate("roadmap"));
    expect(d.chartType).toBe("roadmap");
    expect(itemCount(d)).toBe(10);
    expect(d.roadmap?.items.some((i) => i.kind === "milestone")).toBe(true);
    const { svg } = diagramToSvg(d);
    expect(svg).toContain("Real-time sync");
    expect(svg).toContain("Platform");
    expect(valid(buildTemplate("roadmap-blank")).roadmap?.lanes).toHaveLength(2);
    expect(valid(createDiagram("R", "professional", "roadmap")).roadmap?.lanes).toHaveLength(1);
  });

  it("rejects items in missing lanes or ending before they start", () => {
    const d = buildTemplate("roadmap");
    const roadmap = d.roadmap;
    const item = roadmap?.items[0];
    if (!roadmap || !item) throw new Error("no roadmap");
    expect(parseDiagram({ ...d, roadmap: { ...roadmap, items: [{ ...item, laneId: "nope" }] } }).ok).toBe(
      false,
    );
    const backwards = { ...item, start: "2026-05-01", end: "2026-04-01" };
    expect(parseDiagram({ ...d, roadmap: { ...roadmap, items: [backwards] } }).ok).toBe(false);
    expect(parseDiagram({ ...d, roadmap: undefined }).ok).toBe(false);
  });
});

describe("roadmap layout", () => {
  it("packs overlapping items into separate rows", () => {
    const layout = computeRoadmapLayout(data(), "2026-03-01");
    const [a, b, c] = layout.items;
    expect(a?.y).not.toBe(b?.y);
    // C starts after A ends, so it reuses A's row.
    expect(c?.y).toBe(a?.y);
    expect(layout.lanes[0]?.height).toBeGreaterThan(80);
    expect(layout.bottom.length).toBeGreaterThanOrEqual(8);
    expect(layout.bottom[0]?.label).toBe("Mar");
    expect(layout.todayX).not.toBeNull();
  });

  it("labels financial quarters and hides collapsed lanes", () => {
    expect(quarterLabel(2026, 0, 1)).toBe("Q1 2026");
    expect(quarterLabel(2026, 3, 4)).toBe("Q1 FY27");
    expect(quarterLabel(2027, 2, 4)).toBe("Q4 FY27");
    const quarterly = computeRoadmapLayout({ ...data(), scale: "quarter", fiscalYearStart: 4 }, "2026-03-01");
    expect(quarterly.bottom.slice(0, 2).map((c) => c.label)).toEqual(["Q4", "Q1"]);
    expect(quarterly.top.map((c) => c.label).slice(0, 2)).toEqual(["FY26", "FY27"]);
    const roadmap = data();
    const collapsed = {
      ...roadmap,
      lanes: roadmap.lanes.map((l) => ({ ...l, collapsed: true })),
    };
    const layout = computeRoadmapLayout(collapsed, "2026-03-01");
    expect(layout.items).toHaveLength(0);
    expect(layout.lanes[0]).toMatchObject({ height: 36, itemCount: 3 });
  });
});

describe("roadmap editing", () => {
  it("moves, resizes and keeps dates consistent", () => {
    const item = createRoadmapItem("A", "lane", "2026-03-02", 10);
    expect(shiftItem(item, 7)).toMatchObject({ start: "2026-03-09", end: "2026-03-18" });
    expect(shiftItem(item, 0, "other").laneId).toBe("other");
    expect(resizeItem(item, "end", -30).end).toBe(item.start);
    expect(resizeItem(item, "start", 3).start).toBe("2026-03-05");
    expect(normaliseItem({ ...item, kind: "milestone" }).end).toBe(item.start);
  });

  it("moves items to the neighbouring lane when a lane is deleted", () => {
    const roadmap = data();
    const second = createRoadmapLane("Other", 1);
    const withTwo = { ...roadmap, lanes: [...roadmap.lanes, second] };
    const first = roadmap.lanes[0]?.id ?? "";
    const removed = removeLane(withTwo, first);
    expect(removed.items.every((i) => i.laneId === second.id)).toBe(true);
    expect(removeLane(removed, second.id).items).toHaveLength(0);
    expect(moveLaneBy(withTwo, second.id, -1).lanes[0]?.id).toBe(second.id);
  });

  beforeEach(() => {
    useEditor.getState().load({ ...createDiagram("R", "professional", "roadmap"), roadmap: data() });
  });

  it("adds, selects and deletes items through the editor", () => {
    const id = addItem("milestone", { start: "2026-04-15" });
    const state = useEditor.getState();
    expect(state.selection.taskIds).toEqual([id]);
    expect(state.diagram?.roadmap?.items.find((i) => i.id === id)).toMatchObject({
      kind: "milestone",
      start: "2026-04-15",
      end: "2026-04-15",
    });
    state.selectAll();
    expect(useEditor.getState().selection.taskIds).toHaveLength(4);
    useEditor.getState().deleteSelection();
    const after = useEditor.getState().diagram;
    expect(after && valid(after).roadmap?.items).toHaveLength(0);
  });
});

describe("roadmap import and export", () => {
  it("imports CSV with lanes, statuses and milestones", () => {
    const csv = [
      "Team,Title,Start,End,Status,Owner,Type",
      "Mobile,Offline mode,2026-04-01,2026-06-30,In progress,Sam,",
      "Mobile,App store launch,15/07/2026,,,,Milestone",
      "Web,Billing,2026-05-01,,blocked,,",
      "Web,,2026-05-01,,,,",
    ].join("\n");
    expect(isRoadmapCsv(csv)).toBe(true);
    const result = importRoadmapCsv(csv, { ...createRoadmapData(), lanes: [] });
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped).toBe(1);
    expect(result.data.lanes.map((l) => l.name)).toEqual(["Mobile", "Web"]);
    const [offline, launch, billing] = result.data.items;
    expect(offline).toMatchObject({ status: "in-progress", owner: "Sam", end: "2026-06-30" });
    expect(launch).toMatchObject({ kind: "milestone", start: "2026-07-15", end: "2026-07-15" });
    expect(billing).toMatchObject({ status: "at-risk", end: "2026-05-30" });
  });

  it("round-trips its own CSV, exports Mermaid and isn't confused with Gantt CSV", () => {
    const original = buildTemplate("roadmap");
    const roadmap = original.roadmap;
    if (!roadmap) throw new Error("no roadmap");
    const result = importText(roadmapToCsv(roadmap), "plan.csv");
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.chartType).toBe("roadmap");
    expect(itemCount(d)).toBe(itemCount(original));
    expect(d.roadmap?.items.map((i) => [i.title, i.start, i.end, i.status])).toEqual(
      roadmap.lanes.flatMap((l) =>
        roadmap.items.filter((i) => i.laneId === l.id).map((i) => [i.title, i.start, i.end, i.status]),
      ),
    );
    const mermaid = diagramToMermaid(original);
    expect(mermaid).toMatch(/^gantt/);
    expect(mermaid).toContain("section Platform");
    expect(mermaid).toMatch(/Public beta :milestone, \d{4}-\d{2}-\d{2}, 0d/);
    const gantt = buildTemplate("gantt-launch").gantt;
    if (!gantt) throw new Error("no gantt");
    expect(isRoadmapCsv(ganttToCsv(gantt))).toBe(false);
  });

  it("builds roadmaps from the simple spec", () => {
    const result = parseSimpleSpec({
      type: "roadmap",
      scale: "quarter",
      fiscalYearStart: 7,
      lanes: [
        {
          name: "Platform",
          color: "purple",
          items: [
            { title: "Sync", start: "2026-01-05" },
            { title: "GA", start: "2026-06-01", milestone: true, status: "done" },
          ],
        },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.roadmap).toMatchObject({ scale: "quarter", fiscalYearStart: 7 });
    expect(d.roadmap?.items[0]?.end).toBe("2026-04-04");
    expect(d.roadmap?.items[1]).toMatchObject({ kind: "milestone", status: "done", end: "2026-06-01" });
  });
});

describe("roadmap collaboration", () => {
  it("syncs settings and items, and rescues items whose lane was deleted", () => {
    const original: Diagram = { ...createDiagram("R", "professional", "roadmap"), roadmap: data() };
    const roadmap = original.roadmap;
    if (!roadmap) throw new Error("no roadmap");
    const extra = createRoadmapLane("New", 1);
    const theirs: Diagram = {
      ...original,
      roadmap: {
        ...roadmap,
        scale: "quarter",
        lanes: [...roadmap.lanes, extra],
        items: [...roadmap.items, createRoadmapItem("D", extra.id, "2026-08-01", 10)],
      },
    };
    const patch = diffDiagrams(original, theirs);
    if (!patch) throw new Error("no patch");
    expect(patch.set["roadmap.scale"]).toBe("quarter");
    const merged = valid(applyPatch(original, patch));
    expect(merged.roadmap?.items).toHaveLength(4);
    // Someone else deleted the new lane: its item moves to the first lane.
    const orphan = valid(
      applyPatch(
        { ...merged, roadmap: { ...roadmap, items: merged.roadmap?.items ?? [] } },
        { set: {}, collections: {} },
      ),
    );
    expect(orphan.roadmap?.items.find((i) => i.title === "D")?.laneId).toBe(roadmap.lanes[0]?.id);
  });
});
