import { describe, expect, it } from "vitest";
import { createNode } from "../diagram/factory";
import { classLabel, fitCompartments, parseClass, parseColumn, parseTable, tableLabel } from "./compartments";
import { edgeMidpoint, edgePath, edgePoints } from "./geometry";

describe("table and class labels", () => {
  it("reads columns with types and key flags", () => {
    expect(parseColumn("customer_id uuid fk nn")).toEqual({
      name: "customer_id",
      type: "uuid",
      flags: ["FK", "NN"],
    });
    expect(parseColumn("total: numeric(10, 2)")).toEqual({
      name: "total",
      type: "numeric(10, 2)",
      flags: [],
    });
    const table = parseTable("orders\nid uuid PK\n\ncreated_at timestamptz");
    expect(table.name).toBe("orders");
    expect(table.columns.map((c) => c.name)).toEqual(["id", "created_at"]);
    expect(tableLabel(table)).toBe("orders\nid uuid PK\ncreated_at timestamptz");
  });

  it("reads class compartments and stereotypes", () => {
    const c = parseClass("<<interface>>\nRepository\n--\n--\n+ find(id): Item\n+ save(item): void");
    expect(c).toEqual({
      stereotype: "interface",
      name: "Repository",
      attributes: [],
      operations: ["+ find(id): Item", "+ save(item): void"],
    });
    expect(parseClass(classLabel(c))).toEqual(c);
    expect(parseClass("Plain").name).toBe("Plain");
  });

  it("sizes shapes to fit their label", () => {
    const small = createNode("table", 0, 0, { label: "t\na int", height: 500 });
    const fitted = fitCompartments(small);
    expect(fitted.height).toBeLessThan(100);
    const bigger = fitCompartments({ ...fitted, label: "t\na int\nb int\nc int" });
    expect(bigger.height).toBeGreaterThan(fitted.height);
    const plain = createNode("rectangle", 0, 0);
    expect(fitCompartments(plain)).toBe(plain);
  });
});

describe("curved connectors", () => {
  it("leave and enter the facing sides with a smooth curve", () => {
    const a = createNode("rounded", 0, 0, { width: 100, height: 40 });
    const b = createNode("rounded", 300, 100, { width: 100, height: 40 });
    const points = edgePoints({ routing: "curved" }, a, b);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ x: 50, y: 0 });
    expect(points[3]).toEqual({ x: 250, y: 100 });
    expect(edgePath("curved", points)).toMatch(/^M50 0C/);
    expect(edgeMidpoint("curved", points)).toEqual({ x: 150, y: 50 });
  });
});
