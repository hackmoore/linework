import { beforeEach, describe, expect, it } from "vitest";
import { parseDiagram, type Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToMermaid } from "../mermaid/mermaid";
import { parseTable } from "../render/compartments";
import { importText } from "../share/importText";
import { buildTemplate } from "../templates/build";
import { addChildTable, addForeignKey } from "./ErPanel";
import { createTableNode, erIssues, tablesOf } from "./model";
import { schemaToSql } from "./sql";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

const SQL = `
-- Shop schema
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);
/* orders belong to customers */
CREATE TABLE "orders" (
  "id" bigserial,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  total numeric(10, 2) CHECK (total >= 0),
  CONSTRAINT orders_pk PRIMARY KEY (id)
);
CREATE TABLE \`order_items\` (
  \`order_id\` bigint NOT NULL,
  \`sku\` varchar(40) NOT NULL,
  PRIMARY KEY (\`order_id\`, \`sku\`),
  KEY idx_sku (\`sku\`)
) ENGINE=InnoDB;
ALTER TABLE order_items ADD CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders (id);
`;

describe("entity-relationship diagrams", () => {
  it("imports SQL with keys, types and relationships", () => {
    const result = importText(SQL, "shop.sql");
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.chartType).toBe("er");
    const tables = tablesOf(d).map((t) => t.table);
    expect(tables.map((t) => t.name)).toEqual(["customers", "orders", "order_items"]);
    expect(tables[0]?.columns).toEqual([
      { name: "id", type: "uuid", flags: ["PK"] },
      { name: "email", type: "varchar(255)", flags: ["NN", "UQ"] },
      { name: "created_at", type: "timestamp with time zone", flags: [] },
    ]);
    expect(tables[1]?.columns.map((c) => [c.name, c.type, c.flags])).toEqual([
      ["id", "bigserial", ["PK"]],
      ["customer_id", "uuid", ["NN", "FK"]],
      ["total", "numeric(10,2)", []],
    ]);
    expect(tables[2]?.columns.filter((c) => c.flags.includes("PK"))).toHaveLength(2);
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0]).toMatchObject({ arrowStart: "one", arrowEnd: "zero-or-many" });
    expect(erIssues(d)).toEqual([]);
  });

  it("exports SQL that imports back to the same tables", () => {
    const original = buildTemplate("er");
    const sql = schemaToSql(original);
    expect(sql).toContain("CREATE TABLE customers (\n  id uuid PRIMARY KEY,\n  email text NOT NULL UNIQUE,");
    expect(sql).toContain("PRIMARY KEY (order_id, product_id)");
    expect(sql).toContain("ALTER TABLE orders ADD FOREIGN KEY (customer_id) REFERENCES customers (id);");
    expect(sql).toContain("ALTER TABLE products ADD FOREIGN KEY (category_id) REFERENCES categories (id);");
    const back = importText(sql, "shop.sql");
    if (!back.ok) throw new Error(back.error);
    const names = (d: Diagram): string[] => tablesOf(d).map((t) => t.table.name);
    expect(names(back.diagram)).toEqual(names(original));
    expect(back.diagram.edges).toHaveLength(original.edges.length);
  });

  it("exports Mermaid ER syntax", () => {
    const mermaid = diagramToMermaid(buildTemplate("er"));
    expect(mermaid).toMatch(/^erDiagram\n {2}customers \{\n {4}uuid id PK\n {4}text email UK\n/);
    expect(mermaid).toContain('customers ||--o{ orders : "places"');
    expect(mermaid).toContain('orders ||--|{ order_items : "contains"');
    expect(mermaid).toContain("numeric(10_2) unit_price");
  });

  it("checks for missing keys and duplicate names", () => {
    const d = createDiagram("S", "professional", "er");
    const a = createTableNode({ name: "things", columns: [{ name: "x", type: "int", flags: ["FK"] }] }, 0, 0);
    const b = createTableNode({ name: "Things", columns: [] }, 0, 0);
    const messages = erIssues({ ...d, nodes: [a, b] }).map((i) => i.message);
    expect(messages).toEqual([
      "things has no primary key",
      "things has a foreign key but no relationship",
      "Two tables are called Things",
      "Things has no columns",
    ]);
  });
});

describe("editing entity-relationship diagrams", () => {
  beforeEach(() => {
    const d = createDiagram("S", "professional", "er");
    const customers = createTableNode(
      { name: "customers", columns: [{ name: "id", type: "uuid", flags: ["PK"] }] },
      0,
      0,
    );
    useEditor.getState().load({ ...d, nodes: [customers] });
  });

  it("adds a related table with a foreign key on Tab", () => {
    const parent = useEditor.getState().diagram?.nodes[0]?.id ?? "";
    expect(addChildTable(parent)).toBe(true);
    const d = useEditor.getState().diagram;
    if (!d) throw new Error("no diagram");
    valid(d);
    const child = d.nodes.find((n) => n.id === useEditor.getState().selection.nodeIds[0]);
    expect(parseTable(child?.label ?? "").columns.map((c) => c.name)).toEqual(["id", "customer_id"]);
    expect(d.edges[0]).toMatchObject({ source: parent, arrowStart: "one", arrowEnd: "zero-or-many" });
  });

  it("adds the foreign key for a drawn relationship once", () => {
    const state = useEditor.getState();
    const parent = state.diagram?.nodes[0]?.id ?? "";
    state.addNode("table", 400, 0, { label: "invoices\nid uuid PK" });
    const child = useEditor.getState().selection.nodeIds[0] ?? "";
    const edgeId = useEditor.getState().connect(parent, child);
    const edge = useEditor.getState().diagram?.edges.find((e) => e.id === edgeId);
    if (!edge) throw new Error("no edge");
    expect(edge).toMatchObject({ routing: "elbow", arrowStart: "one", arrowEnd: "zero-or-many" });
    addForeignKey(edge);
    addForeignKey(edge);
    const label = useEditor.getState().diagram?.nodes.find((n) => n.id === child)?.label;
    expect(label).toBe("invoices\nid uuid PK\ncustomer_id uuid FK NN");
  });
});
