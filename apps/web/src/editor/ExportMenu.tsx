import { useEffect, useRef, useState, type ReactElement } from "react";
import type { Diagram } from "@linework/shared";
import {
  copyPngToClipboard,
  copySvgToClipboard,
  diagramToJson,
  diagramToPng,
  diagramToPortableSvg,
  downloadBlob,
  printDiagram,
  safeFileName,
} from "../export/exporters";
import { ganttToCsv, ganttToMsProjectXml } from "../gantt/io";
import { cardsToCsv } from "../kanban/io";
import { linksToCsv } from "../network/io";
import { roadmapToCsv } from "../roadmap/io";
import { diagramToMermaid } from "../mermaid/mermaid";
import { kindModel } from "../kinds/registry";
import { shareLink } from "../share/link";
import { useEditor } from "./store";

export interface ExportAction {
  readonly id: string;
  readonly group: "Download" | "Copy" | "Share";
  readonly label: string;
  readonly hint: string;
  readonly available?: (diagram: Diagram) => boolean;
  /** Returns a short confirmation to show, if any. */
  readonly run: (diagram: Diagram) => Promise<string | undefined>;
}

function download(data: BlobPart, type: string, fileName: string): void {
  downloadBlob(new Blob([data], { type }), fileName);
}

const BASE_ACTIONS: readonly ExportAction[] = [
  {
    id: "png",
    group: "Download",
    label: "PNG",
    hint: "Image, for slides and chat",
    run: async (d) => {
      downloadBlob(await diagramToPng(d), `${safeFileName(d.title)}.png`);
      return undefined;
    },
  },
  {
    id: "svg",
    group: "Download",
    label: "SVG",
    hint: "Vector, for docs and wikis",
    run: async (d) => {
      download((await diagramToPortableSvg(d)).svg, "image/svg+xml", `${safeFileName(d.title)}.svg`);
      return undefined;
    },
  },
  {
    id: "pdf",
    group: "Download",
    label: "PDF",
    hint: "Opens print; choose Save as PDF",
    run: async (d) => {
      await printDiagram(d);
      return undefined;
    },
  },
  {
    id: "json",
    group: "Download",
    label: "Linework file",
    hint: "Re-open or share later",
    run: async (d) => {
      download(diagramToJson(d), "application/json", `${safeFileName(d.title)}.linework.json`);
      return Promise.resolve(undefined);
    },
  },
  {
    id: "csv",
    group: "Download",
    label: "CSV",
    hint: "Tasks, cards, items or links for Excel or Google Sheets",
    available: (d) =>
      d.chartType === "gantt" ||
      d.chartType === "kanban" ||
      d.chartType === "network" ||
      d.chartType === "roadmap",
    run: async (d) => {
      const csv =
        d.chartType === "network"
          ? linksToCsv(d)
          : d.chartType === "roadmap" && d.roadmap
            ? roadmapToCsv(d.roadmap)
            : d.gantt
              ? ganttToCsv(d.gantt)
              : d.kanban
                ? cardsToCsv(d.kanban)
                : null;
      if (csv) download(csv, "text/csv", `${safeFileName(d.title)}.csv`);
      return Promise.resolve(undefined);
    },
  },
  {
    id: "msp",
    group: "Download",
    label: "MS Project XML",
    hint: "For Project, ProjectLibre, GanttProject",
    available: (d) => d.chartType === "gantt",
    run: async (d) => {
      if (d.gantt)
        download(ganttToMsProjectXml(d.gantt, d.title), "application/xml", `${safeFileName(d.title)}.xml`);
      return Promise.resolve(undefined);
    },
  },
  {
    id: "mermaid",
    group: "Download",
    label: "Mermaid",
    hint: "Text diagram (.mmd)",
    run: async (d) => {
      download(diagramToMermaid(d), "text/plain", `${safeFileName(d.title)}.mmd`);
      return Promise.resolve(undefined);
    },
  },
  {
    id: "copy-png",
    group: "Copy",
    label: "Copy as image",
    hint: "Paste straight into docs or chat",
    run: async (d) => {
      await copyPngToClipboard(d);
      return "Image copied";
    },
  },
  {
    id: "copy-svg",
    group: "Copy",
    label: "Copy SVG code",
    hint: "Paste into Figma or HTML",
    run: async (d) => {
      await copySvgToClipboard(d);
      return "SVG copied";
    },
  },
];

const SHARE_ACTIONS: readonly ExportAction[] = [
  {
    id: "share-link",
    group: "Share",
    label: "Copy share link",
    hint: "Anyone with the link gets their own copy",
    run: async (d) => {
      const link = await shareLink(d, window.location.origin);
      await navigator.clipboard.writeText(link);
      return link.length > 8000
        ? `Link copied (${String(Math.round(link.length / 1000))} KB - may be too long for some apps)`
        : "Link copied";
    },
  },
  {
    id: "embed",
    group: "Share",
    label: "Copy embed code",
    hint: "Read-only view for wikis, Notion and docs",
    run: async (d) => {
      const link = await shareLink(d, window.location.origin, "embed");
      const title = d.title.replaceAll('"', "&quot;");
      await navigator.clipboard.writeText(
        `<iframe src="${link}" title="${title}" width="800" height="500" style="border:1px solid #e5e7eb;border-radius:8px" loading="lazy"></iframe>`,
      );
      return "Embed code copied";
    },
  },
  {
    id: "mermaid-copy",
    group: "Share",
    label: "Copy Mermaid code",
    hint: "For GitHub, GitLab and Markdown docs",
    run: async (d) => {
      await navigator.clipboard.writeText(diagramToMermaid(d));
      return "Mermaid copied";
    },
  },
];

const extraActions: ExportAction[] = [...SHARE_ACTIONS];

/** Downloads a chart type adds, such as SQL for entity-relationship diagrams. */
function kindActions(diagram: Diagram): ExportAction[] {
  return (kindModel(diagram.chartType)?.exports ?? []).map((e) => ({
    id: `kind-${e.id}`,
    group: "Download",
    label: e.label,
    hint: e.hint,
    run: async (d) => {
      download(e.build(d), e.mime, `${safeFileName(d.title)}.${e.extension}`);
      return Promise.resolve(undefined);
    },
  }));
}

/** Lets other features (Mermaid, sharing) add entries without this file importing them all. */
export function registerExportAction(action: ExportAction): void {
  if (!extraActions.some((a) => a.id === action.id)) extraActions.push(action);
}

export function ExportMenu(): ReactElement {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const diagram = useEditor((s) => s.diagram);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, [message]);

  const actions = diagram
    ? [...BASE_ACTIONS, ...kindActions(diagram), ...extraActions].filter(
        (a) => a.available?.(diagram) ?? true,
      )
    : [];
  const groups = (["Download", "Copy", "Share"] as const).filter((g) => actions.some((a) => a.group === g));

  const run = async (action: ExportAction): Promise<void> => {
    const current = useEditor.getState().diagram;
    if (!current) return;
    setOpen(false);
    setMessage(null);
    try {
      const done = await action.run(current);
      if (done) setMessage({ text: done, error: false });
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "Export failed", error: true });
    }
  };

  return (
    <div className="menu" ref={menuRef}>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        Export
      </button>
      {open && (
        <div className="menu__list" role="menu">
          {groups.map((group) => (
            <div key={group} role="group" aria-label={group} className="menu__group">
              <span className="menu__group-label">{group}</span>
              {actions
                .filter((a) => a.group === group)
                .map((action) => (
                  <button key={action.id} type="button" role="menuitem" onClick={() => void run(action)}>
                    {action.label} <span>{action.hint}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      {message && (
        <p
          className={message.error ? "error-text menu__error" : "menu__status"}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
