// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "./entry-server";

// Prerendering runs in Node with no window or document (scripts/prerender.ts).
describe("prerendering", () => {
  it("renders the home page", async () => {
    const html = await render("/", "");
    expect(html).toContain("Diagrams for projects and software.");
    expect(html).toContain('href="/new"');
  });

  it("renders the AI assistants page, lazy loaded on the client", async () => {
    const html = await render("/llms", "https://linework.example");
    expect(html).toContain("Have your AI assistant draw it");
    expect(html).toContain("Instructions for AI assistants");
    expect(html).toContain("https://linework.example/llms.txt");
  });
});
