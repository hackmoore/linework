import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  KanbanCard,
  KanbanColumn,
  KanbanData,
  ShapeKind,
} from "@linework/shared";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import type { StyleId } from "../diagram/styles";
import {
  addDays,
  createGanttData,
  createSection,
  createTask,
  finishToStart,
  startOfWeek,
  todayIso,
} from "../gantt/model";
import { createCard, createColumn, createKanbanData } from "../kanban/model";
import { tidyFlowchart } from "../flowchart/layout";
import { createFlowchartData, createFlowLane, flowNodeStyle } from "../flowchart/model";
import { TEMPLATE_CATALOG, type TemplateId } from "./catalog";

type NodeOverrides = Partial<Omit<DiagramNode, "kind">>;

/** Small builder that lets templates refer to nodes by readable keys. */
class TemplateBuilder {
  readonly nodes: DiagramNode[] = [];
  readonly edges: DiagramEdge[] = [];
  private readonly byKey = new Map<string, string>();

  node(
    key: string,
    kind: ShapeKind,
    cx: number,
    cy: number,
    label: string,
    overrides: NodeOverrides = {},
  ): this {
    const node = createNode(kind, cx, cy, { label, ...overrides });
    this.byKey.set(key, node.id);
    this.nodes.push(node);
    return this;
  }

  edge(from: string, to: string, overrides: Partial<DiagramEdge> = {}): this {
    const source = this.byKey.get(from);
    const target = this.byKey.get(to);
    if (!source || !target) throw new Error(`Template edge ${from} -> ${to} references an unknown node`);
    this.edges.push(createEdge(source, target, overrides));
    return this;
  }
}

const BLUE = { fill: "#e8f0fe", stroke: "#1a56db" };
const GREEN = { fill: "#e6f4ea", stroke: "#1e7e34" };
const AMBER = { fill: "#fff4e0", stroke: "#b45309" };
const PURPLE = { fill: "#f1ebff", stroke: "#6d28d9" };
const GREY = { fill: "#f3f4f6", stroke: "#4b5563" };

/** Adds a flowchart step with the flowchart colours for its kind. */
function step(b: TemplateBuilder, key: string, kind: ShapeKind, cx: number, cy: number, label: string): void {
  b.node(key, kind, cx, cy, label, flowNodeStyle(kind));
}

const ELBOW = { routing: "elbow" } as const;

function flowchart(b: TemplateBuilder): void {
  step(b, "start", "terminal", 300, 60, "Start");
  step(b, "input", "parallelogram", 300, 180, "Receive request");
  step(b, "valid", "diamond", 300, 320, "Valid?");
  step(b, "process", "rectangle", 300, 460, "Process request");
  step(b, "reject", "rectangle", 560, 460, "Return error");
  step(b, "end", "terminal", 300, 580, "Done");
  b.edge("start", "input", ELBOW)
    .edge("input", "valid", ELBOW)
    .edge("valid", "process", { ...ELBOW, label: "Yes" })
    .edge("valid", "reject", { ...ELBOW, label: "No" })
    .edge("process", "end", ELBOW)
    .edge("reject", "end", ELBOW);
}

/** Expense approval across three lanes. Steps start in their lane's column; tidying ranks them. */
function approval(b: TemplateBuilder): void {
  const lane = (i: number): number => 130 + i * 260;
  step(b, "start", "terminal", lane(0), 0, "Start");
  step(b, "submit", "parallelogram", lane(0), 1, "Submit expense claim");
  step(b, "review", "rectangle", lane(1), 2, "Review claim");
  step(b, "ok", "diamond", lane(1), 3, "Approved?");
  step(b, "fix", "rectangle", lane(0), 4, "Fix and resubmit");
  step(b, "pay", "subroutine", lane(2), 4, "Pay expenses");
  step(b, "record", "cylinder", lane(2), 5, "Record in ledger");
  step(b, "end", "terminal", lane(2), 6, "Done");
  b.edge("start", "submit", ELBOW)
    .edge("submit", "review", ELBOW)
    .edge("review", "ok", ELBOW)
    .edge("ok", "pay", { ...ELBOW, label: "Yes" })
    .edge("ok", "fix", { ...ELBOW, label: "No" })
    .edge("fix", "review", ELBOW)
    .edge("pay", "record", ELBOW)
    .edge("record", "end", ELBOW);
}

function architecture(b: TemplateBuilder): void {
  b.node("users", "ellipse", 100, 230, "Users", GREY)
    .node("vpc", "container", 520, 230, "Cloud", { width: 560, height: 380 })
    .node("cdn", "rectangle", 330, 130, "CDN", BLUE)
    .node("api", "rounded", 520, 230, "API service", PURPLE)
    .node("worker", "rounded", 520, 360, "Worker", PURPLE)
    .node("queue", "parallelogram", 330, 360, "Queue", AMBER)
    .node("db", "cylinder", 710, 230, "Database", GREEN)
    .node("cache", "cylinder", 710, 360, "Cache", { ...GREEN, height: 90 })
    .edge("users", "cdn")
    .edge("cdn", "api", { label: "HTTPS" })
    .edge("api", "db")
    .edge("api", "queue", { strokePattern: "dashed" })
    .edge("queue", "worker", { strokePattern: "dashed" })
    .edge("worker", "cache");
}

function roadmap(b: TemplateBuilder): void {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  quarters.forEach((q, i) => {
    b.node(`q${i}`, "text", 220 + i * 200, 40, q, { fontSize: 20, textColor: "#4b5563" });
  });
  const lanes: readonly (readonly [string, typeof BLUE, readonly (readonly [number, number, string])[]])[] = [
    [
      "Product",
      BLUE,
      [
        [0, 2, "Editor MVP"],
        [2, 2, "Templates"],
      ],
    ],
    [
      "Platform",
      PURPLE,
      [
        [0, 1, "Storage"],
        [1, 2, "Cloud sync"],
        [3, 1, "Self-host kit"],
      ],
    ],
    [
      "Growth",
      GREEN,
      [
        [1, 1, "Launch"],
        [2, 2, "Community styles"],
      ],
    ],
  ];
  lanes.forEach(([name, colors, items], lane) => {
    const cy = 120 + lane * 110;
    b.node(`lane${lane}`, "text", 60, cy, name, { fontSize: 16, width: 110, textAlign: "left" });
    items.forEach(([start, span, label], i) => {
      const width = span * 200 - 20;
      b.node(`lane${lane}-${i}`, "rounded", 130 + start * 200 + 10 + width / 2, cy, label, {
        ...colors,
        width,
        height: 60,
      });
    });
  });
  b.edge("lane0-0", "lane0-1").edge("lane1-1", "lane1-2", { routing: "elbow" });
}

function orgChart(b: TemplateBuilder): void {
  b.node("lead", "rounded", 400, 60, "Project lead", PURPLE)
    .node("design", "rounded", 160, 200, "Design", BLUE)
    .node("eng", "rounded", 400, 200, "Engineering", BLUE)
    .node("qa", "rounded", 640, 200, "Quality", BLUE)
    .node("fe", "rectangle", 300, 340, "Frontend", GREY)
    .node("be", "rectangle", 500, 340, "Backend", GREY);
  for (const [from, to] of [
    ["lead", "design"],
    ["lead", "eng"],
    ["lead", "qa"],
    ["eng", "fe"],
    ["eng", "be"],
  ] as const) {
    b.edge(from, to, { routing: "elbow", arrowEnd: "none" });
  }
}

const BUILDERS: Readonly<Partial<Record<TemplateId, (b: TemplateBuilder) => void>>> = {
  architecture,
  roadmap,
  "org-chart": orgChart,
};

/** Example launch plan, dated from the start of the current week so it always looks current. */
function launchPlan(): Diagram["gantt"] {
  const monday = startOfWeek(todayIso());
  const discovery = createSection("Discovery", 0);
  const build = createSection("Build", 1);
  const launch = createSection("Launch", 2);
  const research = createTask("task", "User research", monday, 5, discovery.id, {
    progress: 100,
    owner: "Priya",
  });
  const spec = createTask("task", "Write product spec", addDays(monday, 5), 5, discovery.id, {
    progress: 60,
    owner: "Sam",
    dependencies: [finishToStart(research.id)],
  });
  const signoff = createTask("milestone", "Spec sign-off", addDays(monday, 10), 1, discovery.id, {
    dependencies: [finishToStart(spec.id)],
  });
  const design = createTask("task", "UI design", addDays(monday, 11), 7, build.id, {
    progress: 20,
    owner: "Lee",
    dependencies: [finishToStart(signoff.id)],
  });
  const api = createTask("task", "Backend API", addDays(monday, 11), 10, build.id, {
    owner: "Alex",
    dependencies: [finishToStart(signoff.id)],
  });
  const frontend = createTask("task", "Frontend", addDays(monday, 18), 10, build.id, {
    owner: "Lee",
    dependencies: [finishToStart(design.id)],
  });
  const qa = createTask("task", "QA and bug fixing", addDays(monday, 28), 5, launch.id, {
    owner: "Jo",
    dependencies: [finishToStart(api.id), finishToStart(frontend.id)],
  });
  const marketing = createTask("task", "Marketing site", addDays(monday, 21), 8, launch.id, { owner: "Kim" });
  const release = createTask("milestone", "Launch", addDays(monday, 33), 1, launch.id, {
    dependencies: [finishToStart(qa.id), finishToStart(marketing.id)],
  });
  return createGanttData(
    [discovery, build, launch],
    [research, spec, signoff, design, api, frontend, qa, marketing, release],
  );
}

/** Example sprint board, with due dates relative to today so it always looks current. */
function sprintBoard(): KanbanData {
  const today = todayIso();
  const backlog = createColumn("Backlog", 0);
  const todo = createColumn("To do", 1);
  const doing = createColumn("In progress", 2, { wipLimit: 3 });
  const review = createColumn("Review", 3, { wipLimit: 2 });
  const done = createColumn("Done", 4, { done: true });
  const card = (title: string, column: KanbanColumn, extra: Partial<KanbanCard> = {}): KanbanCard =>
    createCard(title, column.id, null, extra);
  return {
    columns: [backlog, todo, doing, review, done],
    lanes: [],
    cards: [
      card("Dark mode for the dashboard", backlog, { tags: ["feature"] }),
      card("Export reports as CSV", backlog, { tags: ["feature"], priority: "low" }),
      card("Onboarding checklist", todo, { owner: "Priya Shah", tags: ["design"], due: addDays(today, 9) }),
      card("Rate-limit the public API", todo, { owner: "Alex Kim", priority: "high", tags: ["backend"] }),
      card("Fix login timeout on Safari", doing, {
        owner: "Sam Lee",
        priority: "urgent",
        tags: ["bug"],
        due: addDays(today, 1),
        color: "#dc2626",
      }),
      card("Billing page redesign", doing, { owner: "Lee Wong", tags: ["design"], due: addDays(today, 4) }),
      card("Search suggestions", review, { owner: "Jo Park", tags: ["feature"], priority: "medium" }),
      card("Upgrade to Postgres 18", done, { owner: "Alex Kim", tags: ["backend"] }),
      card("Release notes for 2.4", done, { owner: "Kim Ito" }),
    ],
  };
}

/** Creates a fresh diagram (new ids every call) from a template. */
export function buildTemplate(templateId: TemplateId, styleId: StyleId = "professional"): Diagram {
  const info = TEMPLATE_CATALOG.find((t) => t.id === templateId);
  if (templateId === "gantt-blank" || templateId === "gantt-launch") {
    const gantt =
      templateId === "gantt-launch" ? launchPlan() : createGanttData([createSection("Phase 1", 0)]);
    const title = templateId === "gantt-launch" ? (info?.name ?? "Project plan") : "Untitled plan";
    return { ...createDiagram(title, styleId, "gantt"), gantt };
  }
  if (templateId === "kanban-blank" || templateId === "kanban") {
    const kanban = templateId === "kanban" ? sprintBoard() : createKanbanData();
    const title = templateId === "kanban" ? (info?.name ?? "Sprint board") : "Untitled board";
    return { ...createDiagram(title, styleId, "kanban"), kanban };
  }
  if (templateId === "flowchart-blank" || templateId === "flowchart" || templateId === "flowchart-approval") {
    return flowchartTemplate(templateId, styleId, info?.name ?? "Flowchart");
  }
  const title = templateId === "blank" || !info ? "Untitled diagram" : info.name;
  const diagram = createDiagram(title, styleId);
  const build = BUILDERS[templateId];
  if (!build) return diagram;
  const builder = new TemplateBuilder();
  build(builder);
  return { ...diagram, nodes: builder.nodes, edges: builder.edges };
}

function flowchartTemplate(
  templateId: "flowchart-blank" | "flowchart" | "flowchart-approval",
  styleId: StyleId,
  name: string,
): Diagram {
  const diagram = createDiagram(
    templateId === "flowchart-blank" ? "Untitled flowchart" : name,
    styleId,
    "flowchart",
  );
  if (templateId === "flowchart-blank") return diagram;
  const builder = new TemplateBuilder();
  if (templateId === "flowchart") {
    flowchart(builder);
    return tidyFlowchart({ ...diagram, nodes: builder.nodes, edges: builder.edges });
  }
  approval(builder);
  const lanes = ["Employee", "Manager", "Finance"].map((laneName, i) => createFlowLane(laneName, i, 260));
  return tidyFlowchart({
    ...diagram,
    nodes: builder.nodes,
    edges: builder.edges,
    flowchart: { ...createFlowchartData("TB"), lanes },
  });
}
