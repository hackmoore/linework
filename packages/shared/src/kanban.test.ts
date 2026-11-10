import { describe, expect, it } from "vitest";
import { DIAGRAM_FORMAT_VERSION, itemCount, parseDiagram } from "./diagram.js";
import type { KanbanCard, KanbanData } from "./kanban.js";

function card(overrides: Partial<KanbanCard> & Pick<KanbanCard, "id">): KanbanCard {
  return {
    columnId: "todo",
    laneId: null,
    title: overrides.id,
    description: "",
    owner: "",
    due: null,
    tags: [],
    priority: "none",
    color: null,
    ...overrides,
  };
}

function board(kanban: Partial<KanbanData> | undefined): unknown {
  return {
    version: DIAGRAM_FORMAT_VERSION,
    id: "k1",
    chartType: "kanban",
    title: "Board",
    styleId: "professional",
    background: "#ffffff",
    nodes: [],
    edges: [],
    layers: [{ id: "l1", name: "Layer 1", visible: true, locked: false }],
    comments: [],
    ...(kanban
      ? {
          kanban: {
            columns: [
              { id: "todo", name: "To do", color: "#1a56db", wipLimit: null, done: false },
              { id: "done", name: "Done", color: "#0f766e", wipLimit: 3, done: true },
            ],
            lanes: [{ id: "lane", name: "Team A", collapsed: false }],
            cards: [],
            ...kanban,
          },
        }
      : {}),
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
}

describe("kanban boards", () => {
  it("accepts a valid board and counts its cards", () => {
    const result = parseDiagram(
      board({
        cards: [
          card({ id: "a", due: "2026-03-10", tags: ["bug"], priority: "high" }),
          card({ id: "b", columnId: "done", laneId: "lane" }),
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(itemCount(result.value)).toBe(2);
  });

  it("requires board data", () => {
    const result = parseDiagram(board(undefined));
    expect(!result.ok && result.error).toMatch(/missing its data/);
  });

  it("rejects cards in missing columns or lanes", () => {
    const column = parseDiagram(board({ cards: [card({ id: "a", columnId: "nope" })] }));
    expect(!column.ok && column.error).toMatch(/missing column/);
    const lane = parseDiagram(board({ cards: [card({ id: "a", laneId: "nope" })] }));
    expect(!lane.ok && lane.error).toMatch(/missing lane/);
  });

  it("rejects duplicate ids and bad fields", () => {
    expect(parseDiagram(board({ cards: [card({ id: "a" }), card({ id: "a" })] })).ok).toBe(false);
    expect(parseDiagram(board({ cards: [card({ id: "a", due: "2026-02-30" })] })).ok).toBe(false);
    expect(parseDiagram(board({ cards: [card({ id: "a", tags: [""] })] })).ok).toBe(false);
  });
});
