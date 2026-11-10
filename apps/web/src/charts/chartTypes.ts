import type { ChartType } from "@linework/shared";

export interface ChartObjectInfo {
  readonly name: string;
  readonly description: string;
}

/** What the picker and in-editor help say about a chart type. */
export interface ChartTypeInfo {
  readonly id: ChartType;
  readonly name: string;
  readonly tagline: string;
  readonly bestFor: readonly string[];
  readonly objects: readonly ChartObjectInfo[];
  readonly tips: readonly string[];
  /** What the chart is made of, singular and plural, e.g. "task" and "tasks". */
  readonly item: readonly [string, string];
}

export const CHART_TYPE_INFO: Readonly<Record<ChartType, ChartTypeInfo>> = {
  gantt: {
    id: "gantt",
    name: "Gantt chart",
    tagline: "Plan work over time, with dates, progress and dependencies.",
    bestFor: ["Project schedules", "Release plans", "Showing who works on what, and when"],
    objects: [
      { name: "Section", description: "A phase or workstream that groups related tasks." },
      { name: "Task", description: "Work with a start date, an end date, an owner and percent complete." },
      { name: "Milestone", description: "A single-day checkpoint, such as a launch or a sign-off." },
      { name: "Dependency", description: "A link meaning one task can only start after another ends." },
    ],
    tips: [
      "Drag a bar to reschedule it. Drag its left or right edge to change its dates.",
      "Drag the dot at the end of a bar onto another bar to add a dependency.",
      "With auto-schedule on, moving a task later pushes the tasks that depend on it.",
      "Keep tasks between a few days and two weeks long. Split longer work into smaller tasks.",
      "Switch the timescale between days, weeks and months to zoom the timeline.",
    ],
    item: ["task", "tasks"],
  },
  kanban: {
    id: "kanban",
    name: "Kanban board",
    tagline: "Track work as cards moving through columns, from to do to done.",
    bestFor: ["Team task boards", "Sprint and support queues", "Content and hiring pipelines"],
    objects: [
      { name: "Column", description: "A stage of work, such as To do, In progress or Done." },
      {
        name: "WIP limit",
        description: "The most cards a column should hold. The column turns red when it has too many.",
      },
      { name: "Card", description: "One piece of work, with an owner, due date, tags and priority." },
      {
        name: "Swimlane",
        description: "A row across every column for a team, client or class of work.",
      },
    ],
    tips: [
      "Drag cards between columns and lanes, or use the arrow buttons on the selected card.",
      "Set WIP limits on busy columns so work gets finished before more is started.",
      "Mark the last column as Done so finished cards are never shown as overdue.",
      "Type in Filter to find cards by title, owner or tag.",
      "Keep card titles short and start them with a verb, like 'Fix login timeout'.",
    ],
    item: ["card", "cards"],
  },
  roadmap: {
    id: "roadmap",
    name: "Roadmap",
    tagline: "Show what is planned when, by team or theme, at a glance.",
    bestFor: [
      "Product and technology roadmaps",
      "Quarterly plans for leadership",
      "Release and launch timelines",
    ],
    objects: [
      { name: "Lane", description: "A row for a team, product area, theme or goal." },
      {
        name: "Item",
        description: "A piece of work shown as a bar from its start to its end, with a status and owner.",
      },
      {
        name: "Milestone",
        description: "A single date that matters, such as a launch, a review or a deadline.",
      },
      {
        name: "Status",
        description:
          "Planned items are outlined, in-progress items are solid, done items fade and at-risk items turn red.",
      },
    ],
    tips: [
      "Double-click a lane at a date to add an item there. Drag bars to move them, and drag their ends to change dates.",
      "Drag a bar up or down to move it to another lane.",
      "Zoom between weeks, months and quarters. Set the financial year in the panel to label quarters FY.",
      "Keep item titles to outcomes people recognise, like 'Self-serve billing', not task names.",
      "Need dependencies and day-by-day dates? Use a Gantt chart instead.",
    ],
    item: ["item", "items"],
  },
  flowchart: {
    id: "flowchart",
    name: "Flowchart",
    tagline: "Show a process step by step, with decisions and who does what.",
    bestFor: [
      "Business processes and approvals",
      "Algorithms and program logic",
      "Support and onboarding flows",
    ],
    objects: [
      { name: "Start / end", description: "Where the process begins and where each path finishes." },
      {
        name: "Step",
        description: "Something that happens. Start the label with a verb, like 'Send invoice'.",
      },
      {
        name: "Decision",
        description:
          "A question with two or more answers. Each branch leaving it is labelled, like Yes and No.",
      },
      { name: "Input / output", description: "Data coming in or going out, such as a form or a report." },
      { name: "Subprocess", description: "A step that has its own, separate flowchart." },
      {
        name: "Swimlane",
        description: "A band for one person, team or system. A step belongs to the lane it sits in.",
      },
    ],
    tips: [
      "Select a step and press Tab to add the next one, already connected.",
      "Drag the dot on a shape's edge to another shape to connect them. Branches leaving a decision are labelled Yes and No for you.",
      "Tidy up lays the chart out along its direction and keeps each step in its lane.",
      "Checks lists steps that can't be reached, decisions without labelled branches and steps that lead nowhere.",
      "Keep one flowchart to one process. Use a Subprocess step to point to another chart.",
    ],
    item: ["step", "steps"],
  },
  network: {
    id: "network",
    name: "Network map",
    tagline: "Map people, organisations and the links between them, then find who connects to whom.",
    bestFor: [
      "Investigations and due diligence",
      "Stakeholder and influence maps",
      "Fraud, ownership and contact networks",
    ],
    objects: [
      {
        name: "Entity",
        description:
          "A person, organisation, phone, account, vehicle, place or other thing, with its own details.",
      },
      {
        name: "Link",
        description:
          "A relationship between two entities, such as calls, owns or director of, with optional dates.",
      },
      {
        name: "How sure",
        description: "Solid lines are confirmed, dashed are unconfirmed and dotted are tentative.",
      },
    ],
    tips: [
      "Add entities from the toolbar on the left, then drag the dot on an entity's edge onto another to link them.",
      "Double-click a link to type what it is, such as 'calls' or 'shareholder of'.",
      "Select two entities to see the shortest path between them.",
      "Key entities lists who has the most links and who sits between groups.",
      "Found the same person twice? Select both and choose Merge duplicates.",
      "Import a CSV of links (from, to, type, date) from My diagrams to build a map from records.",
    ],
    item: ["entity", "entities"],
  },
  architecture: {
    id: "architecture",
    name: "Architecture diagram",
    tagline: "Describe a software system with the C4 model: people, systems, containers and components.",
    bestFor: [
      "System context and container diagrams",
      "Onboarding engineers to a codebase",
      "Design reviews and architecture decision records",
    ],
    objects: [
      { name: "Person", description: "Someone who uses the system, such as a customer or an administrator." },
      {
        name: "Software system",
        description: "The system being described, or another one it works with. Grey means external.",
      },
      {
        name: "Container",
        description: "Something that runs or stores data inside a system: a web app, an API, a mobile app.",
      },
      { name: "Database", description: "A container that stores data, such as a PostgreSQL database." },
      {
        name: "Component",
        description: "A part inside a container, such as a controller or a service class.",
      },
      {
        name: "Boundary",
        description: "A dashed box around the containers or components that belong to one system.",
      },
      {
        name: "Relationship",
        description:
          "An arrow saying what one element does with another, and how, such as 'Reads from [SQL]'.",
      },
    ],
    tips: [
      "Add people, systems and containers from the toolbar, then drag the dot on an element's edge to another to connect them.",
      "Start with a system context diagram. Draw the containers of one system in a new diagram once the context is clear.",
      "Give every element a one-line description and every container its technology. Checks lists what's missing.",
      "Label every arrow with what happens, from the source's point of view, like 'Sends emails using'.",
      "Drag elements into a boundary and Tidy up keeps them together.",
      "Export to Mermaid C4 to keep the diagram next to your code.",
    ],
    item: ["element", "elements"],
  },
  er: {
    id: "er",
    name: "Entity-relationship diagram",
    tagline: "Design a database: tables, their columns and keys, and how they relate.",
    bestFor: ["Database schema design", "Documenting an existing database", "Data model reviews"],
    objects: [
      { name: "Table", description: "An entity, with a name and a list of columns." },
      {
        name: "Column",
        description:
          "A name and a type, flagged PK (primary key), FK (foreign key), UQ (unique) or NN (not null).",
      },
      {
        name: "Relationship",
        description: "A line from a parent table to a child table that holds a foreign key to it.",
      },
      {
        name: "Cardinality",
        description: "The crow's foot ends: exactly one, zero or one, one or many, or zero or many.",
      },
    ],
    tips: [
      "Pick Table from the toolbar, then edit its columns in the panel or double-click it and type one column per line.",
      "Select a table and press Tab to add a related table with a foreign key to it.",
      "Draw a relationship from the parent table to the child. It starts as one to zero or many; change either end in the panel.",
      "Import CREATE TABLE statements from a .sql file in My diagrams. Foreign keys become relationships.",
      "Export as SQL or as a Mermaid ER diagram.",
    ],
    item: ["table", "tables"],
  },
  freeform: {
    id: "freeform",
    name: "Freeform diagram",
    tagline: "Shapes and connectors on an open canvas.",
    bestFor: ["Whiteboard sketches", "Diagrams that don't fit another type", "Anything else"],
    objects: [
      { name: "Shape", description: "Rectangles, decisions, databases, sticky notes, groups and text." },
      {
        name: "Connector",
        description: "A line or arrow between two shapes. It follows the shapes when they move.",
      },
    ],
    tips: [
      "Pick a shape from the left toolbar, then click the canvas to place it.",
      "Select a shape and drag the dot on its right edge to connect it to another shape.",
      "Double-click a shape to edit its text.",
    ],
    item: ["shape", "shapes"],
  },
};

/** Order shown in the chart type picker. */
export const CHART_TYPE_ORDER: readonly ChartType[] = [
  "gantt",
  "roadmap",
  "kanban",
  "flowchart",
  "network",
  "architecture",
  "er",
  "freeform",
];

/** "1 task", "3 cards", "0 shapes". */
export function countLabel(chartType: ChartType, count: number): string {
  const [one, many] = CHART_TYPE_INFO[chartType].item;
  return `${String(count)} ${count === 1 ? one : many}`;
}
