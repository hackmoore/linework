import { ROADMAP_STATUSES, type RoadmapData, type RoadmapItem, type RoadmapStatus } from "@linework/shared";
import { addDays } from "../gantt/model";
import { csvCell, normaliseDate, parseCsv } from "../gantt/io";
import { createRoadmapItem, createRoadmapLane, DEFAULT_DAYS, STATUS_LABELS } from "./model";

/*
 * CSV for roadmaps: one row per item. Lanes are created from the Lane column by name, so a
 * spreadsheet with a Team or Theme column turns straight into lanes.
 */

const HEADERS = {
  lane: ["lane", "team", "theme", "workstream", "area", "group", "section", "swimlane", "epic"],
  title: ["title", "name", "item", "summary", "feature", "initiative"],
  start: ["start", "start date", "from", "begin"],
  end: ["end", "end date", "to", "finish", "due", "due date", "target date"],
  status: ["status", "state", "progress"],
  owner: ["owner", "assignee", "lead", "responsible"],
  kind: ["type", "kind", "milestone"],
  description: ["description", "details", "notes"],
} as const;

function parseStatus(value: string): RoadmapStatus {
  const v = value.trim().toLowerCase();
  if ((ROADMAP_STATUSES as readonly string[]).includes(v)) return v as RoadmapStatus;
  if (/^(done|complete|completed|shipped|released|closed)$/.test(v)) return "done";
  if (/^(in progress|in-progress|doing|active|started|building)$/.test(v)) return "in-progress";
  if (/^(at risk|at-risk|blocked|late|delayed|red)$/.test(v)) return "at-risk";
  return "planned";
}

export type RoadmapImportResult =
  { ok: true; data: RoadmapData; skipped: number } | { ok: false; error: string };

/**
 * A CSV of roadmap items: lane, title and start columns, and none of the duration or
 * dependency columns that mark a Gantt task list.
 */
export function isRoadmapCsv(text: string): boolean {
  const header = parseCsv(text.split(/\r?\n/, 1)[0] ?? "")[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const has = (names: readonly string[]): boolean => header.some((h) => names.includes(h));
  const lanes = HEADERS.lane.filter((h) => h !== "section" && h !== "group");
  const gantt = ["duration", "depends on", "predecessors", "dependencies", "% complete", "percent complete"];
  return has(lanes) && has(HEADERS.title) && has(HEADERS.start) && !has(gantt);
}

/** Adds the items in a CSV to a roadmap, creating lanes by name. */
export function importRoadmapCsv(text: string, base: RoadmapData): RoadmapImportResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([key, names]) => [
      key,
      header.findIndex((h) => (names as readonly string[]).includes(h)),
    ]),
  ) as Record<keyof typeof HEADERS, number>;
  if (col.title < 0 || col.start < 0) return { ok: false, error: "The CSV needs Title and Start columns" };
  const lanes = [...base.lanes];
  const laneFor = (name: string): string => {
    const wanted = name.trim() || "Roadmap";
    const known = lanes.find((l) => l.name.toLowerCase() === wanted.toLowerCase());
    if (known) return known.id;
    const lane = createRoadmapLane(wanted.slice(0, 100), lanes.length);
    lanes.push(lane);
    return lane.id;
  };
  const items: RoadmapItem[] = [];
  let skipped = 0;
  const cell = (row: readonly string[], index: number): string =>
    index >= 0 ? (row[index] ?? "").trim() : "";
  for (const row of rows.slice(1)) {
    const title = cell(row, col.title);
    const start = normaliseDate(cell(row, col.start).slice(0, 10)) ?? normaliseDate(cell(row, col.start));
    if (!title || !start) {
      skipped++;
      continue;
    }
    const kindText = cell(row, col.kind).toLowerCase();
    const end = normaliseDate(cell(row, col.end).slice(0, 10)) ?? normaliseDate(cell(row, col.end));
    const milestone = /^(milestone|yes|true|1|x)$/.test(kindText);
    items.push(
      createRoadmapItem(title.slice(0, 200), laneFor(cell(row, col.lane)), start, 1, {
        kind: milestone ? "milestone" : "item",
        end: milestone ? start : end && end >= start ? end : addDays(start, DEFAULT_DAYS[base.scale] - 1),
        status: parseStatus(cell(row, col.status)),
        owner: cell(row, col.owner).slice(0, 100),
        description: cell(row, col.description).slice(0, 5_000),
      }),
    );
  }
  if (items.length === 0) return { ok: false, error: "No items with a title and start date found" };
  if (lanes.length > 100) return { ok: false, error: "A roadmap can have up to 100 lanes" };
  return { ok: true, data: { ...base, lanes, items: [...base.items, ...items].slice(0, 5_000) }, skipped };
}

export function roadmapToCsv(data: RoadmapData): string {
  const lanes = new Map(data.lanes.map((l) => [l.id, l.name]));
  const lines = [["Lane", "Title", "Type", "Start", "End", "Status", "Owner", "Description"].join(",")];
  for (const lane of data.lanes)
    for (const i of data.items.filter((x) => x.laneId === lane.id))
      lines.push(
        [
          lanes.get(i.laneId) ?? "",
          i.title,
          i.kind === "milestone" ? "Milestone" : "Item",
          i.start,
          i.end,
          STATUS_LABELS[i.status],
          i.owner,
          i.description,
        ]
          .map(csvCell)
          .join(","),
      );
  return `${lines.join("\n")}\n`;
}

/** Mermaid has no roadmap diagram, so roadmaps export as a Mermaid gantt chart: lanes become sections. */
export function roadmapToMermaid(title: string, data: RoadmapData): string {
  const lines = ["gantt", `  title ${title.replace(/[\r\n]/g, " ")}`, "  dateFormat YYYY-MM-DD"];
  for (const lane of data.lanes) {
    const items = data.items.filter((i) => i.laneId === lane.id);
    if (items.length === 0) continue;
    lines.push(`  section ${lane.name.replace(/[\r\n]/g, " ") || "Lane"}`);
    for (const i of items) {
      const tags = [
        i.kind === "milestone" ? "milestone" : null,
        i.status === "done"
          ? "done"
          : i.status === "in-progress"
            ? "active"
            : i.status === "at-risk"
              ? "crit"
              : null,
      ].filter(Boolean);
      const days = Math.round((Date.parse(i.end) - Date.parse(i.start)) / 86_400_000) + 1;
      const length = i.kind === "milestone" ? "0d" : `${String(days)}d`;
      lines.push(
        `    ${(i.title || "Untitled").replace(/[:#\r\n]/g, " ")} :${[...tags, i.start, length].join(", ")}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
