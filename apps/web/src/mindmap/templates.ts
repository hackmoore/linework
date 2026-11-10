import type { Diagram } from "@linework/shared";
import type { StyleId } from "../diagram/styles";
import { buildMindmap } from "./model";

const t = (text: string, ...children: string[]): { text: string; children: { text: string }[] } => ({
  text,
  children: children.map((c) => ({ text: c })),
});

/** Example mind map: planning a product launch. */
export function mindmapTemplate(styleId: StyleId, title: string, blank: boolean): Diagram {
  const style = styleId === "sketch" ? "sketch" : "professional";
  if (blank) return buildMindmap("Untitled mind map", "Central topic", [], "balanced", style);
  return buildMindmap(
    title,
    "Product launch",
    [
      t("Audience", "Early adopters", "Small teams", "Agencies"),
      t("Message", "One-line pitch", "Key benefits", "Proof points"),
      t("Channels", "Blog post", "Newsletter", "Social", "Product Hunt"),
      t("Timeline", "Beta in May", "Launch in June", "Review in July"),
      t("Success", "1,000 sign-ups", "50 paying teams"),
      t("Risks", "Server load", "Missed deadline"),
    ],
    "balanced",
    style,
  );
}
