/** A diagram style changes how every shape is drawn without touching the document's colours. */
export interface DiagramStyle {
  readonly id: StyleId;
  readonly name: string;
  readonly description: string;
  /** Whether shapes are drawn with roughjs for a hand-drawn look. */
  readonly sketchy: boolean;
  readonly fontFamily: string;
  /** roughjs roughness; ignored when not sketchy. */
  readonly roughness: number;
  /** Corner radius used by the "rounded" shape kind. */
  readonly cornerRadius: number;
}

export const STYLE_IDS = ["professional", "sketch"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const DIAGRAM_STYLES: Readonly<Record<StyleId, DiagramStyle>> = {
  professional: {
    id: "professional",
    name: "Professional",
    description: "Crisp lines for documents and presentations.",
    sketchy: false,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    roughness: 0,
    cornerRadius: 10,
  },
  sketch: {
    id: "sketch",
    name: "Hand-drawn",
    description: "A whiteboard feel for early ideas.",
    sketchy: true,
    fontFamily: "Kalam, 'Comic Sans MS', cursive",
    roughness: 1.2,
    cornerRadius: 14,
  },
};

/** Resolves a stored style id; unknown ids (e.g. from a newer version) fall back to professional. */
export function getStyle(styleId: string): DiagramStyle {
  return (STYLE_IDS as readonly string[]).includes(styleId)
    ? DIAGRAM_STYLES[styleId as StyleId]
    : DIAGRAM_STYLES.professional;
}
