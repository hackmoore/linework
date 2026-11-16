import { parseDiagram, SHAPE_KINDS, type Diagram, type ShapeKind } from "@linework/shared";
import { createEdge, createId, createLayer, createNode } from "../diagram/factory";
import { tidyFlowchart } from "../flowchart/layout";
import { createFlowLane, flowEdgeDefaults, flowIssues, flowNodeStyle } from "../flowchart/model";
import { createSection, createTask, todayIso } from "../gantt/model";
import { autoSchedule, calendarOf } from "../gantt/schedule";
import { createCard, createColumn, createLane } from "../kanban/model";
import { kindModel } from "../kinds/registry";
import { layoutNetwork } from "../network/layout";
import { boundsOf } from "../render/geometry";
import { createRoadmapItem, createRoadmapLane } from "../roadmap/model";
import {
  sequenceIssues,
  createElse,
  createEnd,
  createFragment,
  createMessage,
  createNote,
  createParticipant,
} from "../sequence/model";
import { importText } from "../share/importText";
import { usableLayerId } from "../editor/store";
import { applyPatch, COLLECTIONS, SETTABLE_KEYS, type CollectionName, type CollectionPatch } from "./patch";

/*
 * Commands an AI agent sends to the tab that turned on "Share with AI". The agent's
 * command-line client (agent/cli.ts) joins the encrypted live session like any other peer;
 * this tab runs its commands against the open chart and commits the result, so the edit
 * shows up on screen, can be undone and reaches everyone else in the session as a patch.
 *
 * The command reference for agents is the help text in agent/cli.ts. Keep them in sync.
 */

export type AgentCommand =
  | { readonly op: "get" }
  | {
      readonly op: "edit";
      readonly set?: Readonly<Record<string, unknown>>;
      readonly upsert?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
      readonly remove?: Readonly<Record<string, readonly string[]>>;
      readonly order?: Readonly<Record<string, readonly string[]>>;
    }
  | { readonly op: "replace"; readonly text: string }
  | { readonly op: "tidy"; readonly direction?: "TB" | "LR" };

export type AgentOutcome =
  | {
      readonly ok: true;
      /** The new document, or null when the command changed nothing. */
      readonly next: Diagram | null;
      readonly reply: Readonly<Record<string, unknown>>;
      /** Ids the command added or changed, shown to collaborators as the agent's selection. */
      readonly touched: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

type Item = Record<string, unknown>;

const fail = (error: string): AgentOutcome => ({ ok: false, error });
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function collectionItems(d: Diagram, name: CollectionName): readonly Item[] {
  const [group, key] = name.split(".") as [string, string | undefined];
  const source = key
    ? (d as unknown as Record<string, Record<string, unknown> | undefined>)[group]?.[key]
    : d[group as "nodes"];
  return Array.isArray(source) ? (source as Item[]) : [];
}

/** A complete new item for a collection, from the fields the agent gave. */
function newItem(d: Diagram, name: CollectionName, input: Item, placed: { y: number }): Item {
  const id = str(input.id, createId());
  const withInput = (base: object): Item => ({ ...base, ...input, id });
  switch (name) {
    case "nodes": {
      const kind: ShapeKind = SHAPE_KINDS.includes(input.kind as ShapeKind)
        ? (input.kind as ShapeKind)
        : "rectangle";
      const style =
        d.chartType === "flowchart" ? flowNodeStyle(kind) : (kindModel(d.chartType)?.nodeStyle?.(kind) ?? {});
      const node = createNode(kind, 0, 0, { ...style, layerId: usableLayerId(d, null) ?? "layer-1" });
      // Without a position, stack new shapes to the right of everything else.
      if (num(input.x) === undefined || num(input.y) === undefined) {
        const bounds = boundsOf(d.nodes);
        const x = bounds ? bounds.x + bounds.width + 80 : 0;
        const y = (bounds?.y ?? 0) + placed.y;
        placed.y += node.height + 40;
        return withInput({ ...node, x, y });
      }
      return withInput(node);
    }
    case "edges": {
      const source = str(input.source, "");
      const target = str(input.target, "");
      const defaults =
        d.chartType === "flowchart"
          ? flowEdgeDefaults(d, source)
          : (kindModel(d.chartType)?.edgeDefaults?.(d, source, target) ?? {});
      return withInput(createEdge(source, target, defaults));
    }
    case "layers":
      return withInput(createLayer(str(input.name, "Layer")));
    case "gantt.tasks":
      return withInput(
        createTask(
          input.kind === "milestone" ? "milestone" : "task",
          str(input.name, "Task"),
          str(input.start, todayIso()),
          5,
          null,
        ),
      );
    case "gantt.sections":
      return withInput(createSection(str(input.name, "Section"), d.gantt?.sections.length ?? 0));
    case "kanban.columns":
      return withInput(createColumn(str(input.name, "Column"), d.kanban?.columns.length ?? 0));
    case "kanban.lanes":
      return withInput(createLane(str(input.name, "Lane")));
    case "kanban.cards":
      return withInput(createCard(str(input.title, "Card"), d.kanban?.columns[0]?.id ?? ""));
    case "flowchart.lanes":
      return withInput(createFlowLane(str(input.name, "Lane"), d.flowchart?.lanes.length ?? 0));
    case "roadmap.lanes":
      return withInput(createRoadmapLane(str(input.name, "Lane"), d.roadmap?.lanes.length ?? 0));
    case "roadmap.items":
      return withInput(
        createRoadmapItem(
          str(input.title, "Item"),
          d.roadmap?.lanes[0]?.id ?? "",
          str(input.start, todayIso()),
          30,
          {
            kind: input.kind === "milestone" ? "milestone" : "item",
          },
        ),
      );
    case "sequence.participants":
      return withInput(
        createParticipant(str(input.name, "Participant"), d.sequence?.participants.length ?? 0),
      );
    case "sequence.steps": {
      const first = d.sequence?.participants[0]?.id ?? "";
      switch (input.type) {
        case "note":
          return withInput(createNote([first], "", "right"));
        case "fragment":
          return withInput(createFragment("loop", ""));
        case "else":
          return withInput(createElse(""));
        case "end":
          return withInput(createEnd());
        default:
          return withInput(createMessage(first, first, ""));
      }
    }
    default:
      // network.entities, network.links and comments: the agent supplies every field.
      return { ...input, id };
  }
}

function runEdit(d: Diagram, cmd: Extract<AgentCommand, { op: "edit" }>): AgentOutcome {
  const set = cmd.set ?? {};
  if (!isRecord(set)) return fail("`set` must be an object");
  const badKey = Object.keys(set).find((k) => !SETTABLE_KEYS.includes(k));
  if (badKey) return fail(`Can't set "${badKey}". Settable keys: ${SETTABLE_KEYS.join(", ")}`);
  const groups = { upsert: cmd.upsert ?? {}, remove: cmd.remove ?? {}, order: cmd.order ?? {} };
  for (const [label, group] of Object.entries(groups)) {
    if (!isRecord(group)) return fail(`\`${label}\` must be an object keyed by collection name`);
    const bad = Object.keys(group).find((k) => !COLLECTIONS.includes(k as CollectionName));
    if (bad) return fail(`Unknown collection "${bad}". Collections: ${COLLECTIONS.join(", ")}`);
  }
  const touched: string[] = [];
  const collections: Record<string, CollectionPatch> = {};
  for (const name of COLLECTIONS) {
    const upserts: unknown = groups.upsert[name] ?? [];
    const removes: unknown = groups.remove[name] ?? [];
    const order: unknown = groups.order[name];
    if (!Array.isArray(upserts) || !upserts.every(isRecord))
      return fail(`upsert.${name} must be an array of objects`);
    if (!Array.isArray(removes) || !removes.every((id) => typeof id === "string"))
      return fail(`remove.${name} must be an array of ids`);
    if (order !== undefined && (!Array.isArray(order) || !order.every((id) => typeof id === "string")))
      return fail(`order.${name} must be an array of ids`);
    if (upserts.length === 0 && removes.length === 0 && order === undefined) continue;
    const existing = new Map(collectionItems(d, name).map((i) => [i.id, i]));
    const placed = { y: 0 };
    const upsert = upserts.map((input) => {
      const current = typeof input.id === "string" ? existing.get(input.id) : undefined;
      // Existing items take only the fields given; new ones start from sensible defaults.
      const item = current ? { ...current, ...input } : newItem(d, name, input, placed);
      touched.push(item.id as string);
      return item as { id: string };
    });
    collections[name] = { upsert, remove: removes, ...(order ? { order } : {}) };
  }
  let next = applyPatch(d, { set, collections });
  if (next.gantt?.autoSchedule) {
    next = {
      ...next,
      gantt: { ...next.gantt, tasks: autoSchedule(next.gantt.tasks, calendarOf(next.gantt)) },
    };
  }
  const parsed = parseDiagram(next);
  if (!parsed.ok) return fail(`The edit would make the chart invalid: ${parsed.error}`);
  return { ok: true, next: parsed.value, reply: { ok: true, touched }, touched };
}

function runReplace(d: Diagram, text: unknown): AgentOutcome {
  if (typeof text !== "string") return fail("`text` must be a string");
  const result = importText(text);
  if (!result.ok) return fail(result.error);
  // Keep this document's identity so autosave and the live session carry on.
  const next: Diagram = { ...result.diagram, id: d.id, createdAt: d.createdAt };
  return {
    ok: true,
    next,
    reply: { ok: true, chartType: next.chartType, title: next.title },
    touched: [],
  };
}

function runTidy(d: Diagram, direction: unknown): AgentOutcome {
  const dir = direction === "TB" || direction === "LR" ? direction : undefined;
  let next: Diagram | null = null;
  if (d.chartType === "flowchart") next = tidyFlowchart(d);
  else if (d.chartType === "network") next = layoutNetwork(d, dir ? "hierarchy" : "organic");
  else {
    const tidy = kindModel(d.chartType)?.tidy;
    if (tidy) next = tidy(d, dir);
  }
  if (!next) return fail(`Charts of type "${d.chartType}" lay themselves out; tidy isn't needed`);
  return { ok: true, next, reply: { ok: true }, touched: [] };
}

/** The warnings the editor shows under Checks, so the agent can fix what it got wrong. */
export function chartIssues(d: Diagram): string[] {
  if (d.chartType === "flowchart") return flowIssues(d).map((i) => i.message);
  if (d.chartType === "sequence" && d.sequence) return sequenceIssues(d.sequence).map((i) => i.message);
  return (kindModel(d.chartType)?.checks?.(d) ?? []).map((i) => i.message);
}

const withIssues = (outcome: AgentOutcome): AgentOutcome =>
  outcome.ok && outcome.next
    ? { ...outcome, reply: { ...outcome.reply, issues: chartIssues(outcome.next) } }
    : outcome;

/** Runs one agent command against a document. Pure: the caller commits `next`. */
export function runAgentCommand(d: Diagram, command: unknown): AgentOutcome {
  if (!isRecord(command)) return fail("A command must be an object with an `op`");
  switch (command.op) {
    case "get":
      return { ok: true, next: null, reply: { ok: true, chart: d, issues: chartIssues(d) }, touched: [] };
    case "edit":
      return withIssues(runEdit(d, command as Extract<AgentCommand, { op: "edit" }>));
    case "replace":
      return withIssues(runReplace(d, command.text));
    case "tidy":
      return withIssues(runTidy(d, command.direction));
    default:
      return fail(`Unknown op "${String(command.op)}". Ops: get, edit, replace, tidy`);
  }
}
