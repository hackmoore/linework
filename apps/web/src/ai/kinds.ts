import type { z } from "zod";
import type { ChartType } from "@linework/shared";
import { architectureAi } from "../architecture/ai";
import { classAi } from "../classes/ai";
import { erAi } from "../er/ai";
import { mindmapAi } from "../mindmap/ai";
import { orgAi } from "../org/ai";

/**
 * How "Generate with AI" handles a node-and-edge chart type: the structured output Claude
 * returns, extra system prompt lines, and the conversion to the simple spec.
 */
export interface KindAi {
  readonly label: string;
  readonly example: string;
  readonly output: z.ZodType;
  readonly prompt: readonly string[];
  readonly toSpec: (output: unknown) => unknown;
}

export const KIND_AI: Partial<Record<ChartType, KindAi>> = {
  architecture: architectureAi,
  er: erAi,
  org: orgAi,
  mindmap: mindmapAi,
  class: classAi,
};
