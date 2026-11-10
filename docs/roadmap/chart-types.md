# Chart types roadmap

Each chart type is a structured document with its own objects, editor and guidance
(see `apps/web/src/charts/chartTypes.ts`). Freeform diagrams remain available for
anything that does not fit a type.

Status: **Gantt**, **Kanban** and **Freeform** are implemented. The rest are candidates, ranked by
fit with Linework's focus on project management and software design.

| Priority | Chart                        | Objects                                                     | Why                                                           |
| -------- | ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Done     | Gantt                        | Sections, tasks, milestones, dependencies                   | Shipped                                                       |
| Done     | Freeform                     | Shapes, connectors                                          | Shipped                                                       |
| Done     | Kanban board                 | Columns, cards, WIP limits, swimlanes                       | Shipped                                                       |
| 2        | Flowchart                    | Start/end, step, decision, input/output, swimlanes          | Most common diagram; a focused palette beats the freeform one |
| 3        | Roadmap / timeline           | Lanes, items, quarters, milestones                          | Reuses the Gantt date engine                                  |
| 4        | Sequence diagram             | Lifelines, messages, activations, notes                     | Core software design; awkward to draw freehand                |
| 5        | Architecture / C4            | Systems, containers, components, boundaries, icon libraries | High demand; Mermaid supports C4 and architecture diagrams    |
| 6        | Entity-relationship          | Tables, columns, keys, crow's-foot relations                | Every backend team draws these                                |
| 7        | Org / team chart             | People, roles, reporting lines, automatic tree layout       | Template already exists                                       |
| 8        | Mind map                     | Central topic, branches, automatic layout                   | Fast brainstorming                                            |
| 9        | Class diagram (UML)          | Classes, members, inheritance, composition                  | Engineering audience                                          |
| 10       | State machine                | States, transitions, start/end, nested states               | Pairs with sequence diagrams                                  |
| 11       | User journey / story map     | Stages, steps, emotions, owners                             | Product teams                                                 |
| 12       | RACI matrix                  | Tasks by people grid with R/A/C/I cells                     | Project management staple; simple to build                    |
| Later    | Quadrant (prioritisation)    | Axes, quadrants, items                                      | Niche                                                         |
| Later    | Wardley map                  | Components, evolution axis, value chain                     | Niche                                                         |
| Later    | Ishikawa (fishbone)          | Problem, cause categories, causes                           | Niche                                                         |
| Later    | Git graph                    | Branches, commits, merges                                   | Niche                                                         |
| Later    | Sankey                       | Nodes, weighted flows                                       | Niche                                                         |
| Later    | Swimlane process (BPMN-lite) | Pools, lanes, events, tasks, gateways                       | Niche                                                         |

Sources: competitor review (draw.io, Excalidraw, tldraw, Lucidchart, Miro, Whimsical),
Gantt tool guides (TeamGantt, Smartsheet, GanttPRO) and Mermaid's diagram syntax list
(https://mermaid.js.org/intro/), November 2026.
