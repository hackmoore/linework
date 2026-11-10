import type { ReactElement, ReactNode } from "react";
import { ENTITY_TYPES, type ChartType } from "@linework/shared";
import { getIcon } from "../library/icons";
import { networkActions } from "../network/actions";
import { ENTITY_INFO } from "../network/model";
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

const SELECT = TOOLS[0];
const CONNECT = TOOLS[1];
const byTool = (tool: Tool): ToolDef | undefined => TOOLS.find((t) => t.tool === tool);

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

export function toolsFor(chartType: ChartType | undefined): readonly ToolDef[] {
  return chartType === "flowchart" ? FLOW_TOOLS : chartType === "network" ? NETWORK_TOOLS : TOOLS;
}

function EntityButtons({ canvasCentre }: { canvasCentre: () => { x: number; y: number } }): ReactElement {
  return (
    <>
      <span className="tool-palette__divider" aria-hidden="true" />
      {ENTITY_TYPES.map((type) => {
        const info = ENTITY_INFO[type];
        const icon = getIcon(info.icon);
        return (
          <button
            key={type}
            type="button"
            className="tool-button"
            aria-label={`Add ${info.label.toLowerCase()}`}
            title={`Add ${info.label.toLowerCase()}`}
            onClick={() => {
              networkActions.addEntity(type, canvasCentre());
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke={info.color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {icon?.paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </svg>
          </button>
        );
      })}
    </>
  );
}

export function ToolPalette({
  canvasCentre,
}: {
  /** Diagram point at the middle of the visible canvas, where new entities go. */
  canvasCentre: () => { x: number; y: number };
}): ReactElement {
  const tool = useEditor((s) => s.tool);
  const chartType = useEditor((s) => s.diagram?.chartType);
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
      {toolsFor(chartType).map((def) => (
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
      {chartType === "network" && <EntityButtons canvasCentre={canvasCentre} />}
    </div>
  );
}
