import { z } from "zod";
import { isoDateSchema } from "./gantt.js";

const id = z.string().min(1).max(64);

/** Kinds of thing a network map can hold. Each has its own icon and colour. */
export const ENTITY_TYPES = [
  "person",
  "organisation",
  "phone",
  "email",
  "account",
  "vehicle",
  "location",
  "website",
  "device",
  "document",
  "event",
  "other",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const entityAttributeSchema = z.object({
  key: z.string().min(1).max(60),
  value: z.string().max(500),
});
export type EntityAttribute = z.infer<typeof entityAttributeSchema>;

/**
 * What a shape on a network map stands for. `id` is the id of the node that draws the
 * entity; its name is the node's label.
 */
export const networkEntitySchema = z.object({
  id,
  type: z.enum(ENTITY_TYPES),
  attributes: z.array(entityAttributeSchema).max(40),
  notes: z.string().max(5_000),
});
export type NetworkEntity = z.infer<typeof networkEntitySchema>;

/**
 * Extra facts about a link. `id` is the id of the edge that draws it; its label is the
 * link type ("calls", "owns", "director of") and its line pattern is how sure the link is:
 * solid for confirmed, dashed for unconfirmed, dotted for tentative.
 */
export const networkLinkSchema = z.object({
  id,
  /** When the link started, or when it was seen. */
  date: isoDateSchema.nullable(),
  /** When it ended, for links that lasted a while. */
  endDate: isoDateSchema.nullable(),
});
export type NetworkLink = z.infer<typeof networkLinkSchema>;

export const networkDataSchema = z.object({
  entities: z.array(networkEntitySchema).max(5_000),
  links: z.array(networkLinkSchema).max(10_000),
});
export type NetworkData = z.infer<typeof networkDataSchema>;

/** Structural problems zod can't see. Each entry is [path, message]. */
export function validateNetwork(data: NetworkData): [(string | number)[], string][] {
  const issues: [(string | number)[], string][] = [];
  const check = (items: readonly { id: string }[], name: "entities" | "links"): void => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id))
        issues.push([[name, index, "id"], `Duplicate ${name === "entities" ? "entity" : "link"} id`]);
      seen.add(item.id);
    });
  };
  check(data.entities, "entities");
  check(data.links, "links");
  data.links.forEach((link, index) => {
    if (link.date && link.endDate && link.endDate < link.date)
      issues.push([["links", index, "endDate"], "Link ends before it starts"]);
  });
  return issues;
}
