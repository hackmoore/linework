import type { ChartType } from "@linework/shared";

export const TEMPLATE_IDS = [
  "blank",
  "flowchart",
  "architecture",
  "kanban",
  "roadmap",
  "org-chart",
  "gantt-blank",
  "gantt-launch",
  "kanban-blank",
  "flowchart-blank",
  "flowchart-approval",
  "network-blank",
  "network-investigation",
  "roadmap-blank",
  "architecture-blank",
  "er",
  "er-blank",
  "org-blank",
  "mindmap",
  "mindmap-blank",
  "class",
  "class-blank",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type TemplateCategory = "General" | "Software design" | "Project management";

export interface TemplateInfo {
  readonly id: TemplateId;
  readonly chartType: ChartType;
  readonly name: string;
  readonly description: string;
  readonly category: TemplateCategory;
  /** Blank starting points are offered in the chart type picker, not the home page gallery. */
  readonly blank: boolean;
}

export const TEMPLATE_CATALOG: readonly TemplateInfo[] = [
  {
    id: "blank",
    chartType: "freeform",
    name: "Blank canvas",
    description: "Start from nothing.",
    category: "General",
    blank: true,
  },
  {
    id: "gantt-blank",
    chartType: "gantt",
    name: "Blank plan",
    description: "One empty section, ready for your tasks.",
    category: "Project management",
    blank: true,
  },
  {
    id: "gantt-launch",
    chartType: "gantt",
    name: "Product launch plan",
    description: "Phases, owners, dependencies and a launch milestone.",
    category: "Project management",
    blank: false,
  },
  {
    id: "kanban-blank",
    chartType: "kanban",
    name: "Blank board",
    description: "To do, In progress and Done columns, ready for cards.",
    category: "Project management",
    blank: true,
  },
  {
    id: "kanban",
    chartType: "kanban",
    name: "Sprint board",
    description: "Backlog to done, with WIP limits, owners, due dates and tags.",
    category: "Project management",
    blank: false,
  },
  {
    id: "flowchart-blank",
    chartType: "flowchart",
    name: "Blank flowchart",
    description: "An empty flowchart, read top to bottom.",
    category: "Software design",
    blank: true,
  },
  {
    id: "flowchart",
    chartType: "flowchart",
    name: "Request handling",
    description: "Start, steps, a yes/no decision and an end.",
    category: "Software design",
    blank: false,
  },
  {
    id: "flowchart-approval",
    chartType: "flowchart",
    name: "Expense approval",
    description: "A process across swimlanes for the employee, manager and finance.",
    category: "Project management",
    blank: false,
  },
  {
    id: "network-blank",
    chartType: "network",
    name: "Blank network map",
    description: "An empty map, ready for entities and links.",
    category: "General",
    blank: true,
  },
  {
    id: "network-investigation",
    chartType: "network",
    name: "Investigation map",
    description: "People, companies, phones, an account and a vehicle, linked with dates and confidence.",
    category: "General",
    blank: false,
  },
  {
    id: "architecture",
    chartType: "architecture",
    name: "System architecture",
    description: "A C4 container diagram: an online shop's apps, services and database, and who uses them.",
    category: "Software design",
    blank: false,
  },
  {
    id: "er",
    chartType: "er",
    name: "Online shop database",
    description: "Customers, addresses, orders and products, with keys and crow's foot relationships.",
    category: "Software design",
    blank: false,
  },
  {
    id: "er-blank",
    chartType: "er",
    name: "Blank entity-relationship diagram",
    description: "An empty schema, ready for tables.",
    category: "Software design",
    blank: true,
  },
  {
    id: "architecture-blank",
    chartType: "architecture",
    name: "Blank architecture diagram",
    description: "An empty C4 diagram, ready for people, systems and containers.",
    category: "Software design",
    blank: true,
  },

  {
    id: "roadmap-blank",
    chartType: "roadmap",
    name: "Blank roadmap",
    description: "Two empty lanes on a monthly timeline.",
    category: "Project management",
    blank: true,
  },
  {
    id: "roadmap",
    chartType: "roadmap",
    name: "Product roadmap",
    description: "Lanes for product, platform and growth over the next few quarters, with milestones.",
    category: "Project management",
    blank: false,
  },
  {
    id: "org-chart",
    chartType: "org",
    name: "Company org chart",
    description:
      "A small product company: leadership, engineering, design and operations, with an open role.",
    category: "Project management",
    blank: false,
  },
  {
    id: "class",
    chartType: "class",
    name: "Order domain model",
    description:
      "UML classes for orders, products and payment methods, with an interface and an enumeration.",
    category: "Software design",
    blank: false,
  },
  {
    id: "class-blank",
    chartType: "class",
    name: "Blank class diagram",
    description: "An empty UML class diagram.",
    category: "Software design",
    blank: true,
  },
  {
    id: "mindmap",
    chartType: "mindmap",
    name: "Launch brainstorm",
    description: "A mind map of a product launch: audience, message, channels, timeline, success and risks.",
    category: "General",
    blank: false,
  },
  {
    id: "mindmap-blank",
    chartType: "mindmap",
    name: "Blank mind map",
    description: "A central topic, ready to branch out from.",
    category: "General",
    blank: true,
  },
  {
    id: "org-blank",
    chartType: "org",
    name: "Blank org chart",
    description: "An empty org chart, ready for the first person.",
    category: "Project management",
    blank: true,
  },
];

export function isTemplateId(value: string | null): value is TemplateId {
  return value !== null && (TEMPLATE_IDS as readonly string[]).includes(value);
}

export function templatesFor(chartType: ChartType): TemplateInfo[] {
  return TEMPLATE_CATALOG.filter((t) => t.chartType === chartType);
}
