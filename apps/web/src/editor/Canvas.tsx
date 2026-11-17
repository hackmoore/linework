import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactElement } from "react";
import type { Diagram, DiagramEdge, DiagramNode, EdgeAnchor } from "@linework/shared";
import { defaultSize } from "../diagram/factory";
import { DiagramContent, visibleNodesInOrder } from "../render/DiagramSvg";
import {
  anchorAttachment,
  anchorPoints,
  boundaryPoint,
  boundsOf,
  center,
  nearestAnchor,
  edgePoints,
  normalizeRect,
  pointsToPath,
  edgeMidpoint,
  edgePath,
  previewPoints,
  rectContainsPoint,
  type Point,
  type Rect,
} from "../render/geometry";
import { LIBRARY_MIME, placeLibraryItem, type LibraryItem } from "../library/LibraryPanel";
import { useSavedShapes } from "../library/savedShapes";
import { snapToGuides, type GuideLine } from "./arrange";
import { commentAnchor } from "./comments";
import { useUi } from "./ui";
import { currentSession, useLive } from "../collab/session";
import { editableLayerIds, useEditor, type Viewport } from "./store";
import { TextEditor } from "./TextEditor";
import { kindModel } from "../kinds/registry";
import { flowDirection } from "../flowchart/model";

const GRID = 10;
const GUIDE_THRESHOLD = 6;
const DRAG_THRESHOLD = 3;
const MIN_NODE_SIZE = 20;
/** Screen pixels within which a dragged connector end snaps to an attach point. */
const ANCHOR_SNAP = 14;

type Handle = "nw" | "ne" | "sw" | "se";

type Gesture =
  | { type: "pan"; startClient: Point; startViewport: Viewport }
  | { type: "move"; start: Point; origins: Map<string, Point>; started: boolean; guides: GuideLine[] }
  | { type: "resize"; nodeId: string; handle: Handle; origin: DiagramNode; start: Point; started: boolean }
  | { type: "marquee"; start: Point; current: Point; additive: boolean }
  | {
      type: "connect";
      sourceId: string;
      current: Point;
      targetId: string | null;
      targetAnchor: EdgeAnchor | null;
    }
  /** Dragging one end of a connector to another shape or attach point. */
  | {
      type: "reattach";
      edgeId: string;
      end: "source" | "target";
      current: Point;
      nodeId: string | null;
      anchor: EdgeAnchor | null;
    }
  | { type: "create"; start: Point; current: Point };

const snap = (value: number, enabled: boolean): number => (enabled ? Math.round(value / GRID) * GRID : value);

/** Topmost node under a point; non-container shapes win over the containers behind them. */
export function nodeAt(diagram: Diagram, p: Point): DiagramNode | null {
  const hit = (n: DiagramNode): boolean => rectContainsPoint(n, p);
  const editable = editableLayerIds(diagram);
  const nodes = visibleNodesInOrder(diagram).filter((n) => editable.has(n.layerId));
  const others = nodes.filter((n) => n.kind !== "container");
  const containers = nodes.filter((n) => n.kind === "container");
  return others.findLast(hit) ?? containers.findLast(hit) ?? null;
}

function isInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function Canvas(): ReactElement | null {
  const diagram = useEditor((s) => s.diagram);
  const viewport = useEditor((s) => s.viewport);
  const showGrid = useUi((s) => s.showGrid);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const editingNodeId = useEditor((s) => s.editingNodeId);
  const editingEdgeId = useEditor((s) => s.editingEdgeId);

  const containerRef = useRef<HTMLDivElement>(null);
  const savedShapes = useSavedShapes();
  const gestureRef = useRef<Gesture | null>(null);
  // Mirrors gestureRef for the parts that render (marquee, connector preview, create preview).
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const toDiagram = useCallback((clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    const { viewport: vp } = useEditor.getState();
    return {
      x: vp.x + (clientX - (rect?.left ?? 0)) / vp.zoom,
      y: vp.y + (clientY - (rect?.top ?? 0)) / vp.zoom,
    };
  }, []);

  const updateGesture = (next: Gesture | null): void => {
    gestureRef.current = next;
    setGesture(next);
  };

  // Wheel: pan by default, zoom around the cursor with ctrl/cmd (also trackpad pinch).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const { viewport: vp, setViewport } = useEditor.getState();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        const sx = event.clientX - rect.left;
        const sy = event.clientY - rect.top;
        const zoom = Math.min(4, Math.max(0.1, vp.zoom * Math.exp(-event.deltaY * 0.01)));
        const anchorX = vp.x + sx / vp.zoom;
        const anchorY = vp.y + sy / vp.zoom;
        setViewport({ x: anchorX - sx / zoom, y: anchorY - sy / zoom, zoom });
      } else {
        setViewport({ ...vp, x: vp.x + event.deltaX / vp.zoom, y: vp.y + event.deltaY / vp.zoom });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const down = (event: KeyboardEvent): void => {
      if (event.code === "Space" && !isTyping(event.target)) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (event: KeyboardEvent): void => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  if (!diagram) return null;

  const onPointerDown = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0 && event.button !== 1) return;
    const state = useEditor.getState();
    const current = state.diagram;
    if (!current) return;
    if (state.editingNodeId || state.editingEdgeId) state.startEditing(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = toDiagram(event.clientX, event.clientY);

    if (event.button === 1 || spaceHeld) {
      updateGesture({
        type: "pan",
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: state.viewport,
      });
      return;
    }

    const target = event.target as Element;
    const edgeEnd = target.closest("[data-edge-end]");
    const endEdgeId = edgeEnd?.getAttribute("data-edge-end-id");
    if (edgeEnd && endEdgeId) {
      const end = edgeEnd.getAttribute("data-edge-end") === "source" ? "source" : "target";
      updateGesture({ type: "reattach", edgeId: endEdgeId, end, current: p, nodeId: null, anchor: null });
      return;
    }
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
    const handleNode = target.closest("[data-handle-node]")?.getAttribute("data-handle-node");
    if (handle && handleNode) {
      const node = current.nodes.find((n) => n.id === handleNode);
      if (!node) return;
      if (handle === "connect")
        updateGesture({ type: "connect", sourceId: node.id, current: p, targetId: null, targetAnchor: null });
      else
        updateGesture({
          type: "resize",
          nodeId: node.id,
          handle: handle as Handle,
          origin: node,
          start: p,
          started: false,
        });
      return;
    }

    if (state.tool !== "select" && state.tool !== "connect") {
      updateGesture({ type: "create", start: p, current: p });
      return;
    }

    const rawNodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
    // Shapes on locked layers behave like empty canvas.
    const editable = editableLayerIds(current);
    const nodeId =
      rawNodeId && editable.has(current.nodes.find((n) => n.id === rawNodeId)?.layerId ?? "")
        ? rawNodeId
        : null;
    const edgeId = target.closest("[data-edge-id]")?.getAttribute("data-edge-id") ?? null;

    if (state.tool === "connect") {
      const source = nodeId ?? nodeAt(current, p)?.id;
      if (source)
        updateGesture({ type: "connect", sourceId: source, current: p, targetId: null, targetAnchor: null });
      return;
    }

    if (nodeId) {
      const already = state.selection.nodeIds.includes(nodeId);
      let nodeIds: readonly string[];
      if (event.shiftKey) {
        nodeIds = already
          ? state.selection.nodeIds.filter((id) => id !== nodeId)
          : [...state.selection.nodeIds, nodeId];
        state.select({ nodeIds, edgeIds: state.selection.edgeIds });
      } else if (already) {
        nodeIds = state.selection.nodeIds;
      } else {
        nodeIds = [nodeId];
        state.select({ nodeIds });
      }
      // Moving a container carries the shapes sitting inside it.
      const moving = new Set(nodeIds);
      for (const n of current.nodes) {
        if (n.kind === "container" && moving.has(n.id)) {
          for (const inner of current.nodes)
            if (inner.id !== n.id && isInside(inner, n)) moving.add(inner.id);
        }
      }
      const origins = new Map<string, Point>();
      for (const n of current.nodes) if (moving.has(n.id)) origins.set(n.id, { x: n.x, y: n.y });
      updateGesture({ type: "move", start: p, origins, started: false, guides: [] });
      return;
    }

    if (edgeId) {
      if (event.shiftKey) {
        const has = state.selection.edgeIds.includes(edgeId);
        state.select({
          nodeIds: state.selection.nodeIds,
          edgeIds: has
            ? state.selection.edgeIds.filter((id) => id !== edgeId)
            : [...state.selection.edgeIds, edgeId],
        });
      } else {
        state.select({ edgeIds: [edgeId] });
      }
      return;
    }

    if (!event.shiftKey) state.clearSelection();
    updateGesture({ type: "marquee", start: p, current: p, additive: event.shiftKey });
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    currentSession()?.setCursor(toDiagram(event.clientX, event.clientY));
    const g = gestureRef.current;
    if (!g) return;
    const state = useEditor.getState();
    const p = toDiagram(event.clientX, event.clientY);
    const snapping = !event.altKey;
    switch (g.type) {
      case "pan": {
        const vp = g.startViewport;
        state.setViewport({
          ...vp,
          x: vp.x - (event.clientX - g.startClient.x) / vp.zoom,
          y: vp.y - (event.clientY - g.startClient.y) / vp.zoom,
        });
        return;
      }
      case "move": {
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (!g.started) {
          if (Math.hypot(dx, dy) * state.viewport.zoom < DRAG_THRESHOLD) return;
          g.started = true;
          state.checkpoint();
        }
        // Smart guides: line the moved shapes up with other shapes' edges and centres.
        // A guide match wins over the grid on its axis; Alt turns all snapping off.
        let guideX: number | null = null;
        let guideY: number | null = null;
        let guides: GuideLine[] = [];
        const current = state.diagram;
        if (snapping && current) {
          const movedBoxes = current.nodes
            .filter((n) => g.origins.has(n.id))
            .map((n) => {
              const o = g.origins.get(n.id) ?? n;
              return { x: o.x + dx, y: o.y + dy, width: n.width, height: n.height };
            });
          const bounds = boundsOf(movedBoxes);
          const editable = editableLayerIds(current);
          const others = current.nodes.filter((n) => !g.origins.has(n.id) && editable.has(n.layerId));
          if (bounds && others.length > 0 && others.length < 2000) {
            const result = snapToGuides(bounds, others, GUIDE_THRESHOLD / state.viewport.zoom);
            guides = result.guides;
            if (result.guides.some((l) => l.axis === "x")) guideX = result.dx;
            if (result.guides.some((l) => l.axis === "y")) guideY = result.dy;
          }
        }
        updateGesture({ ...g, guides });
        state.transient((d) => ({
          ...d,
          nodes: d.nodes.map((n) => {
            const origin = g.origins.get(n.id);
            if (!origin) return n;
            const x = guideX !== null ? Math.round(origin.x + dx + guideX) : snap(origin.x + dx, snapping);
            const y = guideY !== null ? Math.round(origin.y + dy + guideY) : snap(origin.y + dy, snapping);
            return { ...n, x, y };
          }),
        }));
        return;
      }
      case "resize": {
        if (!g.started) {
          g.started = true;
          state.checkpoint();
        }
        const o = g.origin;
        let left = o.x;
        let top = o.y;
        let right = o.x + o.width;
        let bottom = o.y + o.height;
        if (g.handle.includes("w")) left = Math.min(snap(p.x, snapping), right - MIN_NODE_SIZE);
        if (g.handle.includes("e")) right = Math.max(snap(p.x, snapping), left + MIN_NODE_SIZE);
        if (g.handle.includes("n")) top = Math.min(snap(p.y, snapping), bottom - MIN_NODE_SIZE);
        if (g.handle.includes("s")) bottom = Math.max(snap(p.y, snapping), top + MIN_NODE_SIZE);
        state.transient((d) => ({
          ...d,
          nodes: d.nodes.map((n) =>
            n.id === g.nodeId ? { ...n, x: left, y: top, width: right - left, height: bottom - top } : n,
          ),
        }));
        return;
      }
      case "marquee":
      case "create":
        updateGesture({ ...g, current: p });
        return;
      case "connect": {
        const current = state.diagram;
        const found = current ? nodeAt(current, p) : null;
        const hover = found && found.id !== g.sourceId ? found : null;
        updateGesture({
          ...g,
          current: p,
          targetId: hover?.id ?? null,
          targetAnchor: hover ? nearestAnchor(hover, p, ANCHOR_SNAP / state.viewport.zoom) : null,
        });
        return;
      }
      case "reattach": {
        const current = state.diagram;
        const edge = current?.edges.find((e) => e.id === g.edgeId);
        const found = current ? nodeAt(current, p) : null;
        // The other end's shape is allowed too, so an end can move round its own shape's sides.
        const hover =
          found && edge && found.id !== (g.end === "source" ? edge.target : edge.source) ? found : null;
        updateGesture({
          ...g,
          current: p,
          nodeId: hover?.id ?? null,
          anchor: hover ? nearestAnchor(hover, p, ANCHOR_SNAP / state.viewport.zoom) : null,
        });
        return;
      }
    }
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>): void => {
    const g = gestureRef.current;
    updateGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!g) return;
    const state = useEditor.getState();
    switch (g.type) {
      case "marquee": {
        const rect = normalizeRect(g.start, g.current);
        if (rect.width > 2 || rect.height > 2) state.selectInRect(rect, g.additive);
        return;
      }
      case "connect":
        if (g.targetId) state.connect(g.sourceId, g.targetId, { targetAnchor: g.targetAnchor ?? undefined });
        return;
      case "reattach": {
        const { nodeId, anchor, end, edgeId } = g;
        if (!nodeId) return;
        // Dropping on a shape away from its points attaches automatically ("loose").
        state.commit((d) => ({
          ...d,
          edges: d.edges.map((e) =>
            e.id === edgeId
              ? end === "source"
                ? { ...e, source: nodeId, sourceAnchor: anchor ?? undefined }
                : { ...e, target: nodeId, targetAnchor: anchor ?? undefined }
              : e,
          ),
        }));
        return;
      }
      case "create": {
        const kind = state.tool;
        if (kind === "select" || kind === "connect") return;
        const rect = normalizeRect(g.start, g.current);
        const dragged = rect.width * state.viewport.zoom > 8 && rect.height * state.viewport.zoom > 8;
        const size = dragged
          ? {
              width: Math.max(MIN_NODE_SIZE, snap(rect.width, true)),
              height: Math.max(MIN_NODE_SIZE, snap(rect.height, true)),
            }
          : defaultSize(kind);
        const c = dragged ? center(rect) : g.start;
        const id = state.addNode(kind, snap(c.x, true), snap(c.y, true), size);
        state.setTool("select");
        if (kind === "text") state.startEditing({ nodeId: id });
        return;
      }
      default:
        return;
    }
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    const state = useEditor.getState();
    if (state.tool !== "select" || !state.diagram) return;
    // Pointer capture (taken on pointer down) makes the svg the event target, so look up
    // what is actually under the pointer.
    const target = document.elementFromPoint(event.clientX, event.clientY) ?? (event.target as Element);
    const p = toDiagram(event.clientX, event.clientY);
    const edgeId = target.closest("[data-edge-id]")?.getAttribute("data-edge-id");
    const nodeId = edgeId ? null : (nodeAt(state.diagram, p)?.id ?? null);
    if (nodeId) {
      state.select({ nodeIds: [nodeId] });
      state.startEditing({ nodeId });
    } else if (edgeId) {
      state.select({ edgeIds: [edgeId] });
      state.startEditing({ edgeId });
    } else {
      const id = state.addNode("text", snap(p.x, true), snap(p.y, true));
      state.startEditing({ nodeId: id });
    }
  };

  const selectedNodes = diagram.nodes.filter((n) => selection.nodeIds.includes(n.id));
  const single = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
  const nodesById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const handleSize = 9 / viewport.zoom;
  const flow = flowDirection(diagram) ?? kindModel(diagram.chartType)?.loopFlow?.(diagram);
  const axis = kindModel(diagram.chartType)?.elbowAxis?.(diagram);
  // A single selected connector shows handles on its ends, for moving where they attach.
  const endsEdge =
    selection.edgeIds.length === 1 && selection.nodeIds.length === 0
      ? diagram.edges.find((e) => e.id === selection.edgeIds[0])
      : undefined;
  const endsSource = endsEdge && nodesById.get(endsEdge.source);
  const endsTarget = endsEdge && nodesById.get(endsEdge.target);
  const endPoints =
    endsEdge && endsSource && endsTarget ? edgePoints(endsEdge, endsSource, endsTarget, flow, axis) : null;
  const strokeScale = 1 / viewport.zoom;
  const cursor =
    gesture?.type === "pan" ? "grabbing" : spaceHeld ? "grab" : tool === "select" ? "default" : "crosshair";

  let preview: ReactElement | null = null;
  if (gesture?.type === "marquee") {
    const r = normalizeRect(gesture.start, gesture.current);
    preview = (
      <rect
        className="canvas__marquee"
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        strokeWidth={strokeScale}
      />
    );
  } else if (gesture?.type === "create") {
    const r = normalizeRect(gesture.start, gesture.current);
    preview = (
      <rect
        className="canvas__marquee"
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        strokeWidth={strokeScale}
      />
    );
  } else if (gesture?.type === "reattach") {
    const edge = diagram.edges.find((e) => e.id === gesture.edgeId);
    const hover = gesture.nodeId ? nodesById.get(gesture.nodeId) : undefined;
    const source = edge && nodesById.get(edge.source);
    const target = edge && nodesById.get(edge.target);
    if (edge && source && target) {
      let points: Point[];
      if (hover) {
        const moved: DiagramEdge =
          gesture.end === "source"
            ? { ...edge, source: hover.id, sourceAnchor: gesture.anchor ?? undefined }
            : { ...edge, target: hover.id, targetAnchor: gesture.anchor ?? undefined };
        points = edgePoints(
          moved,
          gesture.end === "source" ? hover : source,
          gesture.end === "source" ? target : hover,
          flow,
          axis,
        );
      } else {
        // Over empty canvas: a straight line from the end that stays put to the pointer.
        const fixed = gesture.end === "source" ? target : source;
        const fixedAnchor = gesture.end === "source" ? edge.targetAnchor : edge.sourceAnchor;
        const from = fixedAnchor
          ? anchorAttachment(fixed, fixedAnchor).point
          : boundaryPoint(fixed, gesture.current);
        points = [from, gesture.current];
      }
      preview = (
        <g>
          {hover && <AnchorDots node={hover} hot={gesture.anchor} scale={strokeScale} />}
          <path
            className="canvas__connector-preview"
            d={edgePath(hover ? edge.routing : "straight", points)}
            strokeWidth={2 * strokeScale}
          />
        </g>
      );
    }
  } else if (gesture?.type === "connect") {
    const source = nodesById.get(gesture.sourceId);
    const target = gesture.targetId ? nodesById.get(gesture.targetId) : undefined;
    if (source) {
      const points = target
        ? edgePoints({ routing: "straight", targetAnchor: gesture.targetAnchor ?? undefined }, source, target)
        : previewPoints(source, gesture.current);
      preview = (
        <g>
          {target && <AnchorDots node={target} hot={gesture.targetAnchor} scale={strokeScale} />}
          {target && (
            <rect
              className="canvas__drop-target"
              x={target.x - 4 * strokeScale}
              y={target.y - 4 * strokeScale}
              width={target.width + 8 * strokeScale}
              height={target.height + 8 * strokeScale}
              strokeWidth={2 * strokeScale}
            />
          )}
          <path
            className="canvas__connector-preview"
            d={pointsToPath(points)}
            strokeWidth={2 * strokeScale}
          />
        </g>
      );
    }
  }

  return (
    <div
      ref={containerRef}
      className="canvas"
      style={{ cursor }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(LIBRARY_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData(LIBRARY_MIME);
        if (!raw) return;
        event.preventDefault();
        try {
          placeLibraryItem(
            JSON.parse(raw) as LibraryItem,
            toDiagram(event.clientX, event.clientY),
            savedShapes,
          );
        } catch {
          // Ignore drops from other apps that happen to use our type.
        }
      }}
    >
      <svg
        className="canvas__svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onPointerLeave={() => currentSession()?.setCursor(null)}
        role="application"
        aria-label="Diagram canvas"
      >
        <defs>
          <pattern id="canvas-grid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} className="canvas__grid-dot" />
          </pattern>
        </defs>
        <g transform={`scale(${viewport.zoom}) translate(${-viewport.x} ${-viewport.y})`}>
          <rect
            x={viewport.x}
            y={viewport.y}
            width="100000"
            height="100000"
            fill={diagram.background === "transparent" ? "transparent" : diagram.background}
          />
          {showGrid && (
            <rect x={viewport.x} y={viewport.y} width="100000" height="100000" fill="url(#canvas-grid)" />
          )}
          <DiagramContent diagram={diagram} editingNodeId={editingNodeId} />

          {diagram.edges
            .filter((e) => selection.edgeIds.includes(e.id))
            .map((edge) => {
              const s = nodesById.get(edge.source);
              const t = nodesById.get(edge.target);
              if (!s || !t) return null;
              return (
                <path
                  key={edge.id}
                  className="canvas__edge-selected"
                  d={edgePath(
                    edge.routing,
                    edgePoints(
                      edge,
                      s,
                      t,
                      flowDirection(diagram) ?? kindModel(diagram.chartType)?.loopFlow?.(diagram),
                      kindModel(diagram.chartType)?.elbowAxis?.(diagram),
                    ),
                  )}
                  strokeWidth={edge.strokeWidth + 6 * strokeScale}
                />
              );
            })}

          {endsEdge && endPoints && !gesture && (
            <g>
              {(["source", "target"] as const).map((end) => {
                const point = end === "source" ? endPoints[0] : endPoints[endPoints.length - 1];
                if (!point) return null;
                return (
                  <circle
                    key={end}
                    data-edge-end={end}
                    data-edge-end-id={endsEdge.id}
                    className="canvas__edge-end"
                    cx={point.x}
                    cy={point.y}
                    r={6 * strokeScale}
                    strokeWidth={2 * strokeScale}
                  >
                    <title>Drag onto a point on any shape to attach this end there</title>
                  </circle>
                );
              })}
            </g>
          )}

          {selectedNodes.map((node) => (
            <rect
              key={node.id}
              className="canvas__selection"
              x={node.x - 3 * strokeScale}
              y={node.y - 3 * strokeScale}
              width={node.width + 6 * strokeScale}
              height={node.height + 6 * strokeScale}
              strokeWidth={1.5 * strokeScale}
            />
          ))}

          {single && !gesture && (
            <g data-handle-node={single.id}>
              {(["nw", "ne", "sw", "se"] as const).map((h) => {
                const hx = h.includes("w") ? single.x : single.x + single.width;
                const hy = h.includes("n") ? single.y : single.y + single.height;
                return (
                  <rect
                    key={h}
                    data-handle={h}
                    className={`canvas__handle canvas__handle--${h}`}
                    x={hx - handleSize / 2}
                    y={hy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    strokeWidth={strokeScale}
                  />
                );
              })}
              <circle
                data-handle="connect"
                className="canvas__connect-handle"
                cx={single.x + single.width + 18 * strokeScale}
                cy={single.y + single.height / 2}
                r={7 * strokeScale}
                strokeWidth={1.5 * strokeScale}
              >
                <title>Drag to connect</title>
              </circle>
            </g>
          )}
          {diagram.comments
            .filter((c) => !c.resolved)
            .map((comment, i) => {
              const anchor = commentAnchor(comment, diagram.nodes);
              const r = 11 * strokeScale;
              return (
                <g
                  key={comment.id}
                  className="canvas__comment-pin"
                  transform={`translate(${String(anchor.x)} ${String(anchor.y)})`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    useUi.getState().focusComment(comment.id);
                  }}
                >
                  <title>{`${comment.author}: ${comment.text}`}</title>
                  <circle r={r} fill="#f59e0b" stroke="#fff" strokeWidth={1.5 * strokeScale} />
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11 * strokeScale}
                    fontWeight={700}
                    fill="#fff"
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
          {gesture?.type === "move" &&
            gesture.guides.map((line, i) =>
              line.axis === "x" ? (
                <line
                  key={i}
                  className="canvas__guide"
                  x1={line.at}
                  x2={line.at}
                  y1={line.from - 12}
                  y2={line.to + 12}
                  strokeWidth={strokeScale}
                />
              ) : (
                <line
                  key={i}
                  className="canvas__guide"
                  y1={line.at}
                  y2={line.at}
                  x1={line.from - 12}
                  x2={line.to + 12}
                  strokeWidth={strokeScale}
                />
              ),
            )}
          <RemoteCursors scale={strokeScale} nodes={diagram.nodes} />
          {preview}
        </g>
      </svg>
      {editingNodeId && <NodeTextEditor nodeId={editingNodeId} />}
      {editingEdgeId && <EdgeTextEditor edgeId={editingEdgeId} />}
    </div>
  );
}

function NodeTextEditor({ nodeId }: { nodeId: string }): ReactElement | null {
  const node = useEditor((s) => s.diagram?.nodes.find((n) => n.id === nodeId));
  const viewport = useEditor((s) => s.viewport);
  if (!node) return null;
  return (
    <TextEditor
      key={nodeId}
      initial={node.label}
      fontSize={node.fontSize * viewport.zoom}
      textAlign={node.textAlign}
      color={node.textColor}
      box={{
        x: (node.x - viewport.x) * viewport.zoom,
        y: (node.y - viewport.y) * viewport.zoom,
        width: node.width * viewport.zoom,
        height: node.height * viewport.zoom,
      }}
      onDone={(label) => {
        const state = useEditor.getState();
        state.startEditing(null);
        if (label !== null && label !== node.label) state.updateNodes([nodeId], { label });
      }}
    />
  );
}

function EdgeTextEditor({ edgeId }: { edgeId: string }): ReactElement | null {
  const diagram = useEditor((s) => s.diagram);
  const viewport = useEditor((s) => s.viewport);
  const edge = diagram?.edges.find((e) => e.id === edgeId);
  const source = edge && diagram?.nodes.find((n) => n.id === edge.source);
  const target = edge && diagram?.nodes.find((n) => n.id === edge.target);
  if (!edge || !source || !target) return null;
  const mid = edgeMidpoint(
    edge.routing,
    edgePoints(
      edge,
      source,
      target,
      diagram ? (flowDirection(diagram) ?? kindModel(diagram.chartType)?.loopFlow?.(diagram)) : undefined,
      diagram ? kindModel(diagram.chartType)?.elbowAxis?.(diagram) : undefined,
    ),
  );
  const width = 160 * viewport.zoom;
  const height = 48 * viewport.zoom;
  return (
    <TextEditor
      key={edgeId}
      initial={edge.label}
      fontSize={14 * viewport.zoom}
      textAlign="center"
      color={edge.stroke}
      opaque
      box={{
        x: (mid.x - viewport.x) * viewport.zoom - width / 2,
        y: (mid.y - viewport.y) * viewport.zoom - height / 2,
        width,
        height,
      }}
      onDone={(label) => {
        const state = useEditor.getState();
        state.startEditing(null);
        if (label !== null && label !== edge.label) state.updateEdges([edgeId], { label });
      }}
    />
  );
}

/** Collaborators' pointers and selections, drawn in diagram coordinates. */
function RemoteCursors({
  scale,
  nodes,
}: {
  scale: number;
  nodes: readonly DiagramNode[];
}): ReactElement | null {
  const peers = useLive((s) => s.peers);
  if (peers.size === 0) return null;
  return (
    <g pointerEvents="none">
      {[...peers.values()].map((peer) => (
        <g key={peer.client}>
          {nodes
            .filter((n) => peer.selection.includes(n.id))
            .map((n) => (
              <rect
                key={n.id}
                x={n.x - 5 * scale}
                y={n.y - 5 * scale}
                width={n.width + 10 * scale}
                height={n.height + 10 * scale}
                fill="none"
                stroke={peer.color}
                strokeWidth={2 * scale}
                strokeDasharray={`${String(4 * scale)} ${String(3 * scale)}`}
              />
            ))}
          {peer.cursor && (
            <g
              transform={`translate(${String(peer.cursor.x)} ${String(peer.cursor.y)}) scale(${String(scale)})`}
            >
              <path d="M0 0l0 16 4.5-4 3 7 2.5-1-3-7 6-.5z" fill={peer.color} stroke="#fff" strokeWidth={1} />
              <rect x={12} y={16} rx={4} height={18} width={peer.name.length * 7 + 12} fill={peer.color} />
              <text
                x={18}
                y={25}
                fontSize={11}
                fill="#fff"
                dominantBaseline="central"
                fontFamily="Inter, sans-serif"
              >
                {peer.name}
              </text>
            </g>
          )}
        </g>
      ))}
    </g>
  );
}

/** The twelve attach points of a shape, shown while dragging a connector end over it. */
function AnchorDots({
  node,
  hot,
  scale,
}: {
  node: DiagramNode;
  hot: EdgeAnchor | null;
  scale: number;
}): ReactElement {
  return (
    <g pointerEvents="none">
      {anchorPoints(node).map(({ anchor, point }) => (
        <circle
          key={anchor}
          className={`canvas__anchor${anchor === hot ? " canvas__anchor--hot" : ""}`}
          cx={point.x}
          cy={point.y}
          r={(anchor === hot ? 5.5 : 4) * scale}
          strokeWidth={1.5 * scale}
        />
      ))}
    </g>
  );
}
