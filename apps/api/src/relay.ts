import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";

/**
 * Live-collaboration relay.
 *
 * Clients join a room over WebSocket and every binary frame they send is forwarded to the
 * other clients in that room. Frames are end-to-end encrypted by the browsers (the key is
 * in the share link's #fragment, which never reaches this server), so the relay can't read
 * charts and stores nothing. The only messages it writes itself are small JSON text frames
 * telling clients how many peers are connected.
 */

export interface RelayOptions {
  /** Largest frame accepted, in bytes. Whole diagrams are sent on join, so this is generous. */
  readonly maxMessageBytes?: number;
  readonly maxPeersPerRoom?: number;
  readonly maxRooms?: number;
  /** Frames per second a client may send (bursts up to twice this are allowed). */
  readonly messagesPerSecond?: number;
  /** Allowed browser origins; empty allows any (fine for local development). */
  readonly allowedOrigins?: readonly string[];
  readonly heartbeatMs?: number;
}

const ROOM_PATH = /^\/api\/rooms\/([A-Za-z0-9_-]{16,64})$/;

/** Close codes in the private range, so clients can show a useful message. */
export const CLOSE_ROOM_FULL = 4001;
export const CLOSE_RATE_LIMITED = 4002;
export const CLOSE_SERVER_FULL = 4003;

interface Peer {
  readonly socket: WebSocket;
  alive: boolean;
  tokens: number;
  lastRefill: number;
}

export interface Relay {
  readonly server: Server;
  /** Room sizes, for tests and health checks. */
  roomSizes(): Map<string, number>;
  close(): Promise<void>;
}

export function createRelay(options: RelayOptions = {}): Relay {
  const maxMessageBytes = options.maxMessageBytes ?? 4 * 1024 * 1024;
  const maxPeersPerRoom = options.maxPeersPerRoom ?? 50;
  const maxRooms = options.maxRooms ?? 10_000;
  const rate = options.messagesPerSecond ?? 60;
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const rooms = new Map<string, Set<Peer>>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/api/health") {
      // Any origin may ask: the web app checks this to decide whether to offer live sessions,
      // and it may be hosted on a different origin from the relay.
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", code: "not_found" }));
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes });

  const broadcastPeerCount = (room: Set<Peer>): void => {
    const message = JSON.stringify({ type: "peers", count: room.size });
    for (const peer of room) if (peer.socket.readyState === WebSocket.OPEN) peer.socket.send(message);
  };

  server.on("upgrade", (req, socket, head) => {
    const match = ROOM_PATH.exec(req.url ?? "");
    const origin = req.headers.origin ?? "";
    if (!match || (allowedOrigins.size > 0 && !allowedOrigins.has(origin))) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const roomId = match[1] ?? "";
    wss.handleUpgrade(req, socket, head, (ws) => {
      let room = rooms.get(roomId);
      if (!room) {
        if (rooms.size >= maxRooms) {
          ws.close(CLOSE_SERVER_FULL, "Server is full");
          return;
        }
        room = new Set();
        rooms.set(roomId, room);
      }
      if (room.size >= maxPeersPerRoom) {
        ws.close(CLOSE_ROOM_FULL, "Room is full");
        return;
      }
      const peer: Peer = { socket: ws, alive: true, tokens: rate * 2, lastRefill: Date.now() };
      const joined = room;
      joined.add(peer);
      broadcastPeerCount(joined);

      ws.on("pong", () => {
        peer.alive = true;
      });

      ws.on("message", (data: RawData, isBinary: boolean) => {
        // Token bucket: refill by elapsed time, spend one per frame.
        const now = Date.now();
        peer.tokens = Math.min(rate * 2, peer.tokens + ((now - peer.lastRefill) / 1000) * rate);
        peer.lastRefill = now;
        if (peer.tokens < 1) {
          ws.close(CLOSE_RATE_LIMITED, "Too many messages");
          return;
        }
        peer.tokens -= 1;
        // Only encrypted (binary) frames are relayed; text frames are reserved for the server.
        if (!isBinary) return;
        for (const other of joined) {
          if (other !== peer && other.socket.readyState === WebSocket.OPEN)
            other.socket.send(data, { binary: true });
        }
      });

      ws.on("close", () => {
        joined.delete(peer);
        if (joined.size === 0) rooms.delete(roomId);
        else broadcastPeerCount(joined);
      });

      ws.on("error", () => {
        ws.terminate();
      });
    });
  });

  // Drop connections that stop answering pings (closed laptops, dropped networks).
  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const peer of room) {
        if (!peer.alive) {
          peer.socket.terminate();
          continue;
        }
        peer.alive = false;
        peer.socket.ping();
      }
    }
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref();

  return {
    server,
    roomSizes: () => new Map([...rooms].map(([id, peers]) => [id, peers.size])),
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close(() => {
          resolve();
        });
      }),
  };
}
