import { z } from "zod";
import type { KindImportResult } from "../kinds/model";
import { buildOrg } from "./model";

const text = (max: number): z.ZodString => z.string().max(max);

/** Simple spec for org charts. Documented at /llms; keep in sync. */
export const orgSpecSchema = z.object({
  type: z.literal("org"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  direction: z.enum(["TB", "LR"]).optional(),
  people: z
    .array(
      z.object({
        /** Defaults to the name; managers can be given by id or name. */
        id: text(64).optional(),
        name: text(200),
        title: text(200).optional(),
        department: text(100).optional(),
        email: text(200).optional(),
        manager: text(200).optional(),
        vacant: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(5_000),
});
export type OrgSpec = z.infer<typeof orgSpecSchema>;

export function buildOrgSpec(spec: OrgSpec): KindImportResult {
  const keys = spec.people.map((p) => (p.id ?? p.name).toLowerCase());
  if (new Set(keys).size !== keys.length)
    return { ok: false, error: "Two people have the same id or name; give them ids" };
  const known = new Set([...keys, ...spec.people.map((p) => p.name.toLowerCase())]);
  const missing = spec.people.find((p) => p.manager && !known.has(p.manager.toLowerCase()));
  if (missing)
    return { ok: false, error: `${missing.name}'s manager "${missing.manager ?? ""}" isn't in the list` };
  const diagram = buildOrg(
    spec.title ?? "Untitled org chart",
    spec.people.map((p) => ({
      key: p.id ?? p.name,
      name: p.name,
      manager: p.manager ?? "",
      title: p.title ?? "",
      department: p.department ?? "",
      email: p.email ?? "",
      vacant: p.vacant ?? false,
    })),
    spec.direction ?? "TB",
    spec.style ?? "professional",
  );
  return { ok: true, diagram };
}
