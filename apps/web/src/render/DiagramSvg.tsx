import { memo, useMemo, type ReactElement, type ReactNode } from "react";
import rough from "roughjs";
import type {
  Arrowhead,
  Diagram,
  DiagramEdge,
  DiagramNode,
  FlowDirection,
  StrokePattern,
} from "@linework/shared";
import { getStyle, type DiagramStyle } from "../diagram/styles";
import { getIcon } from "../library/icons";
import { flowDirection, laneBands, type LaneBand } from "../flowchart/model";
import {
  edgePoints,
  pointsToPath,
  polylineMidpoint,
  seedFrom,
  shapePath,
  wrapText,
  type Point,
} from "./geometry";

const generator = rough.generator();

const LINE_HEIGHT = 1.3;
const TEXT_PADDING = 10;

function dashArray(pattern: StrokePattern, width: number): string | undefined {
  if (pattern === "dashed") return `${width * 4} ${width * 3}`;
  if (pattern === "dotted") return `${width} ${width * 2}`;
  return undefined;
}

export interface StrokeProps {
  readonly d: string;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly pattern: StrokePattern;
  readonly sketchy: boolean;
  readonly roughness: number;
  readonly seedKey: string;
}

/** Draws one outline either crisply or through roughjs, which returns plain SVG paths. */
export function StrokedPath({
  d,
  fill,
  stroke,
  strokeWidth,
  pattern,
  sketchy,
  roughness,
  seedKey,
}: StrokeProps): ReactElement {
  const dash = dashArray(pattern, strokeWidth);
  const roughPaths = useMemo(() => {
    if (!sketchy || !d) return null;
    const options = {
      seed: seedFrom(seedKey),
      roughness,
      stroke,
      strokeWidth,
      ...(fill === "transparent" ? {} : { fill }),
      fillStyle: "hachure",
      hachureGap: 6,
      fillWeight: Math.max(0.8, strokeWidth / 2),
    };
    return generator.toPaths(generator.path(d, options));
  }, [d, fill, stroke, strokeWidth, sketchy, roughness, seedKey]);

  if (roughPaths) {
    return (
      <g>
        {roughPaths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.fill ?? "none"}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            // Outline paths carry the shape's own stroke width; hachure fill lines don't.
            strokeDasharray={p.stroke === stroke && p.strokeWidth === strokeWidth ? dash : undefined}
            strokeLinecap="round"
          />
        ))}
      </g>
    );
  }
  return (
    <path
      d={d}
      fill={fill === "transparent" ? "none" : fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

interface LabelProps {
  readonly node: DiagramNode;
  readonly style: DiagramStyle;
}

function NodeLabel({ node, style }: LabelProps): ReactElement | null {
  if (!node.label) return null;
  const maxWidth = Math.max(10, node.width - TEXT_PADDING * 2);
  const lines = wrapText(node.label, maxWidth, node.fontSize);
  const lineHeight = node.fontSize * LINE_HEIGHT;
  const anchor = node.textAlign === "left" ? "start" : node.textAlign === "right" ? "end" : "middle";
  const x =
    node.textAlign === "left"
      ? node.x + TEXT_PADDING
      : node.textAlign === "right"
        ? node.x + node.width - TEXT_PADDING
        : node.x + node.width / 2;
  // Containers label their top edge; figures and icons label underneath; everything else centres.
  const firstY =
    node.kind === "container"
      ? node.y + TEXT_PADDING + lineHeight / 2
      : node.kind === "actor"
        ? node.y + node.height * 0.8 + lineHeight / 2
        : node.kind === "icon"
          ? node.y + iconSize(node) + 6 + lineHeight / 2
          : node.y + node.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  return (
    <text
      fill={node.textColor}
      fontSize={node.fontSize}
      fontFamily={style.fontFamily}
      fontWeight={node.kind === "container" ? 600 : 400}
      textAnchor={anchor}
      dominantBaseline="central"
      style={{ whiteSpace: "pre" }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={firstY + i * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Side of the square an icon node's glyph is drawn in, leaving room for a label below. */
function iconSize(node: DiagramNode): number {
  return Math.max(8, Math.min(node.width, node.height - (node.label ? node.fontSize * LINE_HEIGHT + 8 : 0)));
}

function IconGlyph({ node, style }: { node: DiagramNode; style: DiagramStyle }): ReactElement {
  const size = iconSize(node);
  const icon = getIcon(node.icon);
  const scale = size / 24;
  const x = node.x + (node.width - size) / 2;
  const paths = icon?.paths ?? ["M4 4h16v16H4z", "M4 4l16 16M20 4L4 20"];
  return (
    <g transform={`translate(${String(x)} ${String(node.y)}) scale(${String(scale)})`}>
      {node.fill !== "transparent" && <rect x={1} y={1} width={22} height={22} rx={5} fill={node.fill} />}
      {paths.map((d, i) => (
        <StrokedPath
          key={i}
          d={d}
          fill="transparent"
          stroke={node.stroke}
          strokeWidth={node.strokeWidth / scale}
          pattern="solid"
          sketchy={style.sketchy}
          roughness={style.roughness * 0.6}
          seedKey={`${node.id}${String(i)}`}
        />
      ))}
    </g>
  );
}

interface NodeViewProps {
  readonly node: DiagramNode;
  readonly style: DiagramStyle;
  readonly hideLabel: boolean;
}

const NodeView = memo(function NodeView({ node, style, hideLabel }: NodeViewProps): ReactElement {
  const d = shapePath(node.kind, node, style.cornerRadius);
  return (
    <g data-node-id={node.id}>
      {node.kind === "text" || node.kind === "icon" ? (
        <>
          {/* Invisible body so text and icon nodes are clickable anywhere in their box. */}
          <rect x={node.x} y={node.y} width={node.width} height={node.height} fill="transparent" />
          {node.kind === "icon" && <IconGlyph node={node} style={style} />}
        </>
      ) : (
        <StrokedPath
          d={d}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
          pattern={node.strokePattern}
          sketchy={style.sketchy}
          roughness={style.roughness}
          seedKey={node.id}
        />
      )}
      {node.fill === "transparent" && node.kind !== "text" && node.kind !== "icon" && (
        // Unfilled shapes should still be grabbable from their interior.
        <path d={d} fill="transparent" stroke="none" />
      )}
      {!hideLabel && <NodeLabel node={node} style={style} />}
    </g>
  );
});

function arrowheadPath(
  kind: Arrowhead,
  tip: Point,
  from: Point,
  size: number,
): { d: string; filled: boolean } | null {
  if (kind === "none") return null;
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const at = (dist: number, offset: number): Point => ({
    x: tip.x - Math.cos(angle) * dist - Math.sin(angle) * offset,
    y: tip.y - Math.sin(angle) * dist + Math.cos(angle) * offset,
  });
  const fmt = (p: Point): string => `${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`;
  switch (kind) {
    case "arrow": {
      const a = at(size, size * 0.55);
      const b = at(size, -size * 0.55);
      return { d: `M${fmt(a)}L${fmt(tip)}L${fmt(b)}`, filled: false };
    }
    case "triangle": {
      const a = at(size, size * 0.5);
      const b = at(size, -size * 0.5);
      return { d: `M${fmt(tip)}L${fmt(a)}L${fmt(b)}Z`, filled: true };
    }
    case "diamond": {
      const a = at(size * 0.6, size * 0.4);
      const b = at(size * 1.2, 0);
      const c = at(size * 0.6, -size * 0.4);
      return { d: `M${fmt(tip)}L${fmt(a)}L${fmt(b)}L${fmt(c)}Z`, filled: true };
    }
    case "circle": {
      const r = size * 0.35;
      const c = at(r, 0);
      return {
        d: `M${fmt({ x: c.x - r, y: c.y })}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`,
        filled: false,
      };
    }
  }
}

interface EdgeViewProps {
  readonly edge: DiagramEdge;
  readonly source: DiagramNode;
  readonly target: DiagramNode;
  readonly style: DiagramStyle;
  readonly labelBackground: string;
  /** Flowchart direction, for routing loops; undefined for other diagrams. */
  readonly flow: FlowDirection | undefined;
}

const EdgeView = memo(function EdgeView({
  edge,
  source,
  target,
  style,
  labelBackground,
  flow,
}: EdgeViewProps): ReactElement {
  const points = edgePoints(edge, source, target, flow);
  const d = pointsToPath(points);
  const size = 8 + edge.strokeWidth * 2;
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const first = points[0];
  const second = points[1];
  const heads: ReactNode[] = [];
  if (last && beforeLast) {
    const head = arrowheadPath(edge.arrowEnd, last, beforeLast, size);
    if (head) heads.push(<ArrowheadView key="end" head={head} edge={edge} />);
  }
  if (first && second) {
    const head = arrowheadPath(edge.arrowStart, first, second, size);
    if (head) heads.push(<ArrowheadView key="start" head={head} edge={edge} />);
  }
  const mid = polylineMidpoint(points);
  const labelLines = edge.label ? edge.label.split("\n") : [];
  const fontSize = 14;
  const labelWidth = Math.max(...labelLines.map((l) => l.length), 0) * fontSize * 0.56 + 12;
  const labelHeight = labelLines.length * fontSize * LINE_HEIGHT + 6;
  return (
    <g data-edge-id={edge.id}>
      {/* Wide transparent stroke makes thin edges easy to click. */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(12, edge.strokeWidth + 10)} />
      <StrokedPath
        d={d}
        fill="transparent"
        stroke={edge.stroke}
        strokeWidth={edge.strokeWidth}
        pattern={edge.strokePattern}
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={edge.id}
      />
      {heads}
      {labelLines.length > 0 && (
        <g>
          <rect
            x={mid.x - labelWidth / 2}
            y={mid.y - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            rx={4}
            fill={labelBackground}
          />
          <text
            fontSize={fontSize}
            fontFamily={style.fontFamily}
            fill={edge.stroke}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {labelLines.map((line, i) => (
              <tspan key={i} x={mid.x} y={mid.y + (i - (labelLines.length - 1) / 2) * fontSize * LINE_HEIGHT}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}
    </g>
  );
});

function ArrowheadView({
  head,
  edge,
}: {
  head: { d: string; filled: boolean };
  edge: DiagramEdge;
}): ReactElement {
  return (
    <path
      d={head.d}
      fill={head.filled ? edge.stroke : "none"}
      stroke={edge.stroke}
      strokeWidth={edge.strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

/** Nodes on visible layers, bottom layer first, keeping document order within a layer. */
export function visibleNodesInOrder(diagram: Diagram): DiagramNode[] {
  const rank = new Map(diagram.layers.map((l, i) => [l.id, l.visible ? i : -1]));
  return diagram.nodes
    .map((node, index) => ({ node, index, layer: rank.get(node.layerId) ?? 0 }))
    .filter((entry) => entry.layer >= 0)
    .sort((a, b) => a.layer - b.layer || a.index - b.index)
    .map((entry) => entry.node);
}

const tint = (color: string, alpha: string): string => `${color.slice(0, 7)}${alpha}`;

/** Flowchart swimlanes: a tinted band per lane with its name in a header strip. */
function LaneView({ band, vertical }: { band: LaneBand; vertical: boolean }): ReactElement {
  const { lane, header } = band;
  const cx = header.x + header.width / 2;
  const cy = header.y + header.height / 2;
  return (
    <g data-lane-id={lane.id}>
      <rect
        x={band.x}
        y={band.y}
        width={band.width}
        height={band.height}
        fill={tint(lane.color, band.index % 2 === 0 ? "0a" : "14")}
        stroke={tint(lane.color, "55")}
        strokeWidth={1}
      />
      <rect
        x={header.x}
        y={header.y}
        width={header.width}
        height={header.height}
        fill={tint(lane.color, "26")}
        stroke={tint(lane.color, "55")}
        strokeWidth={1}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
        fontWeight={700}
        fill={lane.color}
        transform={vertical ? undefined : `rotate(-90 ${String(cx)} ${String(cy)})`}
      >
        {lane.name || "Untitled lane"}
      </text>
    </g>
  );
}

export interface DiagramContentProps {
  readonly diagram: Diagram;
  /** Node whose label is hidden because it is being edited in place. */
  readonly editingNodeId?: string | null;
}

/** All diagram content as SVG elements, in diagram coordinates. Shared by the canvas and exporters. */
export function DiagramContent({ diagram, editingNodeId = null }: DiagramContentProps): ReactElement {
  const style = getStyle(diagram.styleId);
  const visibleNodes = useMemo(() => visibleNodesInOrder(diagram), [diagram]);
  const nodesById = useMemo(() => new Map(visibleNodes.map((n) => [n.id, n])), [visibleNodes]);
  const containers = visibleNodes.filter((n) => n.kind === "container");
  const others = visibleNodes.filter((n) => n.kind !== "container");
  const labelBackground = diagram.background === "transparent" ? "#ffffff" : diagram.background;
  const lanes = useMemo(() => laneBands(diagram), [diagram]);
  const vertical = diagram.flowchart?.direction !== "LR";
  const flow = flowDirection(diagram);
  return (
    <g fontFamily={style.fontFamily}>
      {lanes.map((band) => (
        <LaneView key={band.lane.id} band={band} vertical={vertical} />
      ))}
      {containers.map((node) => (
        <NodeView key={node.id} node={node} style={style} hideLabel={node.id === editingNodeId} />
      ))}
      {diagram.edges.map((edge) => {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);
        if (!source || !target) return null;
        return (
          <EdgeView
            key={edge.id}
            edge={edge}
            source={source}
            target={target}
            style={style}
            labelBackground={labelBackground}
            flow={flow}
          />
        );
      })}
      {others.map((node) => (
        <NodeView key={node.id} node={node} style={style} hideLabel={node.id === editingNodeId} />
      ))}
    </g>
  );
}
