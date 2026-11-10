import type { Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { StyleId } from "../diagram/styles";
import { buildClasses } from "./spec";

/** Example domain model: orders, products and payment methods. */
export function classTemplate(styleId: StyleId, title: string, blank: boolean): Diagram {
  if (blank) return createDiagram("Untitled class diagram", styleId, "class");
  const result = buildClasses({
    type: "class",
    title,
    style: styleId === "sketch" ? "sketch" : "professional",
    classes: [
      {
        name: "Customer",
        attributes: ["- id: UUID", "- email: string"],
        operations: ["+ placeOrder(): Order"],
      },
      {
        name: "Order",
        attributes: ["- id: UUID", "- status: OrderStatus", "- placedAt: Date"],
        operations: ["+ total(): Money", "+ pay(method: PaymentMethod): void"],
      },
      {
        name: "OrderLine",
        attributes: ["- quantity: int", "- unitPrice: Money"],
        operations: ["+ subtotal(): Money"],
      },
      { name: "Product", attributes: ["- sku: string", "- name: string", "- price: Money"] },
      {
        name: "OrderStatus",
        stereotype: "enumeration",
        attributes: ["PENDING", "PAID", "SHIPPED", "CANCELLED"],
      },
      { name: "PaymentMethod", stereotype: "interface", operations: ["+ charge(amount: Money): Receipt"] },
      {
        name: "CardPayment",
        attributes: ["- token: string"],
        operations: ["+ charge(amount: Money): Receipt"],
      },
      {
        name: "PayPalPayment",
        attributes: ["- account: string"],
        operations: ["+ charge(amount: Money): Receipt"],
      },
    ],
    relationships: [
      {
        from: "Customer",
        to: "Order",
        type: "association",
        fromMultiplicity: "1",
        toMultiplicity: "*",
        label: "places",
      },
      { from: "Order", to: "OrderLine", type: "composition", fromMultiplicity: "1", toMultiplicity: "1..*" },
      { from: "OrderLine", to: "Product", type: "association", toMultiplicity: "1" },
      { from: "Order", to: "OrderStatus", type: "dependency" },
      { from: "Order", to: "PaymentMethod", type: "dependency" },
      { from: "CardPayment", to: "PaymentMethod", type: "realization" },
      { from: "PayPalPayment", to: "PaymentMethod", type: "realization" },
    ],
  });
  if (!result.ok) throw new Error(result.error);
  return result.diagram;
}
