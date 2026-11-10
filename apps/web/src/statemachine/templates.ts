import type { Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { StyleId } from "../diagram/styles";
import { buildStates } from "./spec";

/** Example state machine: an online order from payment to delivery. */
export function stateTemplate(styleId: StyleId, title: string, blank: boolean): Diagram {
  if (blank) return createDiagram("Untitled state machine", styleId, "state");
  const result = buildStates({
    type: "state",
    title,
    style: styleId === "sketch" ? "sketch" : "professional",
    states: [
      { name: "Awaiting payment", entry: "send invoice" },
      { name: "payment", kind: "choice" },
      { name: "Payment failed", entry: "email customer" },
      { name: "Paid", entry: "reserve stock" },
      { name: "Shipped" },
      { name: "Cancelled", entry: "release stock" },
    ],
    transitions: [
      { from: "[*]", to: "Awaiting payment" },
      { from: "Awaiting payment", to: "payment", event: "pay" },
      { from: "payment", to: "Paid", guard: "card accepted" },
      { from: "payment", to: "Payment failed", guard: "card declined" },
      { from: "Payment failed", to: "Awaiting payment", event: "retry" },
      { from: "Payment failed", to: "Cancelled", event: "timeout", guard: "after 3 days" },
      { from: "Paid", to: "Shipped", event: "dispatch", action: "send tracking link" },
      { from: "Shipped", to: "[*]", event: "delivered" },
      { from: "Cancelled", to: "[*]" },
    ],
  });
  if (!result.ok) throw new Error(result.error);
  return result.diagram;
}
