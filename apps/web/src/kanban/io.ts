import {
  KANBAN_PRIORITIES,
  type Diagram,
  type KanbanCard,
  type KanbanData,
  type KanbanPriority,
} from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { csvCell, normaliseDate, parseCsv } from "../gantt/io";
import { createCard, createColumn, createKanbanData, createLane, parseTags } from "./model";

export type KanbanImportResult = { ok: true; data: KanbanData } | { ok: false; error: string };

const CSV_COLUMNS = ["Title", "Column", "Lane", "Owner", "Due", "Tags", "Priority", "Description"] as const;
type CsvField = (typeof CSV_COLUMNS)[number];

/** Header names other tools use (Trello, Jira, GitHub Projects, spreadsheets). */
const HEADER_ALIASES: Readonly<Record<CsvField, readonly string[]>> = {
  Title: ["title", "name", "card", "card name", "summary", "task"],
  Column: ["column", "status", "list", "list name", "stage", "state"],
  Lane: ["lane", "swimlane", "team", "group"],
  Owner: ["owner", "assignee", "assigned to", "assigned", "members"],
  Due: ["due", "due date", "deadline"],
  Tags: ["tags", "labels", "label"],
  Priority: ["priority"],
  Description: ["description", "notes", "details"],
};

/** Cards as CSV, one row per card in board order. Opens in Excel and Google Sheets. */
export function cardsToCsv(data: KanbanData): string {
  const columns = new Map(data.columns.map((c) => [c.id, c.name]));
  const lanes = new Map(data.lanes.map((l) => [l.id, l.name]));
  const order = new Map(data.columns.map((c, i) => [c.id, i]));
  const cards = [...data.cards].sort((a, b) => (order.get(a.columnId) ?? 0) - (order.get(b.columnId) ?? 0));
  const rows = cards.map((c) =>
    [
      c.title,
      columns.get(c.columnId) ?? "",
      c.laneId ? (lanes.get(c.laneId) ?? "") : "",
      c.owner,
      c.due ?? "",
      c.tags.join(", "),
      c.priority === "none" ? "" : c.priority,
      c.description,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[CSV_COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

/** A CSV of cards (it has a status-like column and no start dates), not a task plan. */
export function isKanbanCsv(text: string): boolean {
  const header = parseCsv(text.split(/\r?\n/, 1)[0] ?? "")[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  return (
    header.some((h) => HEADER_ALIASES.Column.includes(h)) &&
    !header.some((h) => h === "start" || h === "start date")
  );
}

function parsePriority(value: string): KanbanPriority {
  const v = value.trim().toLowerCase();
  if ((KANBAN_PRIORITIES as readonly string[]).includes(v)) return v as KanbanPriority;
  if (v === "very high" || v === "highest" || v === "critical" || v === "blocker") return "urgent";
  if (v === "very low" || v === "lowest" || v === "trivial") return "low";
  if (v === "normal" || v === "med") return "medium";
  return "none";
}

/**
 * Adds cards from CSV to a board. Columns and lanes are matched by name (ignoring case)
 * and created when missing. Only the Title column is required.
 */
export function importCards(board: KanbanData, text: string): KanbanImportResult {
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const index = Object.fromEntries(
    CSV_COLUMNS.map((field) => [field, header.findIndex((h) => HEADER_ALIASES[field].includes(h))]),
  ) as Record<CsvField, number>;
  if (index.Title < 0) return { ok: false, error: "The first row needs a Title column" };
  const body = rows.slice(1);
  if (body.length === 0) return { ok: false, error: "No cards found" };
  if (board.cards.length + body.length > 5_000) return { ok: false, error: "A board can hold 5,000 cards" };

  const columns = [...board.columns];
  const lanes = [...board.lanes];
  const findOrAdd = <T extends { name: string }>(list: T[], name: string, make: () => T): T => {
    const found = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
    const made = make();
    list.push(made);
    return made;
  };
  const cards: KanbanCard[] = [];
  for (const row of body) {
    const cell = (field: CsvField): string => (index[field] >= 0 ? (row[index[field]] ?? "").trim() : "");
    const columnName = cell("Column").slice(0, 100) || (columns[0]?.name ?? "To do");
    const column = findOrAdd(columns, columnName, () => createColumn(columnName, columns.length));
    const laneName = cell("Lane").slice(0, 100);
    const lane = laneName ? findOrAdd(lanes, laneName, () => createLane(laneName)) : null;
    cards.push(
      createCard(cell("Title").slice(0, 500) || "Untitled card", column.id, lane?.id ?? null, {
        owner: cell("Owner").slice(0, 100),
        due: normaliseDate(cell("Due")),
        tags: parseTags(cell("Tags").replaceAll(";", ",")),
        priority: parsePriority(cell("Priority")),
        description: cell("Description").slice(0, 5_000),
      }),
    );
  }
  if (columns.length > 50 || lanes.length > 50) {
    return { ok: false, error: "A board can have up to 50 columns and 50 lanes" };
  }
  // Existing cards without a lane join the first lane when the import adds the first lanes.
  const firstLane = board.lanes.length === 0 ? lanes[0] : undefined;
  const existing = firstLane
    ? board.cards.map((c) => (c.laneId === null ? { ...c, laneId: firstLane.id } : c))
    : board.cards;
  const added = firstLane
    ? cards.map((c) => (c.laneId === null ? { ...c, laneId: firstLane.id } : c))
    : cards;
  return { ok: true, data: { columns, lanes, cards: [...existing, ...added] } };
}

// ---------------------------------------------------------------- Mermaid kanban

const MERMAID_PRIORITY: Readonly<Record<string, KanbanPriority>> = {
  "very high": "urgent",
  high: "high",
  medium: "medium",
  low: "low",
  "very low": "low",
};

const TO_MERMAID_PRIORITY: Readonly<Partial<Record<KanbanPriority, string>>> = {
  urgent: "Very High",
  high: "High",
  low: "Low",
};

/** `id[Text]`, `[Text]` or bare text, with optional `@{ key: 'value', ... }` metadata. */
function parseItem(line: string): { text: string; meta: Record<string, string> } {
  let rest = line;
  const meta: Record<string, string> = {};
  const at = /@\{(.*)\}\s*$/.exec(rest);
  if (at) {
    rest = rest.slice(0, at.index).trim();
    for (const m of (at[1] ?? "").matchAll(/(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]+))/g)) {
      const key = (m[1] ?? "").toLowerCase();
      meta[key] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    }
  }
  const bracket = /^[\w-]*\[(.*)\]$/.exec(rest);
  const text = (bracket ? (bracket[1] ?? "") : rest).replace(/^"(.*)"$/, "$1").trim();
  return { text, meta };
}

/**
 * Mermaid kanban syntax: `kanban`, then columns, then cards indented under them.
 * Supports `assigned` and `priority` metadata; `ticket` becomes a tag.
 */
export function parseMermaidKanban(
  text: string,
): { ok: true; diagram: Diagram } | { ok: false; error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/%%.*$/, "").replace(/\t/g, "  "))
    .filter((line) => line.trim() !== "");
  let title = "Untitled board";
  // Optional front matter with a title.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    for (const l of lines.slice(1, end)) {
      const m = /^\s*title:\s*(.+)$/.exec(l);
      if (m?.[1])
        title = m[1]
          .trim()
          .replace(/^["']|["']$/g, "")
          .slice(0, 200);
    }
    lines.splice(0, end + 1);
  }
  if (!/^\s*kanban\b/i.test(lines[0] ?? "")) return { ok: false, error: "Expected a Mermaid kanban chart" };
  const body = lines.slice(1);
  const indent = (line: string): number => line.length - line.trimStart().length;
  const columnIndent = Math.min(...body.map(indent));
  const data: KanbanData = { ...createKanbanData(), columns: [], cards: [] };
  for (const line of body) {
    const { text: label, meta } = parseItem(line.trim());
    if (indent(line) <= columnIndent) {
      if (data.columns.length >= 50) continue;
      const name = (label || "Untitled").slice(0, 100);
      data.columns.push(
        createColumn(name, data.columns.length, { done: /^(done|complete|completed|finished)$/i.test(name) }),
      );
      continue;
    }
    const column = data.columns.at(-1);
    if (!column || data.cards.length >= 5_000) continue;
    const tags = meta.ticket ? parseTags(meta.ticket) : [];
    data.cards.push(
      createCard((label || "Untitled card").slice(0, 500), column.id, null, {
        owner: (meta.assigned ?? "").slice(0, 100),
        priority: MERMAID_PRIORITY[(meta.priority ?? "").toLowerCase()] ?? "none",
        tags,
      }),
    );
  }
  if (data.columns.length === 0) return { ok: false, error: "No columns found in the kanban chart" };
  return { ok: true, diagram: { ...createDiagram(title, "professional", "kanban"), kanban: data } };
}

function mermaidText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replaceAll("[", "(")
    .replaceAll("]", ")");
}

/** Mermaid has no lanes, due dates or tags; lanes are flattened and the first tag becomes the ticket. */
export function kanbanToMermaid(diagram: Diagram): string {
  const data = diagram.kanban;
  if (!data) return "kanban\n";
  const lines = ["---", `title: ${mermaidText(diagram.title)}`, "---", "kanban"];
  data.columns.forEach((column, ci) => {
    lines.push(`  c${String(ci + 1)}[${mermaidText(column.name)}]`);
    data.cards
      .filter((c) => c.columnId === column.id)
      .forEach((card, i) => {
        const meta: string[] = [];
        if (card.owner) meta.push(`assigned: '${card.owner.replaceAll("'", "")}'`);
        const tag = card.tags[0];
        if (tag) meta.push(`ticket: '${tag.replaceAll("'", "")}'`);
        const priority = TO_MERMAID_PRIORITY[card.priority];
        if (priority) meta.push(`priority: '${priority}'`);
        const suffix = meta.length > 0 ? `@{ ${meta.join(", ")} }` : "";
        lines.push(`    c${String(ci + 1)}t${String(i + 1)}[${mermaidText(card.title)}]${suffix}`);
      });
  });
  return `${lines.join("\n")}\n`;
}
