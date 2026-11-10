import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDiagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import {
  AUTO_VERSION_INTERVAL_MS,
  deleteDiagram,
  listVersions,
  maybeAutoVersion,
  resetLocalStoreForTests,
  saveDiagram,
  saveVersion,
} from "../storage/localStore";
import { addComment, deleteComment, replyToComment, setCommentResolved } from "./comments";
import { useEditor } from "./store";

beforeEach(() => {
  useEditor.getState().load(createDiagram("Test"));
});

afterEach(async () => {
  await resetLocalStoreForTests();
});

describe("comments", () => {
  it("adds, replies, resolves and deletes", () => {
    const id = addComment("  Needs a label  ", "Sam", { targetId: null, x: 10, y: 20 }) ?? "";
    replyToComment(id, "Done", "Lee");
    setCommentResolved(id, true);
    const comment = useEditor.getState().diagram?.comments[0];
    expect(comment?.text).toBe("Needs a label");
    expect(comment?.replies.map((r) => r.author)).toEqual(["Lee"]);
    expect(comment?.resolved).toBe(true);
    deleteComment(id);
    expect(useEditor.getState().diagram?.comments).toEqual([]);
  });

  it("ignores empty comments and removes comments with their shape", () => {
    expect(addComment("   ", "Sam", { targetId: null, x: 0, y: 0 })).toBeNull();
    const node = useEditor.getState().addNode("rectangle", 0, 0);
    addComment("On the box", "Sam", { targetId: node, x: 0, y: 0 });
    useEditor.getState().select({ nodeIds: [node] });
    useEditor.getState().deleteSelection();
    const d = useEditor.getState().diagram;
    expect(d?.comments).toEqual([]);
    expect(d && parseDiagram(d).ok).toBe(true);
  });
});

describe("version history", () => {
  it("keeps named versions and throttles automatic ones", async () => {
    const diagram = createDiagram("Plan");
    await saveDiagram(diagram);
    expect(await maybeAutoVersion(diagram)).toBe(true);
    expect(await maybeAutoVersion(diagram)).toBe(false);
    expect(await maybeAutoVersion(diagram, Date.now() + AUTO_VERSION_INTERVAL_MS + 1)).toBe(true);
    await saveVersion({ ...diagram, title: "Named" }, "Before review", false);
    const versions = await listVersions(diagram.id);
    expect(versions).toHaveLength(3);
    expect(versions[0]?.label).toBe("Before review");
    await deleteDiagram(diagram.id);
    expect(await listVersions(diagram.id)).toEqual([]);
  });
});
