import type { Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { StyleId } from "../diagram/styles";
import { buildEr } from "./spec";

/** Example schema: an online shop's customers, orders and products. */
export function erTemplate(styleId: StyleId, title: string, blank: boolean): Diagram {
  if (blank) return createDiagram("Untitled schema", styleId, "er");
  const result = buildEr({
    type: "er",
    title,
    style: styleId === "sketch" ? "sketch" : "professional",
    tables: [
      {
        name: "customers",
        columns: ["id uuid PK", "email text UQ NN", "name text NN", "created_at timestamptz NN"],
      },
      {
        name: "addresses",
        columns: [
          "id uuid PK",
          "customer_id uuid FK NN",
          "line1 text NN",
          "city text NN",
          "postcode text NN",
        ],
      },
      {
        name: "orders",
        columns: [
          "id uuid PK",
          "customer_id uuid FK NN",
          "delivery_address text NN",
          "status text NN",
          "placed_at timestamptz NN",
        ],
      },
      {
        name: "order_items",
        columns: [
          "order_id uuid PK FK",
          "product_id uuid PK FK",
          "quantity integer NN",
          "unit_price numeric(10,2) NN",
        ],
      },
      {
        name: "products",
        columns: [
          "id uuid PK",
          "category_id uuid FK",
          "name text NN",
          "price numeric(10,2) NN",
          "stock integer NN",
        ],
      },
      { name: "categories", columns: ["id uuid PK", "name text UQ NN"] },
    ],
    relationships: [
      { from: "customers", to: "addresses", label: "has" },
      { from: "customers", to: "orders", label: "places" },
      { from: "orders", to: "order_items", toCardinality: "one-or-many", label: "contains" },
      { from: "products", to: "order_items", label: "appears in" },
      { from: "categories", to: "products", fromCardinality: "zero-or-one", label: "groups" },
    ],
  });
  if (!result.ok) throw new Error(result.error);
  return result.diagram;
}
