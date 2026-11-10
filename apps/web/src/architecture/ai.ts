import { z } from "zod";
import type { KindAi } from "../ai/kinds";
import { C4_TYPES } from "./model";

const output = z.object({
  title: z.string().describe("Short chart title"),
  direction: z.enum(["TB", "LR"]).describe("TB unless the system is a left-to-right pipeline"),
  elements: z.array(
    z.object({
      id: z.string().describe("Short unique id, letters and digits"),
      name: z.string().describe("Name, such as Web app or Payments service"),
      type: z.enum(C4_TYPES),
      technology: z
        .string()
        .nullable()
        .describe("For containers, databases and components, such as React or PostgreSQL"),
      description: z.string().describe("What it does, in under 12 words"),
      external: z.boolean().describe("True for people and systems outside the system being described"),
      boundary: z
        .string()
        .nullable()
        .describe("Name of the software system a container or component belongs to; null at the top level"),
    }),
  ),
  relationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().describe("What happens, such as Places orders using or Reads from"),
      technology: z.string().nullable().describe("Such as JSON/HTTPS, gRPC or SQL"),
    }),
  ),
});

export const architectureAi: KindAi = {
  label: "Architecture (C4)",
  example:
    "Container diagram for a food delivery platform: customers and couriers use mobile apps, restaurants use a web dashboard, all through an API. Orders, payments and notifications services, a Postgres database, a Kafka queue, and Stripe for card payments.",
  output,
  prompt: [
    "Produce a C4 architecture diagram. Layout is automatic, so don't think about positions.",
    "Use the level of detail the user asks for: a system context diagram shows people and software systems; a container diagram shows the apps, services and data stores inside one system (put them in a boundary named after the system); a component diagram shows the parts inside one container.",
    "Give every element a short description and every container, database and component its technology. Mark people and systems the user doesn't own as external.",
    "Label every relationship with what happens, from the point of view of the source, and add the protocol as its technology where it helps.",
    "Every relationship must connect existing element ids.",
  ],
  toSpec: (raw) => {
    const o = raw as z.infer<typeof output>;
    return {
      type: "architecture",
      title: o.title,
      direction: o.direction,
      elements: o.elements.map((e) => ({
        id: e.id,
        name: e.name.slice(0, 200),
        type: e.type,
        description: e.description.slice(0, 1_000),
        external: e.external,
        ...(e.technology ? { technology: e.technology.slice(0, 200) } : {}),
        ...(e.boundary ? { boundary: e.boundary.slice(0, 200) } : {}),
      })),
      relationships: o.relationships.map((r) => ({
        from: r.from,
        to: r.to,
        label: r.label.slice(0, 500),
        ...(r.technology ? { technology: r.technology.slice(0, 200) } : {}),
      })),
    };
  },
};
