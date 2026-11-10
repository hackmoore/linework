import { z } from "zod";
import type { DiagramEdge } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { KindImportResult } from "../kinds/model";
import { createClassNode, relationship, RELATIONS, tidyClasses } from "./model";

const text = (max: number): z.ZodString => z.string().max(max);

/** Simple spec for UML class diagrams. Documented at /llms; keep in sync. */
export const classSpecSchema = z.object({
  type: z.literal("class"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  direction: z.enum(["TB", "LR"]).optional(),
  classes: z
    .array(
      z.object({
        name: text(100).min(1),
        stereotype: z.enum(["interface", "abstract", "enumeration"]).optional(),
        attributes: z.array(text(200)).max(100).optional(),
        operations: z.array(text(200)).max(100).optional(),
      }),
    )
    .min(1)
    .max(500),
  relationships: z
    .array(
      z.object({
        from: text(100),
        to: text(100),
        type: z.enum(RELATIONS).optional(),
        fromMultiplicity: text(20).optional(),
        toMultiplicity: text(20).optional(),
        label: text(200).optional(),
      }),
    )
    .max(2_000)
    .optional(),
});
export type ClassSpec = z.infer<typeof classSpecSchema>;

export function buildClasses(spec: ClassSpec): KindImportResult {
  const ids = new Map<string, string>();
  const nodes = spec.classes.map((c) => {
    const node = createClassNode({
      name: c.name,
      stereotype: c.stereotype ?? "",
      attributes: c.attributes ?? [],
      operations: c.operations ?? [],
    });
    ids.set(c.name, node.id);
    return node;
  });
  if (ids.size !== nodes.length) return { ok: false, error: "Two classes have the same name" };
  const edges: DiagramEdge[] = [];
  for (const r of spec.relationships ?? []) {
    const source = ids.get(r.from);
    const target = ids.get(r.to);
    if (!source || !target)
      return { ok: false, error: `Relationship ${r.from} -> ${r.to} refers to an unknown class` };
    edges.push(
      relationship(source, target, r.type ?? "association", {
        label: r.label ?? "",
        ...(r.fromMultiplicity ? { startLabel: r.fromMultiplicity } : {}),
        ...(r.toMultiplicity ? { endLabel: r.toMultiplicity } : {}),
      }),
    );
  }
  const base = createDiagram(spec.title ?? "Untitled class diagram", spec.style ?? "professional", "class");
  return { ok: true, diagram: tidyClasses({ ...base, nodes, edges }, spec.direction ?? "TB") };
}
