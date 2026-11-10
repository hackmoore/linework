# Chart types roadmap

Each chart type is a structured document with its own objects, editor and guidance
(see `apps/web/src/charts/chartTypes.ts`). Freeform diagrams remain available for
anything that does not fit a type.

Status: **Gantt**, **Roadmap**, **Kanban**, **Flowchart**, **Network map**, **Architecture (C4)**, **Entity-relationship**, **Org chart**, **Mind map**, **Class diagram**, **State machine** and **Freeform** are implemented. The rest are candidates, ranked by
fit with Linework's focus on project management and software design.

| Priority | Chart                        | Objects                                                   | Why                                                   |
| -------- | ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Done     | Gantt                        | Sections, tasks, milestones, dependencies                 | Shipped                                               |
| Done     | Freeform                     | Shapes, connectors                                        | Shipped                                               |
| Done     | Kanban board                 | Columns, cards, WIP limits, swimlanes                     | Shipped                                               |
| Done     | Network map                  | Entities with details, typed links, confidence, dates     | Shipped (requested); link analysis for investigations |
| Done     | Flowchart                    | Start/end, step, decision, input/output, swimlanes        | Shipped                                               |
| Done     | Roadmap / timeline           | Lanes, items, quarters, milestones                        | Shipped                                               |
| 4        | Sequence diagram             | Lifelines, messages, activations, notes                   | Core software design; awkward to draw freehand        |
| Done     | Architecture / C4            | People, systems, containers, components, boundaries       | Shipped; exports Mermaid C4                           |
| Done     | Entity-relationship          | Tables, columns, keys, crow's-foot relations              | Shipped; imports and exports SQL                      |
| Done     | Org / team chart             | People, roles, departments, reporting lines, tree layout  | Shipped; imports and exports CSV                      |
| Done     | Mind map                     | Central topic, branches, automatic layout                 | Shipped; imports Markdown outlines and Mermaid        |
| Done     | Class diagram (UML)          | Classes, members, inheritance, composition                | Shipped; imports and exports Mermaid                  |
| Done     | State machine                | States, transitions, choices, start/end, composite states | Shipped; imports and exports Mermaid                  |
| 11       | User journey / story map     | Stages, steps, emotions, owners                           | Product teams                                         |
| 12       | RACI matrix                  | Tasks by people grid with R/A/C/I cells                   | Project management staple; simple to build            |
| Later    | Quadrant (prioritisation)    | Axes, quadrants, items                                    | Niche                                                 |
| Later    | Wardley map                  | Components, evolution axis, value chain                   | Niche                                                 |
| Later    | Ishikawa (fishbone)          | Problem, cause categories, causes                         | Niche                                                 |
| Later    | Git graph                    | Branches, commits, merges                                 | Niche                                                 |
| Later    | Sankey                       | Nodes, weighted flows                                     | Niche                                                 |
| Later    | Swimlane process (BPMN-lite) | Pools, lanes, events, tasks, gateways                     | Niche                                                 |

Sources: competitor review (draw.io, Excalidraw, tldraw, Lucidchart, Miro, Whimsical),
Gantt tool guides (TeamGantt, Smartsheet, GanttPRO) and Mermaid's diagram syntax list
(https://mermaid.js.org/intro/), November 2026.
