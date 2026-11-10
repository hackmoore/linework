import {
  ENTITY_TYPES,
  isValidIsoDate,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type EntityType,
  type NetworkEntity,
  type NetworkLink,
  type StrokePattern,
} from "@linework/shared";
import { createDiagram, createEdge } from "../diagram/factory";
import { csvCell, normaliseDate, parseCsv } from "../gantt/io";
import { layoutNetwork } from "./layout";
import { createEntityNode, ENTITY_INFO, entityOf, isEntityNode, linkOf, STRENGTHS } from "./model";

/*
 * CSV for network maps: one row per link, as exported from call records, bank statements,
 * company registers or a spreadsheet. Entities are created from the names in the from and
 * to columns.
 */

const HEADERS = {
  from: ["from", "source", "a", "a party", "a-party", "caller", "from entity", "entity 1", "subject"],
  to: ["to", "target", "b", "b party", "b-party", "callee", "recipient", "to entity", "entity 2", "object"],
  type: ["type", "link", "link type", "relationship", "relation", "label", "event"],
  date: ["date", "start", "start date", "from date", "when", "timestamp", "time"],
  endDate: ["end", "end date", "to date", "until"],
  fromType: ["from type", "source type", "a type", "type 1", "entity 1 type"],
  toType: ["to type", "target type", "b type", "type 2", "entity 2 type"],
  strength: ["strength", "confidence", "certainty", "how sure"],
} as const;

function columnIndex(header: readonly string[], names: readonly string[]): number {
  return header.findIndex((h) => names.includes(h));
}

function readHeader(text: string): string[] {
  return parseCsv(text.split(/\r?\n/, 1)[0] ?? "")[0]?.map((h) => h.trim().toLowerCase()) ?? [];
}

/** A CSV of links: it has both a from and a to column. */
export function isNetworkCsv(text: string): boolean {
  const header = readHeader(text);
  return columnIndex(header, HEADERS.from) >= 0 && columnIndex(header, HEADERS.to) >= 0;
}

function parseType(value: string): EntityType | null {
  const v = value.trim().toLowerCase();
  if ((ENTITY_TYPES as readonly string[]).includes(v)) return v as EntityType;
  const byLabel = ENTITY_TYPES.find((t) => ENTITY_INFO[t].label.toLowerCase() === v);
  if (byLabel) return byLabel;
  if (/^(company|business|org|organization|firm)$/.test(v)) return "organisation";
  if (/^(telephone|mobile|number|msisdn)$/.test(v)) return "phone";
  if (/^(bank account|iban|card)$/.test(v)) return "account";
  if (/^(car|van|truck)$/.test(v)) return "vehicle";
  if (/^(address|place|site)$/.test(v)) return "location";
  if (/^(url|domain|site url)$/.test(v)) return "website";
  return null;
}

/** Best guess from the name itself, for files without type columns. */
function guessType(name: string): EntityType {
  const v = name.trim();
  if (/^\S+@\S+\.\S+$/.test(v)) return "email";
  if (/^(https?:\/\/|www\.)/i.test(v)) return "website";
  if (/^\+?[\d\s().-]{7,}$/.test(v) && /\d{6,}/.test(v.replace(/\D/g, ""))) return "phone";
  return "other";
}

function parseStrength(value: string): StrokePattern {
  const v = value.trim().toLowerCase();
  if (/^(unconfirmed|reported|possible|medium)$/.test(v)) return "dashed";
  if (/^(tentative|suspected|inferred|low|weak)$/.test(v)) return "dotted";
  return "solid";
}

export type NetworkImportResult =
  { ok: true; diagram: Diagram; skipped: number } | { ok: false; error: string };

/**
 * Builds a network map from a CSV of links. Repeated links between the same two entities
 * with the same type become one link, labelled with a count ("calls ×12") and spanning the
 * first to the last date.
 */
export function importLinksCsv(text: string, title = "Imported network"): NetworkImportResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([key, names]) => [key, columnIndex(header, names)]),
  ) as Record<keyof typeof HEADERS, number>;
  if (col.from < 0 || col.to < 0) return { ok: false, error: "The CSV needs From and To columns" };
  const base = createDiagram(title, "professional", "network");
  const layerId = base.layers[0]?.id ?? "layer-1";
  const nodesByName = new Map<string, DiagramNode>();
  const entities = new Map<string, NetworkEntity>();
  const entity = (name: string, typeText: string): DiagramNode => {
    const key = name.trim().toLowerCase();
    const known = nodesByName.get(key);
    if (known) return known;
    const type = parseType(typeText) ?? guessType(name);
    const node = createEntityNode(type, name.trim().slice(0, 200), 0, 0, layerId);
    nodesByName.set(key, node);
    entities.set(node.id, { id: node.id, type, attributes: [], notes: "" });
    return node;
  };
  interface Group {
    source: string;
    target: string;
    type: string;
    pattern: StrokePattern;
    count: number;
    first: string | null;
    last: string | null;
  }
  const groups = new Map<string, Group>();
  let skipped = 0;
  const cell = (row: readonly string[], index: number): string =>
    index >= 0 ? (row[index] ?? "").trim() : "";
  for (const row of rows.slice(1)) {
    const from = cell(row, col.from);
    const to = cell(row, col.to);
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) {
      skipped++;
      continue;
    }
    const source = entity(from, cell(row, col.fromType));
    const target = entity(to, cell(row, col.toType));
    const type = cell(row, col.type).slice(0, 150);
    const date = normaliseDate(cell(row, col.date).slice(0, 10)) ?? normaliseDate(cell(row, col.date));
    const end = normaliseDate(cell(row, col.endDate));
    const key = `${source.id}\u0000${target.id}\u0000${type.toLowerCase()}`;
    const group = groups.get(key) ?? {
      source: source.id,
      target: target.id,
      type,
      pattern: parseStrength(cell(row, col.strength)),
      count: 0,
      first: null,
      last: null,
    };
    group.count++;
    for (const d of [date, end]) {
      if (!d || !isValidIsoDate(d)) continue;
      if (!group.first || d < group.first) group.first = d;
      if (!group.last || d > group.last) group.last = d;
    }
    groups.set(key, group);
  }
  if (groups.size === 0) return { ok: false, error: "No links found in the CSV" };
  if (nodesByName.size > 5_000) return { ok: false, error: "A network map can hold 5,000 entities" };
  const edges: DiagramEdge[] = [];
  const links: NetworkLink[] = [];
  for (const g of [...groups.values()].slice(0, 10_000)) {
    const label = g.count > 1 ? `${g.type || "linked"} ×${String(g.count)}` : g.type;
    const edge = createEdge(g.source, g.target, {
      label,
      strokePattern: g.pattern,
      // Records have a direction: who called, who paid.
      arrowEnd: "arrow",
    });
    edges.push(edge);
    if (g.first) links.push({ id: edge.id, date: g.first, endDate: g.last !== g.first ? g.last : null });
  }
  const diagram = layoutNetwork(
    {
      ...base,
      nodes: [...nodesByName.values()],
      edges,
      network: { entities: [...entities.values()], links },
    },
    "organic",
  );
  return { ok: true, diagram, skipped };
}

/** One row per link, with both ends' types, so the file imports back into the same map. */
export function linksToCsv(diagram: Diagram): string {
  const byId = new Map(diagram.nodes.filter(isEntityNode).map((n) => [n.id, n]));
  const strength = new Map(STRENGTHS.map(([p, label]) => [p, label]));
  const lines = [["From", "From type", "To", "To type", "Type", "Strength", "Date", "End date"].join(",")];
  for (const e of diagram.edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    // A link drawn pointing backwards is written the way it points.
    const [from, to] = e.arrowStart !== "none" && e.arrowEnd === "none" ? [b, a] : [a, b];
    const link = linkOf(diagram, e);
    lines.push(
      [
        from.label,
        ENTITY_INFO[entityOf(diagram, from).type].label,
        to.label,
        ENTITY_INFO[entityOf(diagram, to).type].label,
        e.label,
        strength.get(e.strokePattern) ?? "Confirmed",
        link.date ?? "",
        link.endDate ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
