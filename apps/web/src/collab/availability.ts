import { useEffect, useState } from "react";
import { relayHealthUrl } from "./session";

/*
 * The relay (apps/api) is optional. A server without it still runs everything except live
 * sessions, so the editor asks the relay's health check before offering them.
 */

export type RelayAvailability = "checking" | "available" | "unavailable";

const TIMEOUT_MS = 5_000;
/** How long a failed check is trusted before asking again. */
const RETRY_AFTER_MS = 30_000;

let pending: Promise<boolean> | null = null;
let known: { available: boolean; at: number } | null = null;

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(relayHealthUrl(), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}

/** Whether the relay answers. Shared by every caller; a success is remembered for the page's life. */
export function checkRelay(): Promise<boolean> {
  if (known && (known.available || Date.now() - known.at < RETRY_AFTER_MS)) {
    return Promise.resolve(known.available);
  }
  pending ??= probe().then((available) => {
    known = { available, at: Date.now() };
    pending = null;
    return available;
  });
  return pending;
}

/** Forget the last answer. For tests. */
export function resetRelayCheck(): void {
  pending = null;
  known = null;
}

export function useRelayAvailability(): RelayAvailability {
  const [state, setState] = useState<RelayAvailability>(() => (known?.available ? "available" : "checking"));
  useEffect(() => {
    let cancelled = false;
    void checkRelay().then((available) => {
      if (!cancelled) setState(available ? "available" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
