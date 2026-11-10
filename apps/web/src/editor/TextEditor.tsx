import { useEffect, useRef, useState, type ReactElement } from "react";
import type { TextAlign } from "@linework/shared";
import type { Rect } from "../render/geometry";

interface TextEditorProps {
  readonly initial: string;
  /** Screen-space box relative to the canvas element. */
  readonly box: Rect;
  readonly fontSize: number;
  readonly textAlign: TextAlign;
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
        height: Math.max(box.height, fontSize * 1.6),
        fontSize,
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
