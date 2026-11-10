import { z } from "zod";
import type { KindAi } from "../ai/kinds";
import { CARDINALITIES } from "./model";

const output = z.object({
  title: z.string().describe("Short chart title"),
  tables: z.array(
    z.object({
      name: z.string().describe("Table name in snake_case, usually plural, such as order_items"),
      columns: z.array(
        z.object({
          name: z.string().describe("Column name in snake_case"),
          type: z.string().describe("SQL type, such as uuid, text, integer, numeric(10,2), timestamptz"),
          primaryKey: z.boolean(),
          foreignKey: z.boolean(),
          unique: z.boolean(),
          required: z.boolean().describe("NOT NULL"),
        }),
      ),
    }),
  ),
  relationships: z.array(
    z.object({
      from: z.string().describe("Parent table name, the one being referenced"),
      to: z.string().describe("Child table name, the one with the foreign key"),
      fromCardinality: z.enum(CARDINALITIES).describe("How many parent rows each child row has, usually one"),
      toCardinality: z
        .enum(CARDINALITIES)
        .describe("How many child rows each parent row has, usually zero-or-many"),
      label: z.string().describe("Verb from parent to child, such as places or contains"),
    }),
  ),
});

export const erAi: KindAi = {
  label: "Entity-relationship",
  example:
    "Database for a library: members borrow copies of books, books have one or more authors, and members can reserve books that are all on loan. Track due dates and fines.",
  output,
  prompt: [
    "Produce an entity-relationship diagram of a relational database schema. Layout is automatic.",
    "Give every table a primary key, usually id. Add a foreign key column (such as customer_id) to the child side of every one-to-many relationship, and use a join table for many-to-many relationships.",
    "Draw each relationship from the parent table (the one referenced) to the child table (the one holding the foreign key), with realistic cardinalities.",
    "Use snake_case names and common PostgreSQL types. Keep to the tables the user's description needs.",
  ],
  toSpec: (raw) => {
    const o = raw as z.infer<typeof output>;
    const word = (s: string): string => s.trim().replace(/\s+/g, "_").slice(0, 100) || "x";
    return {
      type: "er",
      title: o.title,
      tables: o.tables.map((t) => ({
        name: word(t.name),
        columns: t.columns.map((c) =>
          [
            word(c.name),
            c.type.trim().replace(/\s+/g, " ") || "text",
            ...(c.primaryKey ? ["PK"] : []),
            ...(c.foreignKey ? ["FK"] : []),
            ...(c.unique && !c.primaryKey ? ["UQ"] : []),
            ...(c.required && !c.primaryKey ? ["NN"] : []),
          ].join(" "),
        ),
      })),
      relationships: o.relationships.map((r) => ({
        from: word(r.from),
        to: word(r.to),
        fromCardinality: r.fromCardinality,
        toCardinality: r.toCardinality,
        label: r.label.slice(0, 200),
      })),
    };
  },
};
