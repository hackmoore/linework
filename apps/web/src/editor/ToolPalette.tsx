import type { ReactElement, ReactNode } from "react";
import { useEditor, type Tool } from "./store";
import { useUi } from "./ui";

interface ToolDef {
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

export function ToolPalette(): ReactElement {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const libraryOpen = useUi((s) => s.libraryOpen);
  return (
    <div className="tool-palette" role="toolbar" aria-label="Tools" aria-orientation="vertical">
      <button
        type="button"
        className={`tool-button${libraryOpen ? " tool-button--active" : ""}`}
        aria-pressed={libraryOpen}
        aria-label="Shape and icon library (L)"
        title="Shape and icon library (L)"
        onClick={() => {
          useUi.getState().setLibraryOpen(!libraryOpen);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7" />
        </svg>
      </button>
      <span className="tool-palette__divider" aria-hidden="true" />
      {TOOLS.map((def) => (
        <button
          key={def.tool}
          type="button"
          className={`tool-button${tool === def.tool ? " tool-button--active" : ""}`}
          aria-pressed={tool === def.tool}
          aria-label={`${def.label} (${def.shortcut})`}
          title={`${def.label} (${def.shortcut})`}
          onClick={() => {
            setTool(def.tool);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {def.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
