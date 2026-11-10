import type { Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { StyleId } from "../diagram/styles";
import { buildSequence } from "./spec";

/** Example sequence diagram: paying for an order online. */
export function sequenceTemplate(styleId: StyleId, title: string, blank: boolean): Diagram {
  if (blank) return createDiagram("Untitled sequence diagram", styleId, "sequence");
  const result = buildSequence({
    type: "sequence",
    title,
    style: styleId === "sketch" ? "sketch" : "professional",
    participants: [
      { name: "Customer", kind: "actor" },
      { name: "Web app" },
      { name: "Orders API" },
      { name: "Payments" },
      { name: "Orders DB", kind: "database" },
    ],
    steps: [
      { type: "message", from: "Customer", to: "Web app", text: "Place order" },
      { type: "message", from: "Web app", to: "Orders API", text: "POST /orders", activate: true },
      { type: "message", from: "Orders API", to: "Orders DB", text: "Save order (pending)" },
      { type: "message", from: "Orders API", to: "Payments", text: "Charge card", activate: true },
      {
        type: "fragment",
        kind: "alt",
        label: "card accepted",
        steps: [
          {
            type: "message",
            from: "Payments",
            to: "Orders API",
            text: "Payment ID",
            arrow: "reply",
            deactivate: true,
          },
          { type: "message", from: "Orders API", to: "Orders DB", text: "Mark order paid" },
          {
            type: "message",
            from: "Orders API",
            to: "Web app",
            text: "201 Created",
            arrow: "reply",
            deactivate: true,
          },
          { type: "message", from: "Web app", to: "Customer", text: "Show confirmation", arrow: "reply" },
        ],
        sections: [
          {
            label: "card declined",
            steps: [
              {
                type: "message",
                from: "Payments",
                to: "Orders API",
                text: "Declined",
                arrow: "reply",
                deactivate: true,
              },
              {
                type: "message",
                from: "Orders API",
                to: "Web app",
                text: "402 Payment required",
                arrow: "reply",
                deactivate: true,
              },
              {
                type: "message",
                from: "Web app",
                to: "Customer",
                text: "Ask for another card",
                arrow: "reply",
              },
            ],
          },
        ],
      },
      {
        type: "note",
        participants: ["Orders API", "Payments"],
        text: "Payments retries the charge\nonce if the bank times out",
      },
    ],
  });
  if (!result.ok) throw new Error(result.error);
  return result.diagram;
}
