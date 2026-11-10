/**
 * Instructions for LLMs (ChatGPT, Claude, Gemini, ...) on generating Linework charts.
 * Served as /llms.txt (written at build time by the Vite plugin in vite.config.ts) and shown
 * on the /llms page. Keep it in sync with share/simpleSpec.ts and mermaid/mermaid.ts.
 * No imports from app code other than plain data, because vite.config.ts loads this file.
 */

export interface GuideOptions {
  /** Absolute site origin, e.g. https://linework.example. Empty means "this site". */
  readonly origin: string;
  readonly iconIds: readonly string[];
}

export function llmsGuide({ origin, iconIds }: GuideOptions): string {
  const base = origin || "https://<this site>";
  return `# Linework: instructions for AI assistants

> Linework is a free, open source editor for flowcharts, diagrams, Gantt charts and kanban boards. It runs in the browser
> with no sign-in. You can create a chart for a user by giving them a link. When they open
> it, the chart appears in the editor, where they can edit it, save it locally and export
> PNG, SVG, PDF, CSV, MS Project XML or Mermaid.

## How it works

Build a URL of this form and give it to the user as a clickable link:

    ${base}/open#<format>=<payload>

The payload goes after the \`#\`, so it is never sent to a server. Two formats are best
for assistants:

- \`m=\` Mermaid text (flowchart/graph, gantt or kanban), URL-encoded.
- \`s=\` Linework simple JSON (below), URL-encoded. Use this for icons, colours, groups,
  owners, progress, WIP limits and due dates, which Mermaid can't express.

URL-encode the payload with encodeURIComponent rules: spaces become %20, newlines %0A,
\`#\` %23, \`&\` %26, quotes %22, \`{\` %7B, \`}\` %7D. Base64url-encoded payloads also work.

For a read-only view (for example to embed in an iframe), use \`/embed#\` instead of \`/open#\`.

## Option 1: Mermaid

Supported: \`flowchart\` / \`graph\` (TD, TB, LR, RL, BT), node shapes \`[ ]\` step, \`( )\`,
\`([ ])\` start/end, \`[[ ]]\` subprocess, \`[( )]\` database, \`(( ))\` circle, \`{ }\` decision,
\`{{ }}\` hexagon, \`[/ /]\` input/output, links \`-->\`, \`---\`, \`-.->\`, \`==>\`, labels
\`-->|text|\` or \`-- text -->\`, \`A & B --> C\`, and \`subgraph id [Title] ... end\`. Styling
lines are ignored. Mermaid flowcharts open as Linework flowcharts. When every node is in
exactly one top-level subgraph, the subgraphs become swimlanes.

Gantt: \`title\`, \`dateFormat YYYY-MM-DD\` (only this format), \`excludes weekends\`,
\`section\`, and tasks like \`Name :done, id1, 2026-03-02, 5d\`, \`Name :id2, after id1, 3d\`,
\`Launch :milestone, after id2, 0d\`. Tags: done, active, crit, milestone.

Kanban: \`kanban\`, then one line per column, then its cards indented further, like
\`  todo[To do]\` and \`    t1[Write spec]@{ assigned: 'Sam', priority: 'High' }\`.
Priorities: 'Very High', 'High', 'Low', 'Very Low'.

Example (a flowchart):

    flowchart LR
      A([Start]) --> B{Approved?}
      B -->|yes| C[Build]
      B -->|no| D[Revise]
      D --> B

Link: ${base}/open#m=flowchart%20LR%0A%20%20A(%5BStart%5D)%20--%3E%20B%7BApproved%3F%7D%0A%20%20B%20--%3E%7Cyes%7C%20C%5BBuild%5D%0A%20%20B%20--%3E%7Cno%7C%20D%5BRevise%5D%0A%20%20D%20--%3E%20B

## Option 2: Linework simple JSON

### Flowchart (process, workflow, algorithm, approval)

    {
      "type": "flowchart",
      "title": "Expense approval",
      "direction": "TB",
      "lanes": ["Employee", "Manager", "Finance"],
      "nodes": [
        { "id": "start", "label": "Start", "shape": "start", "lane": "Employee" },
        { "id": "submit", "label": "Submit claim", "shape": "io", "lane": "Employee" },
        { "id": "ok", "label": "Approved?", "shape": "decision", "lane": "Manager" },
        { "id": "fix", "label": "Fix and resubmit", "lane": "Employee" },
        { "id": "pay", "label": "Pay expenses", "shape": "subprocess", "lane": "Finance" },
        { "id": "end", "label": "Done", "shape": "end", "lane": "Finance" }
      ],
      "edges": [
        { "from": "start", "to": "submit" },
        { "from": "submit", "to": "ok" },
        { "from": "ok", "to": "pay", "label": "Yes" },
        { "from": "ok", "to": "fix", "label": "No" },
        { "from": "fix", "to": "ok" },
        { "from": "pay", "to": "end" }
      ]
    }

- \`shape\`: start, end, process (default), decision, io (input or output), subprocess,
  document or database. The diagram shapes below also work.
- Begin with one start, finish every path at an end, and label each link leaving a decision
  (usually Yes and No).
- \`lanes\` (optional): swimlanes, one per person, team or system, in order. Put a step in
  one with \`lane\`. Steps without a lane go in the first lane. Leave lanes out for a plain
  flowchart.
- \`direction\`, \`style\`, \`color\` and edge options work as for diagrams below.

### Diagram (architecture, org chart, anything else)

    {
      "type": "diagram",
      "title": "Checkout",
      "direction": "TB",
      "style": "professional",
      "nodes": [
        { "id": "web", "label": "Web app", "icon": "browser" },
        { "id": "api", "label": "Orders API", "shape": "rounded", "color": "purple", "group": "Backend" },
        { "id": "db", "label": "Orders DB", "shape": "cylinder", "color": "green", "group": "Backend" }
      ],
      "edges": [
        { "from": "web", "to": "api", "label": "HTTPS" },
        { "from": "api", "to": "db", "style": "dashed" }
      ]
    }

- Required: \`type\` ("diagram"), and \`nodes\` with unique \`id\`s. \`label\` defaults to the id.
- \`direction\`: "TB" (top to bottom, default) or "LR" (left to right). Layout is automatic,
  so don't give coordinates.
- \`style\`: "professional" (default) or "sketch" (hand-drawn).
- \`shape\`: rectangle, rounded (default), ellipse, diamond, parallelogram, cylinder, note,
  hexagon, triangle, document, cloud, actor, terminal, subroutine.
- \`icon\` (draws an icon with the label underneath, instead of a shape): ${iconIds.join(", ")}.
- \`color\`: blue, green, amber, red, purple, grey, yellow.
- \`group\`: nodes with the same group name are boxed together under that title.
- Edges: \`from\`, \`to\`, optional \`label\`, \`style\` (solid, dashed, dotted) and
  \`arrow\` (end, both, none).

### Gantt chart (project plan, schedule, roadmap)

    {
      "type": "gantt",
      "title": "Website relaunch",
      "skipWeekends": true,
      "sections": [
        {
          "name": "Design",
          "color": "blue",
          "tasks": [
            { "id": "research", "name": "User research", "start": "2026-03-02", "days": 5, "owner": "Priya", "progress": 100 },
            { "id": "mockups", "name": "Mockups", "days": 7, "owner": "Lee", "after": ["research"] }
          ]
        },
        {
          "name": "Launch",
          "tasks": [
            { "id": "go", "name": "Go live", "milestone": true, "after": ["mockups"] }
          ]
        }
      ]
    }

- Tasks need a \`name\`. Give each task an \`id\` if anything depends on it.
- \`start\` and \`end\` are YYYY-MM-DD dates. \`days\` is the duration (default 5). A task
  with no \`start\` begins the day after the previous task.
- \`after\`: ids of tasks that must finish first. Dependent tasks move later automatically.
- \`skipWeekends\`: count durations in working days (Monday to Friday).
- \`milestone\`: true for a single-day checkpoint. \`owner\` and \`progress\` (0-100) are optional.

### Kanban board (task board, sprint, pipeline)

    {
      "type": "kanban",
      "title": "Sprint 14",
      "lanes": ["Web", "Mobile"],
      "columns": [
        {
          "name": "To do",
          "cards": [
            { "title": "Onboarding checklist", "owner": "Priya", "tags": ["design"], "lane": "Web" },
            { "title": "Push notifications", "priority": "high", "lane": "Mobile" }
          ]
        },
        {
          "name": "In progress",
          "wip": 3,
          "cards": [
            { "title": "Fix login timeout", "owner": "Sam", "due": "2026-03-06", "priority": "urgent", "lane": "Web" }
          ]
        },
        { "name": "Done", "done": true, "cards": [] }
      ]
    }

- Columns are stages, left to right. Each needs a \`name\`. \`wip\` is the most cards the
  column should hold. \`done\`: true marks finished work (a last column named Done is
  marked automatically).
- Cards need a \`title\`. Optional: \`description\`, \`owner\`, \`due\` (YYYY-MM-DD),
  \`tags\` (up to 10 short words), \`priority\` (low, medium, high, urgent), \`color\`.
- \`lanes\` (optional): swimlane rows such as teams or clients. Put a card in one with
  \`lane\`. Leave lanes out for a simple board.

## Rules

1. Give the user the full link as a clickable link. Don't show the encoded payload separately.
2. Keep links under about 8,000 characters. Some chat apps and browsers cut longer
   URLs short. For bigger charts, give the Mermaid text or JSON in a code block instead, and
   tell the user to paste it into Linework (My diagrams, then Import, then Paste text).
3. Use the user's own names, dates and terms. Prefer short labels (under 40 characters).
4. Don't invent features: no coordinates, sizes or custom hex colours in the simple format.
5. If the link doesn't open, the page shows the parsing error. Fix the payload and send a
   new link.

## About Linework

Free and open source (MIT). Diagrams are stored in the user's browser. Nothing is uploaded
unless the user chooses to share. Site: ${base}/
`;
}
