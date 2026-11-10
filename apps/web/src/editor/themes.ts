import type { Diagram } from "@linework/shared";

/**
 * Colour themes recolour a whole freeform diagram in one undoable step. Fills are mapped
 * by matching each shape's fill to the nearest colour in the default palette, so a
 * diagram keeps its colour coding when it moves between themes.
 */
export interface ColorTheme {
  readonly id: string;
  readonly name: string;
  readonly background: string;
  readonly stroke: string;
  readonly text: string;
  /** Fills aligned index-for-index with BASE_FILLS. */
  readonly fills: readonly string[];
}

/** Default palette: white, blue, green, amber, red, purple, yellow note, grey. */
const BASE_FILLS = [
  "#ffffff",
  "#e8f0fe",
  "#e6f4ea",
  "#fff4e0",
  "#fde8e8",
  "#f1ebff",
  "#fff3b0",
  "#f3f4f6",
] as const;

export const THEMES: readonly ColorTheme[] = [
  {
    id: "light",
    name: "Light",
    background: "#ffffff",
    stroke: "#1f2937",
    text: "#1f2937",
    fills: BASE_FILLS,
  },
  {
    id: "dark",
    name: "Dark",
    background: "#111827",
    stroke: "#e5e7eb",
    text: "#f9fafb",
    fills: ["#1f2937", "#1e3a8a", "#14532d", "#78350f", "#7f1d1d", "#4c1d95", "#713f12", "#374151"],
  },
  {
    id: "blueprint",
    name: "Blueprint",
    background: "#1e3a8a",
    stroke: "#e0f2fe",
    text: "#f0f9ff",
    fills: ["#1e40af", "#1d4ed8", "#1e40af", "#1e40af", "#1e40af", "#1e40af", "#2563eb", "#1e40af"],
  },
  {
    id: "mono",
    name: "Monochrome",
    background: "#ffffff",
    stroke: "#111111",
    text: "#111111",
    fills: ["#ffffff", "#f2f2f2", "#e6e6e6", "#f7f7f7", "#dedede", "#ebebeb", "#f5f5f5", "#eeeeee"],
  },
  {
    id: "pastel",
    name: "Pastel",
    background: "#fdfcf8",
    stroke: "#5b5b7a",
    text: "#3f3f5a",
    fills: ["#ffffff", "#dbeafe", "#dcfce7", "#ffedd5", "#ffe4e6", "#ede9fe", "#fef9c3", "#f1f5f9"],
  },
];

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Index of the nearest colour in `palette` (across all themes' fills, then mapped back). */
function nearestFillIndex(color: string): number {
  const [r, g, b] = rgb(color);
  let best = 0;
  let bestDistance = Infinity;
  for (const theme of THEMES) {
    theme.fills.forEach((candidate, i) => {
      const [cr, cg, cb] = rgb(candidate);
      const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
  }
  return best;
}

export function applyTheme(diagram: Diagram, theme: ColorTheme): Diagram {
  return {
    ...diagram,
    background: theme.background,
    nodes: diagram.nodes.map((n) => ({
      ...n,
      stroke: n.kind === "text" ? n.stroke : theme.stroke,
      textColor: theme.text,
      fill: n.fill === "transparent" ? n.fill : (theme.fills[nearestFillIndex(n.fill)] ?? n.fill),
    })),
    edges: diagram.edges.map((e) => ({ ...e, stroke: theme.stroke })),
  };
}
