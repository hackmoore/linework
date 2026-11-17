import { useEffect, useRef, useState, type ReactElement } from "react";
import type { TextAlign, VerticalAlign } from "@linework/shared";
import type { Rect } from "../render/geometry";

interface TextEditorProps {
  readonly initial: string;
  /** Screen-space box relative to the canvas element. */
  readonly box: Rect;
  readonly fontSize: number;
  readonly textAlign: TextAlign;
  /** Where the text sits in the box, matching the label on the canvas. */
  readonly verticalAlign?: VerticalAlign;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly color: string;
  readonly opaque?: boolean;
  /** Called with the new text, or null when editing was cancelled. */
  readonly onDone: (text: string | null) => void;
}

/** In-place label editor overlaid on the canvas. Enter commits, Shift+Enter adds a line, Escape cancels. */
export function TextEditor({
  initial,
  box,
  fontSize,
  textAlign,
  verticalAlign = "top",
  bold = false,
  italic = false,
  underline = false,
  color,
  opaque = false,
  onDone,
}: TextEditorProps): ReactElement {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (text: string | null): void => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };

  // A textarea always starts at the top, so pad it to put the text where the label sits.
  const height = Math.max(box.height, fontSize * 1.6);
  const textHeight = value.split("\n").length * fontSize * 1.3;
  const room = Math.max(0, height - textHeight - 8);
  const paddingTop = verticalAlign === "middle" ? room / 2 : verticalAlign === "bottom" ? room : undefined;

  return (
    <textarea
      ref={ref}
      className={`text-editor${opaque ? " text-editor--opaque" : ""}`}
      aria-label="Edit label"
      value={value}
      style={{
        left: box.x,
        top: box.y,
        width: Math.max(box.width, 60),
        height,
        ...(paddingTop === undefined ? {} : { paddingTop }),
        fontSize,
        fontWeight: bold ? 700 : undefined,
        fontStyle: italic ? "italic" : undefined,
        textDecoration: underline ? "underline" : undefined,
        textAlign,
        color,
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") finish(null);
        else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          finish(value);
        }
      }}
      onBlur={() => {
        finish(value);
      }}
    />
  );
}
