import { describe, expect, it } from "vitest";
import { validateNetwork } from "./network.js";

describe("network maps", () => {
  it("accepts unique entities and links with ordered dates", () => {
    expect(
      validateNetwork({
        entities: [{ id: "a", type: "person", attributes: [{ key: "Role", value: "Director" }], notes: "" }],
        links: [{ id: "l", date: "2025-01-01", endDate: "2025-02-01" }],
      }),
    ).toEqual([]);
  });

  it("flags duplicate ids and links that end before they start", () => {
    const entity = { id: "a", type: "person" as const, attributes: [], notes: "" };
    const issues = validateNetwork({
      entities: [entity, entity],
      links: [{ id: "l", date: "2025-03-01", endDate: "2025-01-01" }],
    }).map(([, message]) => message);
    expect(issues).toEqual(["Duplicate entity id", "Link ends before it starts"]);
  });
});
