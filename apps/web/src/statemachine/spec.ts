import { z } from "zod";
import type { DiagramEdge, DiagramNode } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import type { KindImportResult } from "../kinds/model";
import {
  activitiesMeta,
  createStateNode,
  normalizeStates,
  tidyStates,
  transition,
  triggerLabel,
} from "./model";

const text = (max: number): z.ZodString => z.string().max(max);

/** Simple spec for state machines. Documented at /llms; keep in sync. */
export const stateSpecSchema = z.object({
  type: z.literal("state"),
  title: text(200).optional(),
  style: z.enum(["professional", "sketch"]).optional(),
  direction: z.enum(["TB", "LR"]).optional(),
  states: z
    .array(
      z.object({
        name: text(200).min(1),
        kind: z.enum(["state", "choice", "composite"]).optional(),
        /** Name of the composite state this one is inside. */
        parent: text(200).optional(),
        entry: text(200).optional(),
        do: text(200).optional(),
        exit: text(200).optional(),
      }),
    )
    .min(1)
    .max(1_000),
  transitions: z
    .array(
      z.object({
        /** A state name, or "[*]" for the start. */
        from: text(200),
        /** A state name, or "[*]" for the end. */
        to: text(200),
        event: text(200).optional(),
        guard: text(200).optional(),
        action: text(200).optional(),
      }),
    )
    .max(5_000)
    .optional(),
});
export type StateSpec = z.infer<typeof stateSpecSchema>;

export function buildStates(spec: StateSpec): KindImportResult {
  const byName = new Map<string, DiagramNode>();
  const nodes: DiagramNode[] = [];
  for (const s of spec.states) {
    if (byName.has(s.name)) return { ok: false, error: `Two states are called ${s.name}` };
    const kind = s.kind === "choice" ? "diamond" : s.kind === "composite" ? "container" : "rounded";
    const node = createStateNode(kind, kind === "diamond" ? "" : s.name);
    const withActivities =
      kind === "rounded" && (s.entry || s.do || s.exit)
        ? {
            ...node,
            meta: activitiesMeta(node, { entry: s.entry ?? "", do: s.do ?? "", exit: s.exit ?? "" }),
          }
        : node;
    byName.set(s.name, withActivities);
    nodes.push(withActivities);
  }
  const members = new Map<string, Set<string>>();
  for (const s of spec.states) {
    if (!s.parent) continue;
    const parent = byName.get(s.parent);
    const child = byName.get(s.name);
    if (parent?.kind !== "container")
      return { ok: false, error: `${s.name}'s parent ${s.parent} isn't a composite state` };
    if (!child) continue;
    members.set(parent.id, (members.get(parent.id) ?? new Set<string>()).add(child.id));
  }
  let start: DiagramNode | undefined;
  let end: DiagramNode | undefined;
  const edges: DiagramEdge[] = [];
  for (const t of spec.transitions ?? []) {
    let source: DiagramNode | undefined;
    let target: DiagramNode | undefined;
    if (t.from === "[*]") {
      start ??= createStateNode("initial");
      source = start;
    } else source = byName.get(t.from);
    if (t.to === "[*]") {
      end ??= createStateNode("final");
      target = end;
    } else target = byName.get(t.to);
    if (!source || !target)
      return { ok: false, error: `Transition ${t.from} -> ${t.to} refers to an unknown state` };
    edges.push(
      transition(
        source.id,
        target.id,
        triggerLabel({ event: t.event ?? "", guard: t.guard ?? "", action: t.action ?? "" }),
      ),
    );
  }
  const all = [
    ...nodes.filter((n) => n.kind === "container"),
    ...(start ? [start] : []),
    ...nodes.filter((n) => n.kind !== "container"),
    ...(end ? [end] : []),
  ];
  const base = createDiagram(spec.title ?? "Untitled state machine", spec.style ?? "professional", "state");
  return {
    ok: true,
    diagram: normalizeStates(tidyStates({ ...base, nodes: all, edges }, spec.direction ?? "TB", members)),
  };
}
