import { z } from "zod";
import type { DiagramEdge } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { KindImportResult } from "../kinds/model";
import { parseColumn, type TableColumn } from "../render/compartments";
import { CARDINALITIES, createRelationship, createTableNode, tidyEr } from "./model";

const text = (max: number): z.ZodString => z.string().max(max);

/** Simple spec for entity-relationship diagrams. Documented at /llms; keep in sync. */
export const erSpecSchema = z.object({
  type: z.literal("er"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  direction: z.enum(["TB", "LR"]).optional(),
  tables: z
    .array(
      z.object({
        name: text(100).min(1),
        /** Columns written as "name type FLAGS", with flags PK, FK, UQ (unique) and NN (not null). */
        columns: z.array(text(200).min(1)).max(200).optional(),
      }),
    )
    .min(1)
    .max(500),
  relationships: z
    .array(
      z.object({
        /** The parent table, whose rows are referenced. */
        from: text(100),
        /** The child table, holding the foreign key. */
        to: text(100),
        fromCardinality: z.enum(CARDINALITIES).optional(),
        toCardinality: z.enum(CARDINALITIES).optional(),
        label: text(200).optional(),
      }),
    )
    .max(2_000)
    .optional(),
});
export type ErSpec = z.infer<typeof erSpecSchema>;

export function buildEr(spec: ErSpec): KindImportResult {
  const ids = new Map<string, string>();
  const nodes = spec.tables.map((t, i) => {
    const columns = (t.columns ?? []).map(parseColumn).filter((c): c is TableColumn => c !== null);
    const node = createTableNode({ name: t.name, columns }, 0, 0, i);
    ids.set(t.name.toLowerCase(), node.id);
    return node;
  });
  if (ids.size !== nodes.length) return { ok: false, error: "Two tables have the same name" };
  const edges: DiagramEdge[] = [];
  for (const r of spec.relationships ?? []) {
    const source = ids.get(r.from.toLowerCase());
    const target = ids.get(r.to.toLowerCase());
    if (!source || !target)
      return { ok: false, error: `Relationship ${r.from} -> ${r.to} refers to an unknown table` };
    edges.push(
      createRelationship(
        source,
        target,
        r.fromCardinality ?? "one",
        r.toCardinality ?? "zero-or-many",
        r.label ?? "",
      ),
    );
  }
  const base = createDiagram(spec.title ?? "Untitled schema", spec.style ?? "professional", "er");
  return { ok: true, diagram: tidyEr({ ...base, nodes, edges }, spec.direction ?? "LR") };
}
