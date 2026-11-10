import { describe, expect, it } from "vitest";
import { SHAPE_KINDS } from "@linework/shared";
import { createNode } from "../diagram/factory";
import {
  boundaryPoint,
  boundsOf,
  edgePoints,
  polylineMidpoint,
  seedFrom,
  shapePath,
  wrapText,
} from "./geometry";

describe("boundaryPoint", () => {
  it("hits the right edge of a rectangle", () => {
    const node = createNode("rectangle", 0, 0, { width: 100, height: 50 });
    expect(boundaryPoint(node, { x: 500, y: 0 })).toEqual({ x: 50, y: 0 });
  });

  it("lies on the ellipse outline", () => {
    const node = createNode("ellipse", 0, 0, { width: 100, height: 60 });
    const p = boundaryPoint(node, { x: 300, y: 200 });
    expect((p.x / 50) ** 2 + (p.y / 30) ** 2).toBeCloseTo(1);
  });

  it("lies on the diamond outline", () => {
    const node = createNode("diamond", 0, 0, { width: 100, height: 60 });
    const p = boundaryPoint(node, { x: 40, y: 90 });
    expect(Math.abs(p.x) / 50 + Math.abs(p.y) / 30).toBeCloseTo(1);
  });
});

describe("edgePoints", () => {
  const a = createNode("rectangle", 0, 0, { width: 100, height: 50 });
  const b = createNode("rectangle", 300, 200, { width: 100, height: 50 });

  it("routes elbow edges with axis-aligned segments", () => {
    const points = edgePoints({ routing: "elbow" }, a, b);
    expect(points[0]).toEqual({ x: 50, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 250, y: 200 });
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      expect(prev && cur && (prev.x === cur.x || prev.y === cur.y)).toBe(true);
    }
  });

  it("collapses elbows when nodes are aligned", () => {
    const c = createNode("rectangle", 300, 0, { width: 100, height: 50 });
    expect(edgePoints({ routing: "elbow" }, a, c)).toHaveLength(2);
  });
});

describe("polylineMidpoint", () => {
  it("finds the middle by length", () => {
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 30 },
      ]),
    ).toEqual({ x: 10, y: 10 });
  });
});

describe("wrapText", () => {
  it("keeps explicit line breaks and wraps long lines", () => {
    const lines = wrapText("one two three four five\nsix", 60, 10);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[lines.length - 1]).toBe("six");
  });

  it("hard-breaks words longer than a line", () => {
    expect(wrapText("abcdefghijkl", 30, 10)).toEqual(["abcde", "fghij", "kl"]);
  });
});

describe("shapePath", () => {
  it("produces an outline for every drawable kind", () => {
    for (const kind of SHAPE_KINDS) {
      const d = shapePath(kind, { x: 0, y: 0, width: 100, height: 60 }, 8);
      if (kind === "text" || kind === "icon") expect(d).toBe("");
      else expect(d).toMatch(/^M/);
    }
  });
});

describe("helpers", () => {
  it("computes bounds", () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: -5, width: 5, height: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 25, height: 15 });
  });

  it("derives stable positive seeds", () => {
    expect(seedFrom("abc")).toBe(seedFrom("abc"));
    expect(seedFrom("abc")).not.toBe(seedFrom("abd"));
    expect(seedFrom("")).toBeGreaterThan(0);
  });
});
