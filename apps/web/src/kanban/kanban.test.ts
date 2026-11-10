import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram, type KanbanData } from "@linework/shared";
import { applyPatch, diffDiagrams } from "../collab/patch";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToMermaid, parseMermaid } from "../mermaid/mermaid";
import { importText } from "../share/importText";
import { parseSimpleSpec } from "../share/simpleSpec";
import { buildTemplate } from "../templates/build";
import {
  addCard,
  addColumn,
  addLane,
  deleteColumn,
  deleteLane,
  moveCard,
  moveCardAcross,
  moveCardInColumn,
  moveColumn,
} from "./actions";
import { cardsToCsv, importCards, isKanbanCsv } from "./io";
import { computeKanbanLayout } from "./layout";
import {
  boardRows,
  createCard,
  createKanbanData,
  isOverdue,
  isOverLimit,
  matchesFilter,
  parseTags,
} from "./model";

function valid(d: Diagram): void {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
}

function board(): KanbanData {
  const data = useEditor.getState().diagram?.kanban;
  if (!data) throw new Error("no board");
  return data;
}

function titlesIn(columnIndex: number): string[] {
  const column = board().columns[columnIndex];
  return board()
    .cards.filter((c) => c.columnId === column?.id)
    .map((c) => c.title);
}

beforeEach(() => {
  useEditor
    .getState()
    .load({ ...createDiagram("Board", "professional", "kanban"), kanban: createKanbanData() });
});

describe("kanban actions", () => {
  it("adds, moves and reorders cards in one undo step each", () => {
    const todo = board().columns[0]?.id ?? "";
    const a = addCard(todo, null, "A") ?? "";
    const b = addCard(todo, null, "B") ?? "";
    expect(titlesIn(0)).toEqual(["A", "B"]);
    expect(useEditor.getState().selection.cardIds).toEqual([b]);

    moveCardInColumn(b, -1);
    expect(titlesIn(0)).toEqual(["B", "A"]);
    moveCardAcross(a, 1);
    expect(titlesIn(1)).toEqual(["A"]);
    moveCard(b, board().columns[1]?.id ?? "", null, a);
    expect(titlesIn(1)).toEqual(["B", "A"]);
    useEditor.getState().undo();
    expect(titlesIn(0)).toEqual(["B"]);
    const diagram = useEditor.getState().diagram;
    if (diagram) valid(diagram);
  });

  it("ignores moves that change nothing", () => {
    const todo = board().columns[0]?.id ?? "";
    const a = addCard(todo, null, "A") ?? "";
    const before = useEditor.getState().past.length;
    moveCardInColumn(a, -1);
    moveCardAcross(a, -1);
    moveCard(a, todo, null, null);
    moveColumn(todo, -1);
    expect(useEditor.getState().past.length).toBe(before);
  });

  it("moves cards to a neighbour when their column is deleted", () => {
    const [todo, doing] = board().columns;
    addCard(doing?.id ?? "", null, "Busy");
    deleteColumn(doing?.id ?? "");
    expect(board().columns).toHaveLength(2);
    expect(board().cards[0]?.columnId).toBe(todo?.id);
  });

  it("puts existing cards in the first lane and takes them out with the last", () => {
    const todo = board().columns[0]?.id ?? "";
    addCard(todo, null, "A");
    const lane = addLane("Web") ?? "";
    expect(board().cards[0]?.laneId).toBe(lane);
    expect(boardRows(board()).map((r) => r.laneId)).toEqual([lane]);
    deleteLane(lane);
    expect(board().cards[0]?.laneId).toBeNull();
    expect(boardRows(board()).map((r) => r.laneId)).toEqual([null]);
  });

  it("deletes selected cards and their comments", () => {
    const id = addCard(board().columns[0]?.id ?? "", null, "A") ?? "";
    useEditor.getState().commit((d) => ({
      ...d,
      comments: [
        {
          id: "c1",
          targetId: id,
          x: 0,
          y: 0,
          author: "Me",
          text: "Hi",
          createdAt: new Date().toISOString(),
          resolved: false,
          replies: [],
        },
      ],
    }));
    useEditor.getState().select({ cardIds: [id] });
    useEditor.getState().deleteSelection();
    expect(board().cards).toHaveLength(0);
    expect(useEditor.getState().diagram?.comments).toHaveLength(0);
  });

  it("selects all cards", () => {
    addCard(board().columns[0]?.id ?? "", null, "A");
    addColumn();
    useEditor.getState().selectAll();
    expect(useEditor.getState().selection.cardIds).toHaveLength(1);
  });
});

describe("kanban model", () => {
  it("flags WIP limits and overdue cards outside done columns", () => {
    const data = createKanbanData();
    const [todo, doing, done] = data.columns;
    if (!todo || !doing || !done) throw new Error("columns");
    const cards = [1, 2, 3, 4].map((n) => createCard(`C${String(n)}`, doing.id));
    expect(isOverLimit({ ...data, cards }, doing)).toBe(true);
    expect(isOverLimit({ ...data, cards: cards.slice(1) }, doing)).toBe(false);
    const late = createCard("Late", todo.id, null, { due: "2026-01-01" });
    expect(isOverdue(late, data, "2026-02-01")).toBe(true);
    expect(isOverdue({ ...late, columnId: done.id }, data, "2026-02-01")).toBe(false);
    expect(isOverdue(late, data, "2025-12-31")).toBe(false);
  });

  it("parses tags and filters cards", () => {
    expect(parseTags(" bug, Bug ,, backend,bug ")).toEqual(["bug", "Bug", "backend"]);
    const card = createCard("Fix login", "c", null, { owner: "Sam", tags: ["auth"] });
    expect(matchesFilter(card, "sam")).toBe(true);
    expect(matchesFilter(card, "AUTH")).toBe(true);
    expect(matchesFilter(card, "billing")).toBe(false);
  });

  it("lays out lanes and stacks cards", () => {
    const diagram = buildTemplate("kanban");
    const layout = computeKanbanLayout(diagram.kanban ?? createKanbanData(), "2026-03-01");
    expect(layout.columns).toHaveLength(5);
    expect(layout.cards).toHaveLength(diagram.kanban?.cards.length ?? 0);
    const firstColumn = layout.cards.filter((c) => c.x === layout.columns[0]?.x);
    expect((firstColumn[1]?.y ?? 0) > (firstColumn[0]?.y ?? 0)).toBe(true);
  });
});

describe("kanban import and export", () => {
  it("round-trips cards through CSV", () => {
    const data = buildTemplate("kanban").kanban ?? createKanbanData();
    const csv = cardsToCsv(data);
    expect(isKanbanCsv(csv)).toBe(true);
    const result = importCards({ ...createKanbanData(), columns: [] }, csv);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.columns.map((c) => c.name)).toEqual(data.columns.map((c) => c.name));
    expect(result.data.cards.map((c) => [c.title, c.owner, c.due, c.tags, c.priority])).toEqual(
      data.cards.map((c) => [c.title, c.owner, c.due, c.tags, c.priority]),
    );
  });

  it("imports Trello and Jira style headers, creating columns and lanes", () => {
    const csv =
      "Summary,Status,Assignee,Labels,Priority,Team\nFix it,In Progress,Sam,bug;ui,Highest,Web\nPlan,Backlog,,,,\n";
    const result = importCards(createKanbanData(), csv);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.columns.map((c) => c.name)).toEqual(["To do", "In progress", "Done", "Backlog"]);
    const fix = result.data.cards.find((c) => c.title === "Fix it");
    expect(fix?.tags).toEqual(["bug", "ui"]);
    expect(fix?.priority).toBe("urgent");
    expect(result.data.lanes.map((l) => l.name)).toEqual(["Web"]);
    expect(result.data.cards.every((c) => c.laneId !== null)).toBe(true);
    expect(importCards(createKanbanData(), "Owner\nSam").ok).toBe(false);
  });

  it("opens a kanban CSV as a board and a task CSV as a gantt chart", () => {
    const kanban = importText("Title,Status\nA,Doing", "cards.csv");
    expect(kanban.ok && kanban.diagram.chartType).toBe("kanban");
    const gantt = importText("Name,Start\nA,2026-03-02", "plan.csv");
    expect(gantt.ok && gantt.diagram.chartType).toBe("gantt");
  });

  it("parses Mermaid kanban with metadata and front matter", () => {
    const text = [
      "---",
      "title: Sprint",
      "---",
      "kanban",
      "  todo[To do]",
      "    t1[Write spec]@{ assigned: 'Sam', priority: 'Very High', ticket: 'MC-1' }",
      "    [Plain card]",
      "  Done",
      "    t3[Ship it]",
    ].join("\n");
    const result = parseMermaid(text);
    if (!result.ok) throw new Error(result.error);
    valid(result.diagram);
    const k = result.diagram.kanban;
    expect(result.diagram.title).toBe("Sprint");
    expect(k?.columns.map((c) => [c.name, c.done])).toEqual([
      ["To do", false],
      ["Done", true],
    ]);
    expect(k?.cards[0]).toMatchObject({
      title: "Write spec",
      owner: "Sam",
      priority: "urgent",
      tags: ["MC-1"],
    });
    expect(k?.cards.map((c) => c.title)).toEqual(["Write spec", "Plain card", "Ship it"]);
  });

  it("round-trips through Mermaid", () => {
    const original = buildTemplate("kanban");
    const result = parseMermaid(diagramToMermaid(original));
    if (!result.ok) throw new Error(result.error);
    expect(result.diagram.title).toBe(original.title);
    expect(result.diagram.kanban?.cards.map((c) => [c.title, c.owner])).toEqual(
      original.kanban?.cards.map((c) => [c.title, c.owner]),
    );
  });

  it("builds boards from the simple spec", () => {
    const result = parseSimpleSpec({
      type: "kanban",
      title: "Sprint",
      lanes: ["Web"],
      columns: [
        { name: "To do", cards: [{ title: "A", lane: "Mobile", priority: "high" }, { title: "B" }] },
        { name: "Doing", wip: 2, color: "amber", cards: [{ title: "C", due: "2026-03-06", lane: "Web" }] },
        { name: "Done" },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    valid(result.diagram);
    const k = result.diagram.kanban;
    expect(k?.lanes.map((l) => l.name)).toEqual(["Web", "Mobile"]);
    expect(k?.columns.map((c) => [c.wipLimit, c.done])).toEqual([
      [null, false],
      [2, false],
      [null, true],
    ]);
    // A card without a lane goes in the first lane.
    expect(k?.cards[1]?.laneId).toBe(k?.lanes[0]?.id);
    expect(parseSimpleSpec({ type: "kanban", columns: [] }).ok).toBe(false);
  });
});

describe("kanban collaboration", () => {
  it("merges card edits and repairs cards in deleted columns", () => {
    const original = buildTemplate("kanban");
    const k = original.kanban ?? createKanbanData();
    const [first, second] = k.cards;
    const doneColumn = k.columns.at(-1)?.id ?? "";
    // They move one card and delete the Backlog column; I edit another card.
    const theirs: Diagram = {
      ...original,
      kanban: {
        ...k,
        columns: k.columns.slice(1),
        cards: k.cards
          .filter((c) => c.columnId !== k.columns[0]?.id)
          .map((c) => (c.id === k.cards[4]?.id ? { ...c, columnId: doneColumn } : c)),
      },
    };
    const mine: Diagram = {
      ...original,
      kanban: { ...k, cards: k.cards.map((c) => (c.id === first?.id ? { ...c, title: "Renamed" } : c)) },
    };
    const patch = diffDiagrams(original, theirs);
    if (!patch) throw new Error("no patch");
    const merged = applyPatch(mine, patch);
    valid(merged);
    expect(merged.kanban?.columns).toHaveLength(4);
    expect(merged.kanban?.cards.find((c) => c.id === k.cards[4]?.id)?.columnId).toBe(doneColumn);
    // Cards from the deleted column that only I still had were removed by them.
    expect(merged.kanban?.cards.some((c) => c.id === first?.id || c.id === second?.id)).toBe(false);
  });
});
