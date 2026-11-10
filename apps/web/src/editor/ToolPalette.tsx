import type { ReactElement } from "react";
import { ENTITY_TYPES, type ChartType } from "@linework/shared";
import { getIcon } from "../library/icons";
import { networkActions } from "../network/actions";
import { ENTITY_INFO } from "../network/model";
import { kindUi } from "../kinds/ui";
import { useEditor } from "./store";
import { FLOW_TOOLS, NETWORK_TOOLS, TOOLS, type ToolDef } from "./tools";
import { useUi } from "./ui";

export function toolsFor(chartType: ChartType | undefined): readonly ToolDef[] {
  const kind = kindUi(chartType);
  if (kind) return kind.tools;
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
  const Palette = kindUi(chartType)?.Palette;
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
      {Palette && <Palette canvasCentre={canvasCentre} />}
    </div>
  );
}
