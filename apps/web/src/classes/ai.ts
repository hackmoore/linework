import { z } from "zod";
import type { KindAi } from "../ai/kinds";
import { RELATIONS } from "./model";

const output = z.object({
  title: z.string().describe("Short chart title"),
  classes: z.array(
    z.object({
      name: z.string().describe("Class name in PascalCase"),
      stereotype: z.enum(["none", "interface", "abstract", "enumeration"]),
      attributes: z
        .array(z.string())
        .describe("Such as '- id: UUID' or '+ total: Money'; enum values for enumerations"),
      operations: z.array(z.string()).describe("Such as '+ place(): void'"),
    }),
  ),
  relationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z
        .enum(RELATIONS)
        .describe(
          "inheritance: from child to parent; realization: from class to interface; composition and aggregation: from whole to part; association and dependency: from user to used",
        ),
      fromMultiplicity: z.string().nullable().describe("Such as 1 or 0..1; null if not useful"),
      toMultiplicity: z.string().nullable().describe("Such as * or 1..*; null if not useful"),
      label: z.string().nullable(),
    }),
  ),
});

export const classAi: KindAi = {
  label: "Class diagram (UML)",
  example:
    "Domain model for a library: books with many copies, members who borrow copies through loans, and reservations. Fines are calculated by a FineCalculator interface with a standard and a student implementation.",
  output,
  prompt: [
    "Produce a UML class diagram. Layout is automatic.",
    "Show the important attributes and operations with visibility (+ public, - private, # protected) and types, such as '- id: UUID' and '+ checkOut(member: Member): Loan'. Keep to the classes the description needs.",
    "Use inheritance and realization for is-a relationships, composition when parts can't exist without the whole, aggregation for has-a, association for other links (with multiplicities), and dependency for uses.",
    "Every relationship must connect existing class names.",
  ],
  toSpec: (raw) => {
    const o = raw as z.infer<typeof output>;
    return {
      type: "class",
      title: o.title,
      classes: o.classes.map((c) => ({
        name: c.name.slice(0, 100),
        ...(c.stereotype === "none" ? {} : { stereotype: c.stereotype }),
        attributes: c.attributes.slice(0, 100).map((a) => a.slice(0, 200)),
        operations: c.operations.slice(0, 100).map((a) => a.slice(0, 200)),
      })),
      relationships: o.relationships.map((r) => ({
        from: r.from,
        to: r.to,
        type: r.type,
        ...(r.fromMultiplicity ? { fromMultiplicity: r.fromMultiplicity.slice(0, 20) } : {}),
        ...(r.toMultiplicity ? { toMultiplicity: r.toMultiplicity.slice(0, 20) } : {}),
        ...(r.label ? { label: r.label.slice(0, 200) } : {}),
      })),
    };
  },
};
