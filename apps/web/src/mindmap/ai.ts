import { z } from "zod";
import type { KindAi } from "../ai/kinds";

const output = z.object({
  title: z.string().describe("Short chart title"),
  root: z.string().describe("The central topic, in a few words"),
  topics: z.array(
    z.object({
      id: z.string().describe("Short unique id, letters and digits"),
      text: z.string().describe("A few words; under 40 characters"),
      parent: z
        .string()
        .nullable()
        .describe("Id of the parent topic; null for a main branch off the central topic"),
    }),
  ),
});

interface Topic { text: string; children: Topic[] }

export const mindmapAi: KindAi = {
  label: "Mind map",
  example:
    "Brainstorm a launch plan for a new podcast: audience, format and episodes, equipment, promotion, and money. Go two or three levels deep.",
  output,
  prompt: [
    "Produce a mind map: one central topic, 3-8 main branches and subtopics under them. Layout is automatic.",
    "Keep every topic to a few words. Go two or three levels deep, deeper only where the user asks for detail.",
    "Give each topic exactly one parent; main branches have no parent.",
  ],
  toSpec: (raw) => {
    const o = raw as z.infer<typeof output>;
    const nodes = new Map<string, Topic>(
      o.topics.map((t) => [t.id, { text: t.text.slice(0, 500), children: [] }]),
    );
    const branches: Topic[] = [];
    for (const t of o.topics) {
      const node = nodes.get(t.id);
      if (!node) continue;
      const parent = t.parent && t.parent !== t.id ? nodes.get(t.parent) : undefined;
      if (parent) parent.children.push(node);
      else branches.push(node);
    }
    // Drop children whose parent chain loops, by only keeping what's reachable from the branches.
    const seen = new Set<Topic>();
    const prune = (t: Topic): Topic | null => {
      if (seen.has(t)) return null;
      seen.add(t);
      return { text: t.text, children: t.children.flatMap((c) => prune(c) ?? []) };
    };
    return {
      type: "mindmap",
      title: o.title,
      root: o.root.slice(0, 500),
      branches: branches.flatMap((b) => prune(b) ?? []).slice(0, 100),
    };
  },
};
