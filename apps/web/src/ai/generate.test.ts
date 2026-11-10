import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDiagram } from "@linework/shared";
import { generateChart } from "./generate";

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_test" },
  });
}

function message(text: string, stopReason = "end_turn"): unknown {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateChart", () => {
  it("sends a structured-output request and builds the returned diagram", async () => {
    const output = {
      title: "Checkout",
      direction: "LR",
      nodes: [
        { id: "web", label: "Web", shape: null, icon: "browser", color: null, group: null },
        { id: "db", label: "DB", shape: "cylinder", icon: null, color: "green", group: "Backend" },
      ],
      edges: [{ from: "web", to: "db", label: null, style: null }],
    };
    const fetchMock = vi.fn(() => Promise.resolve(reply(message(JSON.stringify(output)))));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateChart("flowchart", "checkout architecture", "sk-ant-test");
    if (!result.ok) throw new Error(result.error);
    expect(parseDiagram(result.diagram).ok).toBe(true);
    expect(result.diagram.title).toBe("Checkout");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect((body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
  });

  it("explains refusals and bad keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(reply(message("", "refusal")))),
    );
    const refused = await generateChart("gantt", "x", "sk-ant-test");
    expect(!refused.ok && refused.error).toMatch(/declined/);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          reply({ type: "error", error: { type: "authentication_error", message: "bad" } }, 401),
        ),
      ),
    );
    const denied = await generateChart("gantt", "x", "sk-ant-bad");
    expect(!denied.ok && denied.error).toMatch(/rejected/);
  });

  it("needs a key", async () => {
    expect((await generateChart("gantt", "x", " ")).ok).toBe(false);
  });
});
