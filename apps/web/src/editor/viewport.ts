import { boundsOf } from "../render/geometry";
import { MAX_ZOOM, useEditor } from "./store";

interface Size {
  readonly width: number;
  readonly height: number;
}

const FIT_PADDING = 60;

/** Centres the diagram in the canvas, zooming out if needed but never beyond 100%. */
export function fitToContent(canvas: Size): void {
  const { diagram, setViewport } = useEditor.getState();
  if (!diagram || canvas.width === 0 || canvas.height === 0) return;
  const bounds = boundsOf(diagram.nodes);
  if (!bounds) {
    setViewport({ x: -canvas.width / 2, y: -canvas.height / 3, zoom: 1 });
    return;
  }
  const zoom = Math.min(
    1,
    (canvas.width - FIT_PADDING * 2) / Math.max(bounds.width, 1),
    (canvas.height - FIT_PADDING * 2) / Math.max(bounds.height, 1),
  );
  setViewport({
    x: bounds.x + bounds.width / 2 - canvas.width / 2 / zoom,
    y: bounds.y + bounds.height / 2 - canvas.height / 2 / zoom,
    zoom,
  });
}

/** Zooms around the canvas centre. */
export function zoomBy(factor: number, canvas: Size): void {
  const { viewport, setViewport } = useEditor.getState();
  const zoom = Math.min(MAX_ZOOM, Math.max(0.1, viewport.zoom * factor));
  const cx = viewport.x + canvas.width / 2 / viewport.zoom;
  const cy = viewport.y + canvas.height / 2 / viewport.zoom;
  setViewport({ x: cx - canvas.width / 2 / zoom, y: cy - canvas.height / 2 / zoom, zoom });
}
