import { create } from "zustand";
import type { Diagram } from "@linework/shared";
import { useEditor } from "../editor/store";
import { colorFor, getDisplayName } from "./identity";
import { importRoomKey, open, seal, type RoomSecret } from "./crypto";
import { acceptSnapshot, applyPatch, diffDiagrams, type DiagramPatch } from "./patch";

/*
 * A live editing session. Everyone in the room keeps a full copy of the document; edits
 * are sent as element-level patches, so concurrent edits to different objects merge.
 * Messages are encrypted in the browser (see crypto.ts) and relayed by apps/api.
 */

export interface PeerPresence {
  readonly client: string;
  readonly name: string;
  readonly color: string;
  /** Pointer position in diagram coordinates, when over the canvas. */
  readonly cursor: { readonly x: number; readonly y: number } | null;
  readonly selection: readonly string[];
  readonly seenAt: number;
}

type Message =
  | { t: "hello"; client: string }
  | { t: "snapshot"; client: string; diagram: unknown }
  | { t: "patch"; client: string; patch: DiagramPatch }
  | { t: "presence"; client: string; name: string; cursor: PeerPresence["cursor"]; selection: string[] }
  | { t: "bye"; client: string };

export type LiveStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

interface LiveState {
  readonly status: LiveStatus;
  readonly secret: RoomSecret | null;
  readonly peers: ReadonlyMap<string, PeerPresence>;
  /** Connections in the room including this one, as reported by the relay. */
  readonly connections: number;
  readonly error: string | null;
}

export const useLive = create<LiveState>()(() => ({
  status: "idle",
  secret: null,
  peers: new Map(),
  connections: 0,
  error: null,
}));

const PATCH_THROTTLE_MS = 60;
const PRESENCE_THROTTLE_MS = 50;
const PEER_TIMEOUT_MS = 30_000;
const PRESENCE_HEARTBEAT_MS = 10_000;

const configuredRelay = (): string =>
  (import.meta.env.VITE_LINEWORK_RELAY_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

/** WebSocket URL for a room: VITE_LINEWORK_RELAY_URL if set, else /api on this origin. */
export function relayUrl(roomId: string): string {
  const configured = configuredRelay();
  if (configured) return `${configured}/api/rooms/${roomId}`;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/api/rooms/${roomId}`;
}

/** HTTP URL of the relay's health check, which says whether live sessions can work here. */
export function relayHealthUrl(): string {
  const configured = configuredRelay();
  return configured ? `${configured.replace(/^ws/, "http")}/api/health` : "/api/health";
}

class LiveSession {
  readonly client = crypto.randomUUID();
  private socket: WebSocket | null = null;
  private key: CryptoKey | null = null;
  private stopped = false;
  private retries = 0;
  private lastSynced: Diagram | null = null;
  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private cursor: PeerPresence["cursor"] = null;
  private snapshotWaiters: ((d: Diagram) => void)[] = [];
  /** Replace the local document with the first snapshot after (re)connecting. */
  private acceptNextSnapshot: boolean;

  constructor(
    readonly secret: RoomSecret,
    joining: boolean,
  ) {
    this.acceptNextSnapshot = joining;
  }

  async start(): Promise<void> {
    this.key = await importRoomKey(this.secret.key);
    useLive.setState({
      status: "connecting",
      secret: this.secret,
      error: null,
      peers: new Map(),
      connections: 0,
    });
    this.connect();
    this.heartbeat = setInterval(() => {
      this.sendPresence();
      // Forget peers that went quiet without saying goodbye.
      const now = Date.now();
      const peers = new Map(
        [...useLive.getState().peers].filter(([, p]) => now - p.seenAt < PEER_TIMEOUT_MS),
      );
      if (peers.size !== useLive.getState().peers.size) useLive.setState({ peers });
    }, PRESENCE_HEARTBEAT_MS);
  }

  /** Starts syncing the editor's current document. */
  attach(): void {
    this.unsubscribe?.();
    this.lastSynced = useEditor.getState().diagram;
    let lastSelection = useEditor.getState().selection;
    this.unsubscribe = useEditor.subscribe((state) => {
      if (state.diagram && state.diagram !== this.lastSynced) this.schedulePatch();
      if (state.selection !== lastSelection) {
        lastSelection = state.selection;
        this.schedulePresence();
      }
    });
  }

  /** Resolves with the next snapshot a peer sends (used when joining from a link). */
  waitForSnapshot(timeoutMs: number): Promise<Diagram | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, timeoutMs);
      this.snapshotWaiters.push((d) => {
        clearTimeout(timer);
        resolve(d);
      });
    });
  }

  setCursor(cursor: PeerPresence["cursor"]): void {
    this.cursor = cursor;
    this.schedulePresence();
  }

  stop(): void {
    this.stopped = true;
    this.flushPatch();
    void this.send({ t: "bye", client: this.client });
    this.unsubscribe?.();
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.patchTimer) clearTimeout(this.patchTimer);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    // Let the goodbye go out before closing.
    const socket = this.socket;
    setTimeout(() => socket?.close(1000, "Left session"), 50);
    useLive.setState({ status: "idle", secret: null, peers: new Map(), connections: 0, error: null });
  }

  private connect(): void {
    if (this.stopped) return;
    const socket = new WebSocket(relayUrl(this.secret.roomId));
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.retries = 0;
      useLive.setState({ status: "connected", error: null });
      void this.send({ t: "hello", client: this.client });
      this.sendPresence();
    });
    socket.addEventListener("message", (event: MessageEvent<ArrayBuffer | string>) => {
      if (typeof event.data === "string") {
        // Plain-text frames come from the relay itself.
        try {
          const info = JSON.parse(event.data) as { type?: string; count?: number };
          if (info.type === "peers" && typeof info.count === "number")
            useLive.setState({ connections: info.count });
        } catch {
          // Ignore anything unexpected.
        }
        return;
      }
      void this.receive(event.data);
    });
    socket.addEventListener("close", (event) => {
      if (this.stopped) return;
      if (event.code === 4001 || event.code === 4003) {
        useLive.setState({
          status: "error",
          error:
            event.code === 4001 ? "This live session is full." : "The live server is busy. Try again later.",
        });
        return;
      }
      // Reconnect with capped exponential backoff; peers will send a fresh snapshot.
      this.retries += 1;
      this.acceptNextSnapshot = true;
      useLive.setState({ status: "reconnecting", peers: new Map() });
      setTimeout(
        () => {
          this.connect();
        },
        Math.min(15_000, 500 * 2 ** Math.min(this.retries, 5)),
      );
    });
  }

  private async send(message: Message): Promise<void> {
    const socket = this.socket;
    if (!this.key || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(await seal(this.key, message));
  }

  private async receive(frame: ArrayBuffer): Promise<void> {
    if (!this.key) return;
    const message = (await open(this.key, frame)) as Message | null;
    if (!message || typeof message !== "object" || message.client === this.client) return;
    const editor = useEditor.getState();
    switch (message.t) {
      case "hello": {
        // A newcomer: send our copy so they can catch up.
        if (editor.diagram && !this.acceptNextSnapshot)
          void this.send({ t: "snapshot", client: this.client, diagram: editor.diagram });
        this.sendPresence();
        return;
      }
      case "snapshot": {
        const diagram = acceptSnapshot(message.diagram);
        if (!diagram) return;
        const waiters = this.snapshotWaiters.splice(0);
        for (const resolve of waiters) resolve(diagram);
        if (this.acceptNextSnapshot && editor.diagram) {
          this.acceptNextSnapshot = false;
          editor.applyRemote(() => diagram, true);
          this.lastSynced = useEditor.getState().diagram;
        }
        return;
      }
      case "patch": {
        if (!editor.diagram) return;
        // Send our own pending edits first so they aren't mistaken for the remote change.
        this.flushPatch();
        editor.applyRemote((d) => applyPatch(d, message.patch));
        this.lastSynced = useEditor.getState().diagram;
        return;
      }
      case "presence": {
        const peers = new Map(useLive.getState().peers);
        peers.set(message.client, {
          client: message.client,
          name: message.name.slice(0, 100) || "Anonymous",
          color: colorFor(message.client),
          cursor: message.cursor,
          selection: Array.isArray(message.selection) ? message.selection.slice(0, 500) : [],
          seenAt: Date.now(),
        });
        useLive.setState({ peers });
        return;
      }
      case "bye": {
        const peers = new Map(useLive.getState().peers);
        peers.delete(message.client);
        useLive.setState({ peers });
        return;
      }
    }
  }

  private schedulePatch(): void {
    this.patchTimer ??= setTimeout(() => {
      this.patchTimer = null;
      this.flushPatch();
    }, PATCH_THROTTLE_MS);
  }

  private flushPatch(): void {
    if (this.patchTimer) {
      clearTimeout(this.patchTimer);
      this.patchTimer = null;
    }
    const current = useEditor.getState().diagram;
    if (!current || !this.lastSynced || current === this.lastSynced) return;
    const patch = diffDiagrams(this.lastSynced, current);
    this.lastSynced = current;
    if (patch) void this.send({ t: "patch", client: this.client, patch });
  }

  private schedulePresence(): void {
    this.presenceTimer ??= setTimeout(() => {
      this.presenceTimer = null;
      this.sendPresence();
    }, PRESENCE_THROTTLE_MS);
  }

  private sendPresence(): void {
    const selection = useEditor.getState().selection;
    void this.send({
      t: "presence",
      client: this.client,
      name: getDisplayName(),
      cursor: this.cursor,
      selection: [...selection.nodeIds, ...selection.taskIds, ...selection.cardIds],
    });
  }
}

let current: LiveSession | null = null;

export function currentSession(): LiveSession | null {
  return current;
}

/** Starts (or reuses) the session for a room. */
export async function startSession(secret: RoomSecret, joining: boolean): Promise<LiveSession> {
  if (current?.secret.roomId === secret.roomId) return current;
  current?.stop();
  const session = new LiveSession(secret, joining);
  current = session;
  await session.start();
  return session;
}

export function stopSession(): void {
  current?.stop();
  current = null;
}
