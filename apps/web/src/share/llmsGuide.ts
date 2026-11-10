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

> Linework is a free, open source editor for flowcharts, network maps, architecture diagrams, Gantt charts, roadmaps, kanban boards and more. It runs in the browser
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

### Roadmap (product or technology roadmap, quarterly plan, release timeline)

    {
      "type": "roadmap",
      "title": "2027 roadmap",
      "scale": "month",
      "lanes": [
        {
          "name": "Product",
          "items": [
            { "title": "Editor redesign", "start": "2027-01-04", "end": "2027-03-26", "status": "in-progress", "owner": "Priya" },
            { "title": "Public beta", "start": "2027-04-01", "milestone": true }
          ]
        },
        {
          "name": "Platform",
          "items": [{ "title": "Real-time sync", "start": "2027-02-01", "end": "2027-05-28", "status": "at-risk" }]
        }
      ]
    }

- Lanes are rows for teams, product areas or themes. Items need a \`title\` and a \`start\`
  (YYYY-MM-DD). \`end\` defaults to about one column after the start.
- \`milestone\`: true for a single date. \`status\`: planned (default), in-progress, done or
  at-risk. \`owner\`, \`description\` and lane \`color\` are optional.
- \`scale\`: week, month (default) or quarter. \`fiscalYearStart\`: month number (1-12) the
  financial year starts, for FY quarter labels.
- Use a Gantt chart instead when the user needs dependencies or day-by-day scheduling.

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

### Network map (link analysis, investigation, stakeholders, ownership)

    {
      "type": "network",
      "title": "Northgate links",
      "entities": [
        { "id": "alex", "name": "Alex Mercer", "type": "person", "details": { "Role": "Director" } },
        { "id": "ng", "name": "Northgate Trading Ltd", "type": "organisation" },
        { "id": "p1", "name": "07700 900123", "type": "phone" }
      ],
      "links": [
        { "from": "alex", "to": "ng", "label": "director of", "date": "2024-02-01" },
        { "from": "alex", "to": "p1", "label": "uses", "strength": "unconfirmed" }
      ]
    }

- Entities need a unique \`id\`. \`name\` defaults to the id. \`type\`: ${["person", "organisation", "phone", "email", "account", "vehicle", "location", "website", "device", "document", "event", "other"].join(", ")}.
- \`details\`: facts as name-value pairs. \`notes\`: free text.
- Links: \`from\`, \`to\`, \`label\` (the relationship), \`strength\` (confirmed, the default;
  unconfirmed; tentative), \`direction\` (none, the default; forward; both), \`date\` and
  \`endDate\` (YYYY-MM-DD).
- Only include people and facts the user gave you. Never invent personal details.

### Architecture diagram (C4 system context, container or component diagram)

    {
      "type": "architecture",
      "title": "Online shop",
      "elements": [
        { "id": "customer", "name": "Customer", "type": "person", "description": "Buys products" },
        { "id": "web", "name": "Web shop", "type": "container", "technology": "React",
          "description": "Shop in the browser", "boundary": "Online shop" },
        { "id": "db", "name": "Database", "type": "database", "technology": "PostgreSQL",
          "boundary": "Online shop" },
        { "id": "pay", "name": "Payment provider", "type": "system", "external": true }
      ],
      "relationships": [
        { "from": "customer", "to": "web", "label": "Shops using", "technology": "HTTPS" },
        { "from": "web", "to": "db", "label": "Reads and writes", "technology": "SQL" },
        { "from": "web", "to": "pay", "label": "Takes payments using" }
      ]
    }

- Elements need a unique \`id\`. \`type\`: person, system, container (the default), database
  or component. Optional: \`name\`, \`technology\` (containers, databases and components),
  \`description\`, \`external\` (true for people and systems outside the one described) and
  \`boundary\` (the name of the system the element sits inside; drawn as a dashed box).
- Relationships: \`from\`, \`to\`, \`label\` (what happens), \`technology\` (such as JSON/HTTPS).
- \`direction\`: TB (default) or LR.

### Entity-relationship diagram (database schema, data model)

    {
      "type": "er",
      "title": "Shop",
      "tables": [
        { "name": "customers", "columns": ["id uuid PK", "email text UQ NN"] },
        { "name": "orders", "columns": ["id uuid PK", "customer_id uuid FK NN", "total numeric(10,2)"] }
      ],
      "relationships": [
        { "from": "customers", "to": "orders", "label": "places" }
      ]
    }

- Tables need a unique \`name\`. \`columns\`: one string each, "name type FLAGS", with flags
  PK (primary key), FK (foreign key), UQ (unique) and NN (not null).
- Relationships go \`from\` the parent table \`to\` the child table that holds the foreign key.
  \`fromCardinality\` (default one) and \`toCardinality\` (default zero-or-many): one,
  zero-or-one, one-or-many or zero-or-many. \`label\`: a verb.
- \`direction\`: LR (default) or TB.

### Org chart (company structure, team, reporting lines)

    {
      "type": "org",
      "title": "Acme",
      "people": [
        { "id": "ceo", "name": "Maya Patel", "title": "CEO", "department": "Leadership" },
        { "id": "cto", "name": "Tom Okafor", "title": "CTO", "department": "Engineering", "manager": "ceo" },
        { "name": "Backend engineer", "department": "Engineering", "manager": "cto", "vacant": true }
      ]
    }

- People need a \`name\`. \`id\` defaults to the name. \`manager\` is the id or name of the
  person they report to; leave it out for the top of the chart.
- Optional: \`title\`, \`department\` (cards are coloured by it), \`email\`, \`vacant\` (an
  open position).
- \`direction\`: TB (default) or LR.

### Mind map (brainstorm, notes, breaking down a topic)

    {
      "type": "mindmap",
      "root": "Podcast launch",
      "branches": [
        { "text": "Audience", "children": [{ "text": "Developers" }, { "text": "Designers" }] },
        { "text": "Format", "color": "purple", "children": [{ "text": "Weekly, 30 minutes" }] },
        { "text": "Promotion" }
      ]
    }

- \`root\`: the central topic. \`branches\`: topics with \`text\` and optional \`children\`
  (nested as deep as needed) and \`color\` (${["blue", "teal", "amber", "pink", "purple", "cyan", "green", "red"].join(", ")}).
- \`layout\`: balanced (default, branches on both sides) or right.
- Mermaid \`mindmap\` text and Markdown bulleted lists also import as mind maps.

### Class diagram (UML, domain model, object design)

    {
      "type": "class",
      "classes": [
        { "name": "Order", "attributes": ["- id: UUID"], "operations": ["+ total(): Money"] },
        { "name": "OrderLine", "attributes": ["- quantity: int"] },
        { "name": "PaymentMethod", "stereotype": "interface", "operations": ["+ charge(amount: Money)"] },
        { "name": "CardPayment" }
      ],
      "relationships": [
        { "from": "Order", "to": "OrderLine", "type": "composition", "toMultiplicity": "1..*" },
        { "from": "CardPayment", "to": "PaymentMethod", "type": "realization" }
      ]
    }

- Classes need a unique \`name\`. Optional: \`stereotype\` (interface, abstract, enumeration),
  \`attributes\` and \`operations\` (strings, with + - # ~ for visibility).
- Relationship \`type\`: association (default), inheritance (from child to parent), realization
  (from class to interface), composition or aggregation (from whole to part), dependency.
  Optional: \`fromMultiplicity\`, \`toMultiplicity\`, \`label\`.
- Mermaid \`classDiagram\` text also imports as a class diagram.

### State machine (lifecycle, states and events, UML state diagram)

    {
      "type": "state",
      "states": [
        { "name": "Idle" },
        { "name": "Running", "entry": "start motor" },
        { "name": "check", "kind": "choice" }
      ],
      "transitions": [
        { "from": "[*]", "to": "Idle" },
        { "from": "Idle", "to": "Running", "event": "start" },
        { "from": "Running", "to": "check", "event": "stop" },
        { "from": "check", "to": "Idle", "guard": "safe" },
        { "from": "check", "to": "[*]", "guard": "shutdown" }
      ]
    }

- States need a unique \`name\`. \`kind\`: state (default), choice or composite. Optional:
  \`parent\` (the composite state it's inside), \`entry\`, \`do\`, \`exit\` (actions).
- Transitions: \`from\` and \`to\` are state names, or "[*]" for the start and the end.
  Optional: \`event\`, \`guard\`, \`action\`. Put a guard on every branch out of a choice.
- Mermaid \`stateDiagram-v2\` text also imports as a state machine.

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
