import { z } from "zod";
import type { KindAi } from "../ai/kinds";

const output = z.object({
  title: z.string().describe("Short chart title"),
  people: z.array(
    z.object({
      id: z.string().describe("Short unique id, letters and digits"),
      name: z.string().describe("The person's name, or the role if no name is given"),
      title: z.string().describe("Job title"),
      department: z.string().nullable().describe("Team or department, used to colour the chart"),
      manager: z
        .string()
        .nullable()
        .describe("Id of the person they report to; null for the top of the chart"),
      vacant: z.boolean().describe("True for an open position that hasn't been filled"),
    }),
  ),
});

export const orgAi: KindAi = {
  label: "Org chart",
  example:
    "A 20-person startup: the CEO, with a CTO running two engineering teams (platform and product), a Head of Design with two designers, and a COO with sales and support. We're hiring a second support agent.",
  output,
  prompt: [
    "Produce an org chart: who reports to whom. Layout is automatic.",
    "Use the names and titles the user gives. Where they only give roles, use the role as the name.",
    "Give everyone exactly one manager except the person at the top. Group people into departments the user mentions.",
    "Mark positions the user says are open or being hired as vacant.",
  ],
  toSpec: (raw) => {
    const o = raw as z.infer<typeof output>;
    const ids = new Set(o.people.map((p) => p.id));
    return {
      type: "org",
      title: o.title,
      people: o.people.map((p) => ({
        id: p.id.slice(0, 64),
        name: p.name.slice(0, 200),
        title: p.title.slice(0, 200),
        vacant: p.vacant,
        ...(p.department ? { department: p.department.slice(0, 100) } : {}),
        ...(p.manager && ids.has(p.manager) && p.manager !== p.id ? { manager: p.manager } : {}),
      })),
    };
  },
};
