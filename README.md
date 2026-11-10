# Linework

Linework is a free, open source diagram editor for project management and software design. It runs in the browser and needs no account. Charts are saved in your browser, and nothing is uploaded unless you choose to share.

> **Written with AI.** Most of Linework's code, tests and documentation were written by an AI coding assistant (Claude, by Anthropic) and directed and reviewed by a person. Each commit made this way ends with "Co-authored with AI".

## Chart types

| Project management | Software design             | General          |
| ------------------ | --------------------------- | ---------------- |
| Gantt chart        | Flowchart                   | Mind map         |
| Roadmap            | Architecture (C4)           | Network map      |
| Kanban board       | Entity-relationship diagram | Freeform diagram |
| Org chart          | UML class diagram           |                  |
|                    | State machine               |                  |
|                    | Sequence diagram            |                  |

Each chart type has its own tools, layout and checks. For example, a Gantt chart has dependencies, a critical path and a working calendar. An ER diagram imports and exports SQL. A sequence diagram lets you drag between lifelines to add messages.

## Features

- **Import and export.** Export PNG, SVG and PDF. Export or import Mermaid, CSV, MS Project XML, SQL and Markdown outlines, depending on the chart type.
- **Live collaboration.** Edit together through a relay that only passes on end-to-end encrypted messages. The relay never sees your chart.
- **Generate with AI.** Describe a chart and Claude drafts it. You use your own Anthropic API key, which is sent only to Anthropic.
- **Links that hold the chart.** A chart can be shared as a link with the chart inside it. Other AI assistants can create charts this way: follow the instructions at `/llms.txt`.
- **Templates.** Every chart type has examples to start from.

## Run it locally

You need Node.js 22.13 or later and pnpm 9.

```sh
pnpm install
pnpm dev        # the web app on http://localhost:5173
pnpm dev:api    # optional: the collaboration relay on port 8787
```

Before committing, run the checks:

```sh
pnpm check      # typecheck, lint, tests and build
```

## Project layout

- `apps/web`: the editor (React, Vite, zustand).
- `apps/api`: the live-collaboration relay (Node.js, WebSocket).
- `packages/shared`: the document format and validation (zod), shared by both apps.
- `docs`: self-hosting and the chart types roadmap.

## Self-hosting

Linework runs as two Docker containers: Caddy serving the app, and the relay. There is no database. See [docs/self-hosting.md](docs/self-hosting.md).

## Licence

MIT. See [LICENSE](LICENSE).
