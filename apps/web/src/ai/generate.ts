import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ENTITY_TYPES, type Diagram } from "@linework/shared";
import { ICONS } from "../library/icons";
import { todayIso } from "../gantt/model";
import { parseSimpleSpec, SPEC_COLORS } from "../share/simpleSpec";

/*
 * Optional AI chart generation, bring-your-own-key: the user's Anthropic API key is kept
 * in this browser and requests go straight from the browser to the Anthropic API. There
 * is no Linework server in the loop, so nobody else sees the key or the prompt.
 *
 * Claude returns the "simple spec" (share/simpleSpec.ts) through structured outputs, and
 * the existing spec builder lays it out, so AI charts behave like any other import.
 */

export const AI_MODEL = "claude-opus-5-5";
const KEY_STORAGE = "linework.anthropicApiKey";

export type AiChartKind = "diagram" | "flowchart" | "gantt" | "kanban" | "network";

export function loadApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function storeApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage blocked: the key is used for this request only.
  }
}

const colorEnum = z.enum(SPEC_COLORS as [string, ...string[]]);

/** Output schemas: the simple spec, minus constraints structured outputs can't express. */
const flowOutput = z.object({
  title: z.string().describe("Short chart title"),
  direction: z
    .enum(["TB", "LR"])
    .describe("TB for processes and hierarchies, LR for pipelines and timelines"),
  nodes: z.array(
    z.object({
      id: z.string().describe("Short unique id, letters and digits"),
      label: z.string().describe("Text shown on the shape; keep it under 40 characters"),
      shape: z
        .enum([
          "rectangle",
          "rounded",
          "ellipse",
          "diamond",
          "parallelogram",
          "cylinder",
          "note",
          "hexagon",
          "document",
          "cloud",
          "actor",
        ])
        .nullable()
        .describe("diamond for decisions, cylinder for data stores, rounded for steps; null for the default"),
      icon: z
        .enum(ICONS.map((i) => i.id) as [string, ...string[]])
        .nullable()
        .describe(
          "Use an icon instead of a shape for systems and actors in architecture diagrams; null otherwise",
        ),
      color: colorEnum.nullable(),
      group: z.string().nullable().describe("Nodes sharing a group name are boxed together; null for none"),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().nullable(),
      style: z.enum(["solid", "dashed", "dotted"]).nullable(),
    }),
  ),
});

const flowchartOutput = z.object({
  title: z.string().describe("Short chart title"),
  direction: z.enum(["TB", "LR"]).describe("TB for most processes; LR for wide flows with few branches"),
  lanes: z
    .array(z.string())
    .describe("Swimlanes in order, one per person, team or system; empty when the user names no roles"),
  steps: z.array(
    z.object({
      id: z.string().describe("Short unique id, letters and digits"),
      label: z.string().describe("Text on the step; start actions with a verb; under 40 characters"),
      kind: z
        .enum(["start", "end", "process", "decision", "io", "subprocess", "document", "database"])
        .describe("start and end for terminals, decision for questions, io for inputs and outputs"),
      lane: z.string().nullable().describe("One of the lanes, or null when there are no lanes"),
    }),
  ),
  links: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().nullable().describe("Branch answer such as Yes or No for links leaving a decision"),
    }),
  ),
});

const networkOutput = z.object({
  title: z.string().describe("Short chart title"),
  entities: z.array(
    z.object({
      id: z.string().describe("Short unique id, letters and digits"),
      name: z.string().describe("Name shown under the icon"),
      type: z.enum(ENTITY_TYPES),
      details: z
        .array(z.object({ key: z.string(), value: z.string() }))
        .describe("Facts the user gave about this entity, such as a number or a role; empty if none"),
    }),
  ),
  links: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().describe("Relationship, such as calls, owns, director of, met"),
      strength: z
        .enum(["confirmed", "unconfirmed", "tentative"])
        .describe("confirmed only when the user states it as fact"),
      direction: z.enum(["none", "forward", "both"]).describe("forward when the link goes from -> to"),
      date: z.string().nullable().describe("YYYY-MM-DD when the user gives a date; null otherwise"),
    }),
  ),
});

const ganttOutput = z.object({
  title: z.string(),
  skipWeekends: z.boolean().describe("true unless the user says work happens at weekends"),
  sections: z.array(
    z.object({
      name: z.string().describe("Phase or workstream"),
      color: colorEnum.nullable(),
      tasks: z.array(
        z.object({
          id: z.string().describe("Short unique id"),
          name: z.string(),
          start: z
            .string()
            .nullable()
            .describe("YYYY-MM-DD, or null to start after the previous task or dependencies"),
          days: z.number().int().describe("Duration in working days; 1 for milestones"),
          milestone: z.boolean(),
          owner: z.string().nullable(),
          progress: z.number().int().describe("Percent complete 0-100, usually 0 for a new plan"),
          after: z.array(z.string()).describe("Ids of tasks that must finish first"),
        }),
      ),
    }),
  ),
});

const kanbanOutput = z.object({
  title: z.string(),
  lanes: z
    .array(z.string())
    .describe("Swimlane names such as teams or clients; empty unless the user asks for lanes or groups"),
  columns: z.array(
    z.object({
      name: z.string().describe("Stage of work, e.g. To do, In progress, Review, Done"),
      wip: z.number().int().nullable().describe("Work-in-progress limit for busy middle columns, else null"),
      done: z.boolean().describe("true only for the column of finished work"),
      cards: z.array(
        z.object({
          title: z.string().describe("Short task, starting with a verb"),
          description: z.string().nullable(),
          owner: z.string().nullable(),
          due: z.string().nullable().describe("YYYY-MM-DD or null"),
          tags: z.array(z.string()).describe("0-3 short labels such as bug, design, backend"),
          priority: z.enum(["none", "low", "medium", "high", "urgent"]),
          lane: z.string().nullable().describe("One of lanes, or null when there are no lanes"),
        }),
      ),
    }),
  ),
});

function systemPrompt(kind: AiChartKind): string {
  const common = [
    "You design charts for Linework, a diagram and project planning tool.",
    "Turn the user's description into a clear, well-structured chart. Use their names, terms and dates.",
    "Keep labels short. Prefer 5-30 items; split very large requests into the most important parts.",
    `Today is ${todayIso()}.`,
  ];
  if (kind === "gantt") {
    return [
      ...common,
      "Produce a Gantt chart: group tasks into sections (phases or workstreams), give realistic durations, and link dependent work with `after`.",
      "Give the first task a start date (today if the user gives none) and let later tasks follow through dependencies rather than hard-coding every date.",
      "Add milestones for key checkpoints such as sign-offs and launches.",
    ].join("\n");
  }
  if (kind === "kanban") {
    return [
      ...common,
      "Produce a kanban board: 3-6 columns for the stages work moves through, left to right, ending with a Done column.",
      "Spread realistic cards across the columns, with owners, tags and priorities where they help. Only add due dates the user implies.",
      "Set WIP limits on in-progress style columns. Use swimlanes only for teams, clients or classes of work the user mentions.",
    ].join("\n");
  }
  if (kind === "network") {
    return [
      ...common,
      "Produce a network (link analysis) map: the people, organisations, phones, accounts, vehicles, places and other entities the user describes, and the relationships between them.",
      "Only include entities and links the user's description supports. Never invent personal details such as phone numbers, addresses or dates.",
      "Mark links the user states as fact as confirmed, reported ones as unconfirmed and guesses as tentative. Layout is automatic.",
      "Every link must connect existing entity ids.",
    ].join("\n");
  }
  if (kind === "flowchart") {
    return [
      ...common,
      "Produce a flowchart of one process. Layout is automatic, so don't think about positions.",
      "Begin with one start step and finish every path at an end step. Every other step must lead to a next step.",
      "Use decisions for questions, with one labelled link per answer (usually Yes and No). Loops back to earlier steps are fine.",
      "Add swimlanes only when the process involves different people, teams or systems, and put every step in a lane.",
      "Every link must connect existing step ids.",
    ].join("\n");
  }
  return [
    ...common,
    "Produce a diagram: architecture, org chart, mind map or process. Layout is automatic, so don't think about positions.",
    "Use diamonds for decisions with labelled outgoing edges (yes/no), cylinders for data stores, icons for systems, users and services in architecture diagrams, and groups for boundaries such as services, teams or environments.",
    "Every edge must connect existing node ids.",
  ].join("\n");
}

export type GenerateResult = { ok: true; diagram: Diagram } | { ok: false; error: string };

const stripNulls = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)) as Partial<T>;

/** Converts structured output into the simple spec, dropping nulls and clamping numbers. */
function toSpec(kind: AiChartKind, output: unknown): unknown {
  if (kind === "gantt") {
    const o = output as z.infer<typeof ganttOutput>;
    return {
      type: "gantt",
      ...stripNulls(o),
      sections: o.sections.map((s) => ({
        ...stripNulls(s),
        tasks: s.tasks.map((t) => ({
          ...stripNulls(t),
          days: Math.max(1, t.days),
          progress: Math.min(100, Math.max(0, t.progress)),
        })),
      })),
    };
  }
  if (kind === "kanban") {
    const o = output as z.infer<typeof kanbanOutput>;
    const lanes = o.lanes.filter((l) => l.trim() !== "");
    return {
      type: "kanban",
      title: o.title,
      ...(lanes.length > 0 ? { lanes } : {}),
      columns: o.columns.map((c) => ({
        ...stripNulls(c),
        ...(c.wip !== null && c.wip >= 1 ? { wip: Math.min(999, c.wip) } : { wip: undefined }),
        cards: c.cards.map((card) => {
          const { lane, due, tags, ...rest } = stripNulls(card);
          return {
            ...rest,
            tags: [...new Set((tags ?? []).map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 10),
            ...(due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? { due } : {}),
            ...(lane && lanes.includes(lane) ? { lane } : {}),
          };
        }),
      })),
    };
  }
  if (kind === "network") {
    const o = output as z.infer<typeof networkOutput>;
    return {
      type: "network",
      title: o.title,
      entities: o.entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        details: Object.fromEntries(
          e.details
            .filter((d) => d.key.trim() !== "")
            .slice(0, 40)
            .map((d) => [d.key.trim().slice(0, 60), d.value.slice(0, 500)]),
        ),
      })),
      links: o.links.map(({ date, ...l }) => ({
        ...l,
        label: l.label.slice(0, 200),
        ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
      })),
    };
  }
  if (kind === "flowchart") {
    const o = output as z.infer<typeof flowchartOutput>;
    const lanes = [...new Set(o.lanes.map((l) => l.trim().slice(0, 100)).filter(Boolean))].slice(0, 30);
    return {
      type: "flowchart",
      title: o.title,
      direction: o.direction,
      ...(lanes.length > 0 ? { lanes } : {}),
      nodes: o.steps.map((s) => ({
        id: s.id,
        label: s.label,
        shape: s.kind,
        ...(s.lane && lanes.includes(s.lane.trim()) ? { lane: s.lane.trim() } : {}),
      })),
      edges: o.links.map(stripNulls),
    };
  }
  const o = output as z.infer<typeof flowOutput>;
  return {
    type: "diagram",
    ...stripNulls(o),
    nodes: o.nodes.map(stripNulls),
    edges: o.edges.map(stripNulls),
  };
}

export async function generateChart(
  kind: AiChartKind,
  description: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  if (!apiKey.trim()) return { ok: false, error: "Add your Anthropic API key first" };
  // The user's own key, used only from their browser: this is the case the SDK option exists for.
  const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
  const schema =
    kind === "gantt"
      ? ganttOutput
      : kind === "kanban"
        ? kanbanOutput
        : kind === "flowchart"
          ? flowchartOutput
          : kind === "network"
            ? networkOutput
            : flowOutput;
  try {
    const response = await client.beta.messages.create(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        // Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        system: systemPrompt(kind),
        messages: [{ role: "user", content: description.slice(0, 20_000) }],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "Claude declined this request. Try describing the chart differently." };
    }
    if (response.stop_reason === "max_tokens")
      return { ok: false, error: "The chart was too big to finish. Try asking for fewer items." };
    // Check stop_reason before parsing: a refusal carries no JSON.
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "Claude's reply couldn't be read as a chart. Please try again." };
    }
    const checked = schema.safeParse(json);
    if (!checked.success)
      return { ok: false, error: "Claude's reply didn't match the chart format. Please try again." };
    const output = checked.data;

    const spec = toSpec(kind, output);
    const built = parseSimpleSpec(spec);
    return built.ok
      ? built
      : { ok: false, error: `The generated chart had a problem (${built.error}). Please try again.` };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError)
      return { ok: false, error: "That API key was rejected. Check it in the Anthropic Console." };
    if (error instanceof Anthropic.PermissionDeniedError)
      return { ok: false, error: "This API key doesn't have access to the model." };
    if (error instanceof Anthropic.RateLimitError)
      return { ok: false, error: "Rate limited by the Anthropic API. Wait a moment and try again." };
    if (error instanceof Anthropic.APIUserAbortError) return { ok: false, error: "Cancelled" };
    if (error instanceof Anthropic.APIConnectionError)
      return { ok: false, error: "Couldn't reach the Anthropic API. Check your connection." };
    if (error instanceof Anthropic.APIError)
      return { ok: false, error: `Anthropic API error ${String(error.status ?? "")}: ${error.message}` };
    return { ok: false, error: error instanceof Error ? error.message : "Generation failed" };
  }
}
