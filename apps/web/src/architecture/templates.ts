import type { Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { StyleId } from "../diagram/styles";
import { buildArchitecture } from "./spec";

/** Example container diagram: an online shop, its users and the services it relies on. */
export function architectureTemplate(styleId: StyleId, title: string, blank: boolean): Diagram {
  if (blank) return createDiagram("Untitled architecture", styleId, "architecture");
  const result = buildArchitecture({
    type: "architecture",
    title,
    style: styleId === "sketch" ? "sketch" : "professional",
    elements: [
      { id: "customer", name: "Customer", type: "person", description: "Browses products and places orders" },
      {
        id: "web",
        name: "Web shop",
        type: "container",
        technology: "React",
        description: "Lets customers browse and buy in the browser",
        boundary: "Online shop",
      },
      {
        id: "mobile",
        name: "Mobile app",
        type: "container",
        technology: "React Native",
        description: "Shopping on iOS and Android",
        boundary: "Online shop",
      },
      {
        id: "api",
        name: "Shop API",
        type: "container",
        technology: "Node.js",
        description: "Handles accounts, baskets and orders",
        boundary: "Online shop",
      },
      {
        id: "worker",
        name: "Order worker",
        type: "container",
        technology: "Go",
        description: "Confirms orders and updates stock",
        boundary: "Online shop",
      },
      {
        id: "db",
        name: "Shop database",
        type: "database",
        technology: "PostgreSQL",
        description: "Products, customers and orders",
        boundary: "Online shop",
      },
      {
        id: "payments",
        name: "Payment provider",
        type: "system",
        external: true,
        description: "Takes card payments",
      },
      { id: "email", name: "Email service", type: "system", external: true, description: "Sends emails" },
    ],
    relationships: [
      { from: "customer", to: "web", label: "Shops using", technology: "HTTPS" },
      { from: "customer", to: "mobile", label: "Shops using" },
      { from: "web", to: "api", label: "Calls", technology: "JSON/HTTPS" },
      { from: "mobile", to: "api", label: "Calls", technology: "JSON/HTTPS" },
      { from: "api", to: "db", label: "Reads and writes", technology: "SQL" },
      { from: "api", to: "worker", label: "Queues orders for", technology: "AMQP" },
      { from: "worker", to: "payments", label: "Charges cards using", technology: "HTTPS" },
      { from: "worker", to: "email", label: "Sends confirmations using", technology: "SMTP" },
    ],
  });
  if (!result.ok) throw new Error(result.error);
  return result.diagram;
}
