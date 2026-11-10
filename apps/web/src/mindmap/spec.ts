import { z } from "zod";
import type { KindImportResult } from "../kinds/model";
import { BRANCH_COLORS, buildMindmap, type OutlineTopic } from "./model";

const text = (max: number): z.ZodString => z.string().max(max);

export const MINDMAP_COLORS = ["blue", "teal", "amber", "pink", "purple", "cyan", "green", "red"] as const;

interface TopicInput {
  text: string;
  color?: (typeof MINDMAP_COLORS)[number] | undefined;
  children?: TopicInput[] | undefined;
}

const topicSchema: z.ZodType<TopicInput> = z.lazy(() =>
  z.object({
    text: text(500),
    color: z.enum(MINDMAP_COLORS).optional(),
    children: z.array(topicSchema).max(100).optional(),
  }),
);

/** Simple spec for mind maps. Documented at /llms; keep in sync. */
export const mindmapSpecSchema = z.object({
  type: z.literal("mindmap"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  layout: z.enum(["balanced", "right"]).optional(),
  root: text(500),
  branches: z.array(topicSchema).max(100).optional(),
});
export type MindmapSpec = z.infer<typeof mindmapSpecSchema>;

function toOutline(topic: TopicInput): OutlineTopic {
  const index = topic.color ? MINDMAP_COLORS.indexOf(topic.color) : -1;
  return {
    text: topic.text,
    ...(index >= 0 ? { color: BRANCH_COLORS[index] } : {}),
    children: (topic.children ?? []).map(toOutline),
  };
}

export function buildMindmapSpec(spec: MindmapSpec): KindImportResult {
  let count = 0;
  const countTopics = (t: TopicInput): void => {
    count++;
    (t.children ?? []).forEach(countTopics);
  };
  (spec.branches ?? []).forEach(countTopics);
  if (count > 2_000) return { ok: false, error: "A mind map can hold 2,000 topics" };
  return {
    ok: true,
    diagram: buildMindmap(
      spec.title ?? spec.root,
      spec.root,
      (spec.branches ?? []).map(toOutline),
      spec.layout ?? "balanced",
      spec.style ?? "professional",
    ),
  };
}
