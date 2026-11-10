import type { ReactNode } from "react";
import type { Tool } from "./store";

export interface ToolDef {
  readonly tool: Tool;
  readonly label: string;
  readonly shortcut: string;
  readonly icon: ReactNode;
}

export const TOOLS: readonly ToolDef[] = [
  {
    tool: "select",
    label: "Select",
    shortcut: "V",
    icon: <path d="M6 3l12 9-5.5 1L15 20l-2.5 1-2.6-7L6 17z" />,
  },
  { tool: "connect", label: "Connector", shortcut: "C", icon: <path d="M5 19L19 5M13 5h6v6" /> },
  { tool: "rectangle", label: "Rectangle", shortcut: "R", icon: <rect x="4" y="6" width="16" height="12" /> },
  {
    tool: "rounded",
    label: "Rounded rectangle",
    shortcut: "U",
    icon: <rect x="4" y="6" width="16" height="12" rx="4" />,
  },
  { tool: "ellipse", label: "Ellipse", shortcut: "O", icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
  { tool: "diamond", label: "Decision", shortcut: "D", icon: <path d="M12 3l9 9-9 9-9-9z" /> },
  { tool: "parallelogram", label: "Input / output", shortcut: "I", icon: <path d="M7 6h14l-4 12H3z" /> },
  {
    tool: "cylinder",
    label: "Database",
    shortcut: "B",
    icon: (
      <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3zM5 6c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    ),
  },
  { tool: "note", label: "Sticky note", shortcut: "N", icon: <path d="M4 4h12l4 4v12H4zM16 4v4h4" /> },
  {
    tool: "container",
    label: "Group",
    shortcut: "G",
    icon: <rect x="3" y="4" width="18" height="16" strokeDasharray="3 2" />,
  },
  { tool: "text", label: "Text", shortcut: "T", icon: <path d="M5 6V4h14v2M12 4v16M9 20h6" /> },
];

export const SELECT = TOOLS[0];
export const CONNECT = TOOLS[1];
export const byTool = (tool: Tool): ToolDef | undefined => TOOLS.find((t) => t.tool === tool);

/** The focused flowchart toolbox: the standard flowchart symbols, named by what they mean. */
export const FLOW_TOOLS: readonly ToolDef[] = [
  ...(SELECT && CONNECT ? [SELECT, CONNECT] : []),
  {
    tool: "terminal",
    label: "Start / end",
    shortcut: "E",
    icon: <rect x="3" y="7" width="18" height="10" rx="5" />,
  },
  {
    tool: "rectangle",
    label: "Process step",
    shortcut: "R",
    icon: <rect x="4" y="6" width="16" height="12" />,
  },
  { tool: "diamond", label: "Decision", shortcut: "D", icon: <path d="M12 3l9 9-9 9-9-9z" /> },
  { tool: "parallelogram", label: "Input / output", shortcut: "I", icon: <path d="M7 6h14l-4 12H3z" /> },
  {
    tool: "subroutine",
    label: "Subprocess",
    shortcut: "S",
    icon: <path d="M3 6h18v12H3zM6.5 6v12M17.5 6v12" />,
  },
  {
    tool: "document",
    label: "Document",
    shortcut: "M",
    icon: <path d="M4 5h16v12c-2.7-1.6-5.3 1.6-8 0s-5.3 1.6-8 0z" />,
  },
  ...[byTool("cylinder"), byTool("note"), byTool("text")].filter((t): t is ToolDef => t !== undefined),
];

/** Network maps add entities from their own buttons; the tools are just these. */
export const NETWORK_TOOLS: readonly ToolDef[] = [SELECT, CONNECT, byTool("note"), byTool("text")].filter(
  (t): t is ToolDef => t !== undefined,
);
