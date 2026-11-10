import { parseDiagram, type Diagram } from "@linework/shared";
import { createDiagram } from "../diagram/factory";
import { importGanttFile } from "../gantt/io";
import { importCards, isKanbanCsv } from "../kanban/io";
import { createKanbanData } from "../kanban/model";
import { parseMermaid } from "../mermaid/mermaid";
import { importLinksCsv, isNetworkCsv } from "../network/io";
import { importRoadmapCsv, isRoadmapCsv } from "../roadmap/io";
import { createRoadmapData } from "../roadmap/model";
import { parseSimpleSpec } from "./simpleSpec";

export type TextImportResult = { ok: true; diagram: Diagram } | { ok: false; error: string };

/**
 * Turns pasted or uploaded text into a diagram: a Linework file, simple JSON spec, Mermaid,
 * or (by file name) a CSV / MS Project XML task list, a CSV of kanban cards or a CSV of
 * links between entities.
 */
export function importText(text: string, fileName = ""): TextImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Nothing to import" };
  if (/\.csv$/i.test(fileName) && isNetworkCsv(text)) {
    const result = importLinksCsv(text, fileName.replace(/\.[^.]+$/, "") || "Imported network");
    return result.ok ? { ok: true, diagram: result.diagram } : result;
  }
  if (/\.csv$/i.test(fileName) && isRoadmapCsv(text)) {
    const result = importRoadmapCsv(text, { ...createRoadmapData(), lanes: [] });
    if (!result.ok) return result;
    const title = fileName.replace(/\.[^.]+$/, "") || "Imported roadmap";
    return {
      ok: true,
      diagram: { ...createDiagram(title, "professional", "roadmap"), roadmap: result.data },
    };
  }
  if (/\.csv$/i.test(fileName) && isKanbanCsv(text)) {
    const result = importCards({ ...createKanbanData(), columns: [] }, text);
    if (!result.ok) return result;
    const title = fileName.replace(/\.[^.]+$/, "") || "Imported board";
    return { ok: true, diagram: { ...createDiagram(title, "professional", "kanban"), kanban: result.data } };
  }
  if (/\.(csv|xml)$/i.test(fileName) || trimmed.startsWith("<?xml") || trimmed.startsWith("<Project")) {
    const result = importGanttFile(fileName, text);
    if (!result.ok) return result;
    const title = result.title ?? (fileName.replace(/\.[^.]+$/, "") || "Imported plan");
    return { ok: true, diagram: { ...createDiagram(title, "professional", "gantt"), gantt: result.data } };
  }
  if (trimmed.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "The JSON is malformed" };
    }
    const isFile = typeof data === "object" && data !== null && "version" in data;
    if (isFile) {
      const parsed = parseDiagram(data);
      return parsed.ok ? { ok: true, diagram: parsed.value } : { ok: false, error: parsed.error };
    }
    return parseSimpleSpec(data);
  }
  const mermaid = parseMermaid(trimmed);
  return mermaid.ok ? { ok: true, diagram: mermaid.diagram } : { ok: false, error: mermaid.error };
}
