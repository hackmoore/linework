import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  KanbanCard,
  KanbanColumn,
  KanbanData,
  RoadmapData,
  RoadmapItem,
  ShapeKind,
} from "@linework/shared";
import { architectureTemplate } from "../architecture/templates";
import { erTemplate } from "../er/templates";
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
import { parseSimpleSpec } from "../share/simpleSpec";
import { createRoadmapData, createRoadmapItem, createRoadmapLane, monthStart } from "../roadmap/model";
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
  if (templateId === "roadmap-blank" || templateId === "roadmap") {
    const data = templateId === "roadmap" ? productRoadmap() : createRoadmapData();
    const title = templateId === "roadmap" ? (info?.name ?? "Product roadmap") : "Untitled roadmap";
    return { ...createDiagram(title, styleId, "roadmap"), roadmap: data };
  }
  if (templateId === "network-blank" || templateId === "network-investigation") {
    return networkTemplate(templateId, styleId, info?.name ?? "Network map");
  }
  if (templateId === "er" || templateId === "er-blank") {
    return erTemplate(styleId, info?.name ?? "Database", templateId === "er-blank");
  }
  if (templateId === "architecture" || templateId === "architecture-blank") {
    return architectureTemplate(
      styleId,
      info?.name ?? "System architecture",
      templateId === "architecture-blank",
    );
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

/** A fictional investigation: every name, number and company here is made up. */
const INVESTIGATION = {
  type: "network",
  entities: [
    { id: "alex", name: "Alex Mercer", type: "person", details: { Role: "Director" } },
    { id: "jo", name: "Jo Tanaka", type: "person", details: { Role: "Accountant" } },
    { id: "sam", name: "Sam Okafor", type: "person" },
    { id: "northgate", name: "Northgate Trading Ltd", type: "organisation", details: { Country: "UK" } },
    { id: "bluefin", name: "Bluefin Holdings", type: "organisation", details: { Country: "Cyprus" } },
    { id: "phone1", name: "07700 900123", type: "phone", details: { Network: "Example Mobile" } },
    { id: "phone2", name: "07700 900456", type: "phone" },
    { id: "acct", name: "Account ending 4417", type: "account", details: { Bank: "Example Bank" } },
    { id: "van", name: "White van AB12 CDE", type: "vehicle", details: { Make: "Example Motors" } },
    { id: "unit", name: "Unit 7, Harbour Road", type: "location" },
  ],
  links: [
    { from: "alex", to: "northgate", label: "director of", date: "2024-02-01" },
    { from: "alex", to: "bluefin", label: "shareholder of", strength: "unconfirmed" },
    { from: "jo", to: "northgate", label: "accountant for" },
    { from: "alex", to: "phone1", label: "uses" },
    { from: "sam", to: "phone2", label: "uses", strength: "unconfirmed" },
    {
      from: "phone1",
      to: "phone2",
      label: "calls ×14",
      direction: "forward",
      date: "2025-01-06",
      endDate: "2025-03-28",
    },
    { from: "northgate", to: "acct", label: "holds" },
    { from: "acct", to: "bluefin", label: "pays", direction: "forward", date: "2025-02-14" },
    { from: "van", to: "northgate", label: "registered to" },
    { from: "sam", to: "van", label: "seen driving", strength: "tentative", date: "2025-03-02" },
    { from: "van", to: "unit", label: "parked at", strength: "unconfirmed" },
    { from: "northgate", to: "unit", label: "leases" },
  ],
} as const;

function networkTemplate(
  templateId: "network-blank" | "network-investigation",
  styleId: StyleId,
  name: string,
): Diagram {
  if (templateId === "network-blank") return createDiagram("Untitled network", styleId, "network");
  const built = parseSimpleSpec({ ...INVESTIGATION, title: name, style: styleId });
  if (!built.ok) throw new Error(built.error);
  return built.diagram;
}

/** Example product roadmap, dated from the start of last month so it always looks current. */
function productRoadmap(): RoadmapData {
  const base = monthStart(addDays(monthStart(todayIso()), -1));
  const month = (n: number): string => {
    const [y = 2026, m = 1] = base.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 10);
  };
  const lanes = [
    createRoadmapLane("Product", 0),
    createRoadmapLane("Platform", 2),
    createRoadmapLane("Growth", 1),
  ];
  const [product, platform, growth] = lanes.map((l) => l.id) as [string, string, string];
  const item = (
    title: string,
    laneId: string,
    from: number,
    months: number,
    status: RoadmapItem["status"],
    owner = "",
  ): RoadmapItem =>
    createRoadmapItem(title, laneId, month(from), 1, {
      end: addDays(month(from + months), -1),
      status,
      owner,
    });
  const milestone = (
    title: string,
    laneId: string,
    at: number,
    status: RoadmapItem["status"] = "planned",
  ): RoadmapItem =>
    createRoadmapItem(title, laneId, addDays(month(at), 14), 1, { kind: "milestone", status });
  return {
    ...createRoadmapData(),
    scale: "month",
    lanes,
    items: [
      item("Editor redesign", product, 0, 3, "in-progress", "Priya"),
      item("Templates gallery", product, 3, 2, "planned", "Lee"),
      item("Mobile viewer", product, 5, 3, "planned"),
      milestone("Public beta", product, 3),
      item("Storage migration", platform, 0, 2, "done", "Sam"),
      item("Real-time sync", platform, 2, 3, "at-risk", "Sam"),
      item("Self-hosting kit", platform, 5, 2, "planned"),
      item("Launch campaign", growth, 2, 2, "planned", "Alex"),
      item("Community programme", growth, 4, 4, "planned"),
      milestone("1.0 launch", growth, 4),
    ],
  };
}
