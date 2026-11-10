import { parseDiagram, type Diagram, type ParseResult } from "@linework/shared";

/** Parses an imported .json file's text into a diagram. */
export function parseDiagramJson(text: string): ParseResult<Diagram> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "File is not valid JSON" };
  }
  return parseDiagram(data);
}
