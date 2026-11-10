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
  freeform: {
    id: "freeform",
    name: "Freeform diagram",
    tagline: "Shapes and connectors on an open canvas.",
    bestFor: ["System architecture", "Org charts", "Whiteboard sketches and anything else"],
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
export const CHART_TYPE_ORDER: readonly ChartType[] = ["gantt", "kanban", "flowchart", "network", "freeform"];

/** "1 task", "3 cards", "0 shapes". */
export function countLabel(chartType: ChartType, count: number): string {
  const [one, many] = CHART_TYPE_INFO[chartType].item;
  return `${String(count)} ${count === 1 ? one : many}`;
}
