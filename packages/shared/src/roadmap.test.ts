import { describe, expect, it } from "vitest";
import { validateRoadmap, type RoadmapData } from "./roadmap.js";

const lane = { id: "l", name: "Team", color: "#1a56db", collapsed: false };
const item = {
  id: "i",
  laneId: "l",
  kind: "item" as const,
  title: "Work",
  description: "",
  start: "2026-03-01",
  end: "2026-03-31",
  status: "planned" as const,
  owner: "",
  color: null,
};
const base: RoadmapData = {
  scale: "month",
  fiscalYearStart: 1,
  showToday: true,
  lanes: [lane],
  items: [item],
};

describe("roadmaps", () => {
  it("accepts items in existing lanes", () => {
    expect(validateRoadmap(base)).toEqual([]);
  });

  it("flags duplicates, missing lanes and backwards dates", () => {
    const issues = validateRoadmap({
      ...base,
      lanes: [lane, lane],
      items: [item, { ...item, laneId: "x", end: "2026-02-01" }],
    }).map(([, message]) => message);
    expect(issues).toEqual([
      "Duplicate lane id",
      "Duplicate item id",
      "Item is in a missing lane",
      "Item ends before it starts",
    ]);
  });
});
