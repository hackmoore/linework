import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { CLOSE_RATE_LIMITED, CLOSE_ROOM_FULL, createRelay, type Relay, type RelayOptions } from "./relay.ts";

const ROOM = "room_abcdefghijklmnop";
let relay: Relay | null = null;

async function start(options: RelayOptions = {}): Promise<string> {
  relay = createRelay(options);
  const server = relay.server;
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

function connect(host: string, room = ROOM): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}/api/rooms/${room}`);
    ws.once("open", () => {
      resolve(ws);
    });
    ws.once("error", reject);
  });
}

function nextMessage(ws: WebSocket, wantBinary: boolean): Promise<Buffer | string> {
  return new Promise((resolve) => {
    const onMessage = (data: Buffer, isBinary: boolean): void => {
      if (isBinary !== wantBinary) return;
      ws.off("message", onMessage);
      resolve(isBinary ? data : data.toString());
    };
    ws.on("message", onMessage);
  });
}

function closed(ws: WebSocket): Promise<number> {
  return new Promise((resolve) =>
    ws.once("close", (code: number) => {
      resolve(code);
    }),
  );
}

afterEach(async () => {
  await relay?.close();
  relay = null;
});

describe("relay", () => {
  it("answers health checks and 404s everything else", async () => {
    const host = await start();
    expect(await (await fetch(`http://${host}/api/health`)).json()).toEqual({ ok: true, rooms: 0 });
    expect((await fetch(`http://${host}/nope`)).status).toBe(404);
  });

  it("forwards binary frames to the other peers in the room only", async () => {
    const host = await start();
    const a = await connect(host);
    const b = await connect(host);
    const other = await connect(host, "room_zzzzzzzzzzzzzzzz");
    const received = nextMessage(b, true);
    let leaked = false;
    other.on("message", (_data, isBinary) => {
      if (isBinary) leaked = true;
    });
    let echoed = false;
    a.on("message", (_data, isBinary) => {
      if (isBinary) echoed = true;
    });
    a.send(Buffer.from([1, 2, 3]), { binary: true });
    expect(Array.from((await received) as Buffer)).toEqual([1, 2, 3]);
    await new Promise((r) => setTimeout(r, 50));
    expect(leaked).toBe(false);
    expect(echoed).toBe(false);
    for (const ws of [a, b, other]) ws.close();
  });

  it("tells peers how many are connected", async () => {
    const host = await start();
    const a = await connect(host);
    const count = nextMessage(a, false);
    const b = await connect(host);
    // a sees its own join (1) or the second join (2) first depending on timing; wait for 2.
    let message = await count;
    while (!String(message).includes('"count":2')) message = await nextMessage(a, false);
    expect(JSON.parse(String(message))).toEqual({ type: "peers", count: 2 });
    expect(relay?.roomSizes().get(ROOM)).toBe(2);
    b.close();
    a.close();
  });

  it("rejects bad room ids and full rooms", async () => {
    const host = await start({ maxPeersPerRoom: 1 });
    await expect(connect(host, "short")).rejects.toThrow();
    const a = await connect(host);
    const b = new WebSocket(`ws://${host}/api/rooms/${ROOM}`);
    expect(await closed(b)).toBe(CLOSE_ROOM_FULL);
    a.close();
  });

  it("disconnects clients that flood the room", async () => {
    const host = await start({ messagesPerSecond: 5 });
    const a = await connect(host);
    const code = closed(a);
    for (let i = 0; i < 50; i++) a.send(Buffer.from([i]), { binary: true });
    expect(await code).toBe(CLOSE_RATE_LIMITED);
  });

  it("enforces allowed origins", async () => {
    const host = await start({ allowedOrigins: ["https://linework.example"] });
    await expect(connect(host)).rejects.toThrow();
    const ok = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://${host}/api/rooms/${ROOM}`, { origin: "https://linework.example" });
      ws.once("open", () => {
        resolve(ws);
      });
      ws.once("error", reject);
    });
    ok.close();
  });
});
