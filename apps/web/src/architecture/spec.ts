import { z } from "zod";
import type { DiagramEdge, DiagramNode } from "@linework/shared";
import { createDiagram, createEdge } from "../diagram/factory";
import type { KindImportResult } from "../kinds/model";
import {
  C4_TYPES,
  createBoundaryNode,
  createElementNode,
  relationshipDefaults,
  tidyArchitecture,
  type C4Type,
} from "./model";

const text = (max: number): z.ZodString => z.string().max(max);

/** Simple spec for architecture (C4) diagrams. Documented at /llms; keep in sync. */
export const architectureSpecSchema = z.object({
  type: z.literal("architecture"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  direction: z.enum(["TB", "LR"]).optional(),
  elements: z
    .array(
      z.object({
        id: text(64).min(1),
        name: text(200).optional(),
        type: z.enum(C4_TYPES).optional(),
        technology: text(200).optional(),
        description: text(1_000).optional(),
        external: z.boolean().optional(),
        /** Name of the boundary (usually a software system) the element sits inside. */
        boundary: text(200).optional(),
      }),
    )
    .min(1)
    .max(500),
  relationships: z
    .array(
      z.object({
        from: text(64),
        to: text(64),
        label: text(500).optional(),
        technology: text(200).optional(),
      }),
    )
    .max(2_000)
    .optional(),
});
export type ArchitectureSpec = z.infer<typeof architectureSpecSchema>;

export function buildArchitecture(spec: ArchitectureSpec): KindImportResult {
  const ids = new Map<string, string>();
  const nodes: DiagramNode[] = [];
  const boundaries = new Map<string, DiagramNode>();
  const members = new Map<string, Set<string>>();
  for (const e of spec.elements) {
    if (ids.has(e.id)) return { ok: false, error: `Duplicate element id "${e.id}"` };
    const type: C4Type = e.type ?? "container";
    const node = createElementNode(type, e.name ?? e.id, 0, 0, {
      external: e.external ?? false,
      technology: e.technology ?? "",
      description: e.description ?? "",
    });
    ids.set(e.id, node.id);
    nodes.push(node);
    const boundaryName = e.boundary?.trim();
    if (boundaryName) {
      const boundary = boundaries.get(boundaryName) ?? createBoundaryNode(boundaryName, 0, 0);
      boundaries.set(boundaryName, boundary);
      const set = members.get(boundary.id) ?? new Set<string>();
      set.add(node.id);
      members.set(boundary.id, set);
    }
  }
  const edges: DiagramEdge[] = [];
  for (const r of spec.relationships ?? []) {
    const source = ids.get(r.from);
    const target = ids.get(r.to);
    if (!source || !target)
      return { ok: false, error: `Relationship ${r.from} -> ${r.to} refers to an unknown element id` };
    const tech = r.technology?.trim();
    edges.push(
      createEdge(source, target, {
        ...relationshipDefaults(),
        label: r.label ?? "Uses",
        ...(tech ? { meta: { detail: tech } } : {}),
      }),
    );
  }
  const base = createDiagram(
    spec.title ?? "Untitled architecture",
    spec.style ?? "professional",
    "architecture",
  );
  const diagram = { ...base, nodes: [...boundaries.values(), ...nodes], edges };
  return { ok: true, diagram: tidyArchitecture(diagram, spec.direction ?? "TB", members) };
}
