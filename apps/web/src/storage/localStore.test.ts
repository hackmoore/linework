import { afterEach, describe, expect, it } from "vitest";
import { createDiagram } from "../diagram/factory";
import { deleteDiagram, getDiagram, listDiagrams, resetLocalStoreForTests, saveDiagram } from "./localStore";

afterEach(async () => {
  await resetLocalStoreForTests();
});

describe("localStore", () => {
  it("saves, loads, lists newest first and deletes", async () => {
    const older = { ...createDiagram("Older"), updatedAt: "2026-01-01T00:00:00.000Z" };
    const newer = { ...createDiagram("Newer"), updatedAt: "2026-02-01T00:00:00.000Z" };
    await saveDiagram(older);
    await saveDiagram(newer);

    expect(await getDiagram(older.id)).toEqual(older);
    expect((await listDiagrams()).map((s) => s.title)).toEqual(["Newer", "Older"]);

    await deleteDiagram(older.id);
    expect(await getDiagram(older.id)).toBeNull();
    expect(await listDiagrams()).toHaveLength(1);
  });

  it("returns null for missing diagrams", async () => {
    expect(await getDiagram("missing")).toBeNull();
  });
});
