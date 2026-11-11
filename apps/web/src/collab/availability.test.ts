import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRelay, resetRelayCheck } from "./availability";
import { relayHealthUrl } from "./session";

describe("relay availability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetRelayCheck();
  });

  it("is available when the health check says ok", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ ok: true, rooms: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkRelay()).toBe(true);
    expect(await checkRelay()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is unavailable when there is no relay behind /api", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("Bad Gateway", { status: 502 })));
    expect(await checkRelay()).toBe(false);
  });

  it("is unavailable when the request fails", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    expect(await checkRelay()).toBe(false);
  });

  it("is unavailable when something other than the relay answers", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("<!doctype html>", { status: 200 })));
    expect(await checkRelay()).toBe(false);
  });

  it("asks a separately hosted relay over HTTP", () => {
    expect(relayHealthUrl()).toBe("/api/health");
    vi.stubEnv("VITE_LINEWORK_RELAY_URL", "wss://relay.example.com/");
    expect(relayHealthUrl()).toBe("https://relay.example.com/api/health");
  });
});
