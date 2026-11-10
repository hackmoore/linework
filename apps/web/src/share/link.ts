import { parseDiagram, type Diagram } from "@linework/shared";
import { parseMermaid } from "../mermaid/mermaid";
import { parseSimpleSpec } from "./simpleSpec";

/*
 * Charts in URLs. Everything lives in the #fragment, which browsers never send to a
 * server, so a shared chart stays private to whoever has the link.
 *
 *   /open#d=<deflate+base64url Linework JSON>   share links made by the app
 *   /open#m=<URL-encoded Mermaid>                 flowchart, gantt or kanban text
 *   /open#s=<URL-encoded or base64url JSON>       the simple spec (see simpleSpec.ts)
 *   /open#j=<URL-encoded or base64url JSON>       a full Linework file
 *
 * /embed# takes the same payloads and shows a read-only view.
 */

export type DecodeResult =
  | { ok: true; diagram: Diagram; source: "share" | "mermaid" | "spec" | "file" }
  | { ok: false; error: string };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Write and read concurrently so large payloads don't stall on backpressure.
  const written = writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close());
  const output = new Response(stream.readable).arrayBuffer();
  const [, buffer] = await Promise.all([written, output]);
  return new Uint8Array(buffer);
}

export async function compressDiagram(diagram: Diagram): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(diagram));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decompressDiagram(payload: string): Promise<unknown> {
  const bytes = await pipe(fromBase64Url(payload), new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function shareLink(
  diagram: Diagram,
  origin: string,
  path: "open" | "embed" = "open",
): Promise<string> {
  return `${origin}/${path}#d=${await compressDiagram(diagram)}`;
}

/** Text from a fragment value: URL-encoded, or base64url as LLMs sometimes produce. */
function decodeText(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.replaceAll("+", "%20"));
  } catch {
    decoded = value;
  }
  const trimmed = decoded.trim();
  if (/^[{[]/.test(trimmed) || /^(flowchart|graph|gantt|kanban|---)\b/i.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9_-]+={0,2}$/.test(trimmed)) {
    try {
      return new TextDecoder().decode(fromBase64Url(trimmed)).trim();
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The link's JSON is malformed");
  }
}

/** Decodes a location.hash (with or without the leading #). */
export async function decodeFragment(hash: string): Promise<DecodeResult> {
  const params = new URLSearchParams(hash.replace(/^#/, "").replace(/\+/g, "%2B"));
  try {
    const d = params.get("d");
    if (d) {
      const parsed = parseDiagram(await decompressDiagram(d));
      return parsed.ok
        ? { ok: true, diagram: parsed.value, source: "share" }
        : { ok: false, error: parsed.error };
    }
    // URLSearchParams already decoded these values once; decode raw text ourselves for robustness.
    const raw = (key: string): string | null => {
      const match = new RegExp(`(?:^|&)${key}=([^&]*)`).exec(hash.replace(/^#/, ""));
      return match?.[1] ?? null;
    };
    const m = raw("m");
    if (m) {
      const result = parseMermaid(decodeText(m));
      return result.ok
        ? { ok: true, diagram: result.diagram, source: "mermaid" }
        : { ok: false, error: result.error };
    }
    const s = raw("s");
    if (s) {
      const result = parseSimpleSpec(parseJson(decodeText(s)));
      return result.ok
        ? { ok: true, diagram: result.diagram, source: "spec" }
        : { ok: false, error: result.error };
    }
    const j = raw("j");
    if (j) {
      const parsed = parseDiagram(parseJson(decodeText(j)));
      return parsed.ok
        ? { ok: true, diagram: parsed.value, source: "file" }
        : { ok: false, error: parsed.error };
    }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "The link could not be read" };
  }
  return { ok: false, error: "This link doesn't contain a chart" };
}
