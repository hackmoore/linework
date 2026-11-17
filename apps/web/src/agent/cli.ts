#!/usr/bin/env node
/*
 * Linework agent client: lets an AI agent (Claude Code, Codex, Cursor, ...) edit a chart
 * that a person has open, live, through commands instead of the mouse.
 *
 * The person clicks "Share with AI" in the editor and gives the agent a live link. This
 * script joins that end-to-end encrypted live session like any other collaborator, sends
 * one command to the person's browser tab, prints the reply and exits. The browser runs
 * the command (collab/agent.ts), so edits appear on screen at once and can be undone.
 *
 * Served as /linework-agent.mjs (types stripped by the Vite plugin in vite.config.ts), so
 * it must stay one self-contained file with no imports. Needs Node.js 22 or newer.
 */

const HELP = `Linework agent client: edit a Linework chart live, together with a person.

Usage:
  node linework-agent.mjs <live link> <command> [argument]

The live link comes from the person's "Share with AI" button. Quote it: it contains '&'.
An argument can be given inline, as @path/to/file, or as - to read standard input.

Commands:
  get                 Print the chart as JSON ({ "chart": ..., "issues": [...] }).
                      Run this first, and again before each edit.
  edit <json>         Change part of the chart (see "Editing" below).
  replace <text>      Replace the whole chart with Mermaid text or Linework simple JSON
                      (formats: <site>/llms.txt). Positions and styling are recomputed,
                      so prefer edit for changes to an existing chart.
  tidy [TB|LR]        Re-run automatic layout (flowcharts, network maps, architecture,
                      ER, org, mind map, class and state diagrams).
  help                Show this text.

Every command prints a JSON reply. Errors go to standard error with exit code 1.
get prints the chart with an "issues" list; the other commands print the ids they
touched and "issues". Issues are the warnings the person sees under Checks, such as a
decision with only one branch: fix them unless the person wants otherwise.

Editing
  An edit is a JSON object with any of these keys:

  {
    "set":    { "title": "New title" },
    "upsert": { "<collection>": [ { "id": "...", ...fields } ] },
    "remove": { "<collection>": [ "id", ... ] },
    "order":  { "<collection>": [ "every id, in the new order" ] }
  }

  upsert with the id of an existing item changes only the fields you give.
  upsert with a new id (or no id) adds an item. Missing fields get sensible defaults,
  so give only what matters: { "kind": "diamond", "label": "Approved?" }. Pick your own
  readable ids for new items (letters, digits, - and _) so later items can refer to them.
  New items go at the end of their collection; send "order" to put them elsewhere.
  Removing a shape also removes its connectors; removing a task drops dependencies on it.

  Collections (which ones a chart uses depends on its chartType; see "get"):
    nodes, edges, layers, comments                     canvas charts
    flowchart.lanes                                    flowchart swimlanes
    gantt.tasks, gantt.sections                        gantt
    kanban.columns, kanban.lanes, kanban.cards         kanban
    roadmap.lanes, roadmap.items                       roadmap
    sequence.participants, sequence.steps              sequence diagrams
    network.entities, network.links                    network map details (one per node/edge)

  Settable keys:
    title, styleId, background, chartType,
    gantt.scale, gantt.autoSchedule, gantt.showToday, gantt.showCriticalPath,
    gantt.calendar, gantt.baseline, flowchart.direction, flowchart.laneStart,
    roadmap.scale, roadmap.fiscalYearStart, roadmap.showToday, sequence.autonumber

  Field names and allowed values are exactly those in "get" output: copy the shape of an
  existing item. Shapes' x, y, width and height are pixels; colours are #rrggbb; dates are
  YYYY-MM-DD. Shape kinds: rectangle, rounded, ellipse, diamond (flowchart decision),
  parallelogram, cylinder (database), note, container, text, hexagon, triangle, document,
  cloud, actor, icon, terminal (start/end), subroutine, table, class, initial, final,
  person. New shapes without x and y are
  placed beside the chart; run tidy afterwards to lay everything out.
  A shape's "bold", "italic" and "underline" (true or false) style its whole label.
  A shape's "verticalAlign" (top, middle or bottom) places its label; "textAlign" (left,
  center or right) sets it across.
  A connector's "sourceAnchor" and "targetAnchor" fix where each end attaches: top-start,
  top, top-end, right-start, right, right-end, bottom-start, bottom, bottom-end, left-start,
  left or left-end ("start" is a quarter of the way along from the left or top). Leave
  them out to attach automatically, or set one to null to go back to automatic.
  If an edit would make the chart invalid, nothing changes and the error says why.

Examples
  Flowchart: add a decision and connect it.
    edit '{"upsert":{"nodes":[{"id":"check","kind":"diamond","label":"In stock?"}],
           "edges":[{"source":"order","target":"check"},
                    {"source":"check","target":"ship","label":"yes"}]}}'
  Rename a shape:    edit '{"upsert":{"nodes":[{"id":"n1","label":"Review"}]}}'
  Gantt task:        edit '{"upsert":{"gantt.tasks":[{"id":"qa","name":"QA","start":"2026-03-02",
                           "end":"2026-03-06","dependencies":[{"taskId":"build","type":"FS","lag":0}]}]}}'
  Kanban card:       edit '{"upsert":{"kanban.cards":[{"title":"Fix login","columnId":"<id>"}]}}'
  Sequence message:  edit '{"upsert":{"sequence.steps":[{"type":"message","from":"<id>",
                           "to":"<id>","text":"POST /login"}]}}'

Working together
  The person sees every change as it happens, and may be editing too, so run get again
  before each edit rather than relying on an old copy. Make small edits, one idea at a
  time, and tell the person what you changed. They can undo any edit with Ctrl+Z.
`;

interface Envelope {
  readonly t: string;
  readonly client: string;
  readonly to?: string;
  readonly id?: string;
  readonly reply?: unknown;
}

const CLIENT = "ai-agent";
const ENV_NAME = process.env.LINEWORK_AGENT_NAME?.trim() ?? "";
const NAME = ENV_NAME === "" ? "AI assistant" : ENV_NAME;
const FIND_HOST_MS = 8_000;
const REPLY_MS = 30_000;

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Same framing as the web app's collab/crypto.ts: [12-byte IV][AES-GCM ciphertext of JSON]. */
async function seal(key: CryptoKey, message: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(message));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return out;
}

async function open(key: CryptoKey, frame: ArrayBuffer): Promise<unknown> {
  const bytes = new Uint8Array(frame);
  if (bytes.length < 13) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } catch {
    return null;
  }
}

export interface AgentLink {
  readonly roomId: string;
  readonly key: string;
  /** WebSocket URL of the room on the relay. */
  readonly relay: string;
}

/** Reads a live link: https://site/live#room=...&key=...[&relay=wss://...]. */
export function parseAgentLink(link: string): AgentLink | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const params = new URLSearchParams(url.hash.replace(/^#/, ""));
  const roomId = params.get("room") ?? "";
  const key = params.get("key") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(roomId) || !/^[A-Za-z0-9_-]{22}$/.test(key)) return null;
  const scheme = url.protocol === "https:" ? "wss:" : "ws:";
  const relay = params.get("relay") ?? `${scheme}//${url.host}/api/rooms/${roomId}`;
  return /^wss?:\/\//.test(relay) ? { roomId, key, relay } : null;
}

/** Turns command-line arguments into a command for the browser, or a usage error. */
export function buildCommand(
  name: string,
  arg: string | undefined,
): { op: string; [k: string]: unknown } | string {
  switch (name) {
    case "get":
      return { op: "get" };
    case "tidy":
      return arg && arg !== "TB" && arg !== "LR" ? "tidy takes TB or LR" : { op: "tidy", direction: arg };
    case "replace":
      return arg ? { op: "replace", text: arg } : "replace needs Mermaid text or simple JSON";
    case "edit": {
      if (!arg) return "edit needs a JSON object";
      let parsed: unknown;
      try {
        parsed = JSON.parse(arg);
      } catch (error) {
        return `edit: the JSON is malformed (${error instanceof Error ? error.message : String(error)})`;
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        return "edit needs a JSON object with set, upsert, remove or order";
      return { ...(parsed as Record<string, unknown>), op: "edit" };
    }
    default:
      return `Unknown command "${name}". Run with "help" for usage.`;
  }
}

async function readArgument(arg: string | undefined): Promise<string | undefined> {
  if (arg === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }
  if (arg?.startsWith("@")) {
    const { readFile } = await import("node:fs/promises");
    return readFile(arg.slice(1), "utf8");
  }
  return arg;
}

/** Joins the session, finds the browser tab hosting agents, runs one command and returns its reply. */
export async function runCommand(link: AgentLink, command: unknown): Promise<Record<string, unknown>> {
  const keyBytes = fromBase64Url(link.key);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  const socket = new WebSocket(link.relay);
  socket.binaryType = "arraybuffer";
  const send = async (message: Record<string, unknown>): Promise<void> => {
    socket.send(await seal(key, { client: CLIENT, ...message }));
  };
  const callId = crypto.randomUUID();

  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      let host: string | null = null;
      let timer = setTimeout(() => {
        reject(
          new Error(
            "No browser tab answered. Ask the person to open the chart and click Share with AI, then try again.",
          ),
        );
      }, FIND_HOST_MS);
      socket.addEventListener("open", () => {
        void send({ t: "agent-hello" });
      });
      socket.addEventListener("error", () => {
        reject(new Error(`Couldn't connect to the live server at ${link.relay}`));
      });
      socket.addEventListener("close", (event) => {
        reject(
          new Error(`The live server closed the connection (${String(event.code)} ${event.reason})`.trim()),
        );
      });
      socket.addEventListener("message", (event: MessageEvent<ArrayBuffer | string>) => {
        if (typeof event.data === "string") return; // Peer counts from the relay itself.
        void open(key, event.data).then((raw) => {
          const message = raw as Envelope | null;
          if (message?.to !== CLIENT) return;
          if (message.t === "agent-host" && host === null) {
            host = message.client;
            clearTimeout(timer);
            timer = setTimeout(() => {
              reject(new Error("The browser didn't reply in time. The command may or may not have run."));
            }, REPLY_MS);
            void send({ t: "presence", name: NAME, cursor: null, selection: [] });
            void send({ t: "agent-call", to: host, id: callId, command });
          } else if (message.t === "agent-reply" && message.client === host && message.id === callId) {
            clearTimeout(timer);
            const reply = (message.reply ?? {}) as Record<string, unknown>;
            // Show collaborators what changed by "selecting" it under the agent's name.
            const touched = Array.isArray(reply.touched) ? reply.touched : [];
            void send({ t: "presence", name: NAME, cursor: null, selection: touched }).then(() => {
              resolve(reply);
            });
          }
        });
      });
    });
  } finally {
    // Let the last frame leave before closing. No goodbye: the agent's avatar stays a while.
    await new Promise((r) => setTimeout(r, 100));
    socket.close(1000, "Done");
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const [linkArg, name, rawArg] = argv;
  if (!linkArg || linkArg === "help" || linkArg === "--help" || name === "help" || !name) {
    process.stdout.write(HELP);
    return linkArg ? 0 : 1;
  }
  const link = parseAgentLink(linkArg);
  if (!link) {
    process.stderr.write(
      "That isn't a Linework live link. It looks like https://<site>/live#room=...&key=...\n",
    );
    return 1;
  }
  const command = buildCommand(name, await readArgument(rawArg));
  if (typeof command === "string") {
    process.stderr.write(`${command}\n`);
    return 1;
  }
  try {
    const reply = await runCommand(link, command);
    if (reply.ok !== true) {
      process.stderr.write(`${typeof reply.error === "string" ? reply.error : "The command failed"}\n`);
      return 1;
    }
    const { ok: _ok, ...rest } = reply;
    process.stdout.write(`${JSON.stringify(rest, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

// Run only when executed directly, so tests can import the helpers.
if (
  import.meta.url === `file://${process.argv[1] ?? ""}` ||
  process.argv[1]?.endsWith("linework-agent.mjs")
) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
