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
import { kindModel } from "../kinds/registry";
import { getIcon } from "../library/icons";
import { flowDirection, laneBands, type LaneBand } from "../flowchart/model";
import {
  CLASS_FONT,
  CLASS_NAME_ROW,
  CLASS_PAD,
  CLASS_ROW,
  CLASS_STEREOTYPE_ROW,
  classSectionHeight,
  parseClass,
  parseTable,
  TABLE_FONT,
  TABLE_HEADER,
  TABLE_ROW,
} from "./compartments";
import {
  edgeMidpoint,
  edgePath,
  edgePoints,
  iconGlyphSize,
  personBodyTop,
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
  /** Background colour drawn around the text, so lines passing behind it don't hide it. */
  readonly halo?: string | undefined;
}

/** Readable text colour on a filled background. */
export function contrastText(background: string): string {
  const hex = background.slice(1, 7);
  if (hex.length !== 6) return "#1f2937";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? "#1f2937" : "#ffffff";
}

/** Shapes whose label sits underneath them rather than inside. */
const LABEL_BELOW = new Set(["actor", "initial", "final"]);

/**
 * A title with an optional subtitle and description underneath (from `meta`), centred in the
 * shape. Used by C4 elements and org chart cards.
 */
function CardLabel({ node, style }: { node: DiagramNode; style: DiagramStyle }): ReactElement {
  const box =
    node.kind === "person"
      ? { ...node, y: personBodyTop(node), height: node.y + node.height - personBodyTop(node) }
      : node;
  const maxWidth = Math.max(10, box.width - TEXT_PADDING * 2);
  const subtitle = node.meta?.subtitle ?? "";
  const description = node.meta?.description ?? "";
  const titleSize = node.fontSize;
  const smallSize = Math.max(8, Math.round(node.fontSize * 0.78));
  const rows: { text: string; size: number; weight: number; opacity: number }[] = [
    ...wrapText(node.label, maxWidth, titleSize).map((text) => ({
      text,
      size: titleSize,
      weight: 700,
      opacity: 1,
    })),
    ...(subtitle
      ? wrapText(subtitle, maxWidth, smallSize).map((text) => ({
          text,
          size: smallSize,
          weight: 400,
          opacity: 0.85,
        }))
      : []),
    ...(description
      ? wrapText(description, maxWidth, smallSize).map((text) => ({
          text,
          size: smallSize,
          weight: 400,
          opacity: 1,
        }))
      : []),
  ];
  const heights = rows.map((r) => r.size * LINE_HEIGHT);
  const gapAfterSubtitle = description ? 6 : 0;
  const total = heights.reduce((a, b) => a + b, 0) + gapAfterSubtitle;
  // Long descriptions stop at the bottom edge of the shape.
  let y = box.y + Math.max(TEXT_PADDING / 2, (box.height - total) / 2);
  const titleRows = wrapText(node.label, maxWidth, titleSize).length;
  const subtitleRows = subtitle ? wrapText(subtitle, maxWidth, smallSize).length : 0;
  const x = box.x + box.width / 2;
  return (
    <text
      fill={node.textColor}
      fontFamily={style.fontFamily}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ whiteSpace: "pre" }}
    >
      {rows.map((row, i) => {
        if (i === titleRows + subtitleRows) y += gapAfterSubtitle;
        const h = heights[i] ?? 0;
        const cy = y + h / 2;
        y += h;
        if (cy > box.y + box.height - 4) return null;
        return (
          <tspan key={i} x={x} y={cy} fontSize={row.size} fontWeight={row.weight} opacity={row.opacity}>
            {row.text}
          </tspan>
        );
      })}
    </text>
  );
}

function NodeLabel({ node, style, halo }: LabelProps): ReactElement | null {
  if (!node.label) return null;
  if (node.meta?.subtitle || node.meta?.description || node.kind === "person") {
    return <CardLabel node={node} style={style} />;
  }
  // Labels underneath small shapes, like state machine start and end dots, can be wider.
  const maxWidth = LABEL_BELOW.has(node.kind)
    ? Math.max(160, node.width)
    : Math.max(10, node.width - TEXT_PADDING * 2);
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
        : node.kind === "initial" || node.kind === "final"
          ? node.y + node.height + 4 + lineHeight / 2
          : node.kind === "icon"
            ? node.y + iconSize(node) + 6 + lineHeight / 2
            : node.y + node.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  const text = (
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
  if (!halo) return text;
  // A backing plate under labels drawn outside the shape keeps lines behind them readable.
  const width = Math.max(...lines.map((l) => l.length)) * node.fontSize * 0.58 + 8;
  const left = anchor === "start" ? x - 4 : anchor === "end" ? x - width + 4 : x - width / 2;
  return (
    <g>
      <rect
        x={left}
        y={firstY - lineHeight / 2 - 1}
        width={width}
        height={lines.length * lineHeight + 2}
        rx={3}
        fill={halo}
        opacity={0.9}
      />
      {text}
    </g>
  );
}

const iconSize = iconGlyphSize;

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
  /** Background colour, used as a halo behind labels drawn outside the shape. */
  readonly halo: string;
}

const tint = (color: string, alpha: string): string => `${color.slice(0, 7)}${alpha}`;

function TableView({ node, style }: { node: DiagramNode; style: DiagramStyle }): ReactElement {
  const table = parseTable(node.label);
  const { x, y, width: w } = node;
  const headerText = contrastText(node.stroke);
  return (
    <g>
      <StrokedPath
        d={shapePath("rectangle", node, 0)}
        fill={node.fill}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        pattern={node.strokePattern}
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={node.id}
      />
      <StrokedPath
        d={shapePath("rectangle", { x, y, width: w, height: TABLE_HEADER }, 0)}
        fill={node.stroke}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        pattern="solid"
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={`${node.id}h`}
      />
      <text
        x={x + w / 2}
        y={y + TABLE_HEADER / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={TABLE_FONT + 1}
        fontWeight={700}
        fill={headerText}
      >
        {table.name}
      </text>
      {table.columns.length === 0 && (
        <text
          x={x + 12}
          y={y + TABLE_HEADER + TABLE_ROW / 2}
          dominantBaseline="central"
          fontSize={TABLE_FONT}
          fontStyle="italic"
          fill="#6b7280"
        >
          No columns
        </text>
      )}
      {table.columns.map((c, i) => {
        const top = y + TABLE_HEADER + i * TABLE_ROW;
        const cy = top + TABLE_ROW / 2;
        const key = c.flags.includes("PK")
          ? "PK"
          : c.flags.includes("FK")
            ? "FK"
            : c.flags.includes("UQ")
              ? "UQ"
              : "";
        return (
          <g key={i}>
            {i > 0 && <line x1={x + 1} x2={x + w - 1} y1={top} y2={top} stroke={tint(node.stroke, "26")} />}
            {key && (
              <text
                x={x + 10}
                y={cy}
                dominantBaseline="central"
                fontSize={10}
                fontWeight={700}
                fill={key === "PK" ? "#b45309" : key === "FK" ? "#1a56db" : "#6d28d9"}
              >
                {key}
              </text>
            )}
            <text
              x={x + 34}
              y={cy}
              dominantBaseline="central"
              fontSize={TABLE_FONT}
              fontWeight={c.flags.includes("PK") ? 700 : 400}
              fill={node.textColor}
            >
              {c.name}
            </text>
            <text
              x={x + w - 10}
              y={cy}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={TABLE_FONT - 1}
              fill="#6b7280"
            >
              {c.type}
              {c.flags.includes("NN") && !c.flags.includes("PK") ? " *" : ""}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ClassView({ node, style }: { node: DiagramNode; style: DiagramStyle }): ReactElement {
  const c = parseClass(node.label);
  const { x, y, width: w } = node;
  let cursor = y;
  const stereoY = cursor + CLASS_STEREOTYPE_ROW / 2 + 4;
  if (c.stereotype) cursor += CLASS_STEREOTYPE_ROW;
  const nameY = cursor + CLASS_NAME_ROW / 2;
  cursor += CLASS_NAME_ROW;
  const headerBottom = cursor;
  const attrTop = cursor;
  cursor += classSectionHeight(c.attributes.length);
  const opTop = cursor;
  const italic = c.stereotype === "abstract" || c.stereotype === "interface";
  const member = (text: string, top: number, i: number): ReactElement => (
    <text
      key={i}
      x={x + 10}
      y={top + CLASS_PAD + CLASS_ROW * (i + 0.5)}
      dominantBaseline="central"
      fontSize={CLASS_FONT}
      fill={node.textColor}
      textDecoration={/\$$|\{static\}/.test(text) ? "underline" : undefined}
    >
      {text}
    </text>
  );
  return (
    <g>
      <StrokedPath
        d={shapePath("rectangle", node, 0)}
        fill={node.fill}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        pattern={node.strokePattern}
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={node.id}
      />
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, w - 2)}
        height={headerBottom - y - 1}
        fill={tint(node.stroke, "14")}
      />
      {c.stereotype && (
        <text
          x={x + w / 2}
          y={stereoY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fill={node.textColor}
        >
          {`«${c.stereotype}»`}
        </text>
      )}
      <text
        x={x + w / 2}
        y={nameY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={CLASS_FONT + 2}
        fontWeight={700}
        fontStyle={italic ? "italic" : undefined}
        fill={node.textColor}
      >
        {c.name}
      </text>
      <line
        x1={x}
        x2={x + w}
        y1={headerBottom}
        y2={headerBottom}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth * 0.75}
      />
      {c.attributes.map((a, i) => member(a, attrTop, i))}
      <line
        x1={x}
        x2={x + w}
        y1={opTop}
        y2={opTop}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth * 0.75}
      />
      {c.operations.map((o, i) => member(o, opTop, i))}
    </g>
  );
}

const NodeView = memo(function NodeView({ node, style, hideLabel, halo }: NodeViewProps): ReactElement {
  if (node.kind === "table" || node.kind === "class") {
    // Compartment shapes draw their own text; it's edited through the inspector or in place.
    return (
      <g data-node-id={node.id}>
        {node.kind === "table" ? (
          <TableView node={node} style={style} />
        ) : (
          <ClassView node={node} style={style} />
        )}
      </g>
    );
  }
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
      {node.kind === "final" && (
        <ellipse
          cx={node.x + node.width / 2}
          cy={node.y + node.height / 2}
          rx={node.width * 0.3}
          ry={node.height * 0.3}
          fill={node.stroke}
        />
      )}
      {node.fill === "transparent" && node.kind !== "text" && node.kind !== "icon" && (
        // Unfilled shapes should still be grabbable from their interior.
        <path d={d} fill="transparent" stroke="none" />
      )}
      {!hideLabel && (
        <NodeLabel
          node={node}
          style={style}
          halo={node.kind === "icon" || LABEL_BELOW.has(node.kind) ? halo : undefined}
        />
      )}
    </g>
  );
});

interface HeadPart {
  readonly d: string;
  /** "stroke" fills with the line colour, "background" hides the line behind a hollow shape. */
  readonly fill: "stroke" | "none" | "background";
}

/** Arrowhead and crow's foot outlines at `tip`, for a line arriving from `from`. */
export function arrowheadParts(kind: Arrowhead, tip: Point, from: Point, size: number): HeadPart[] {
  if (kind === "none") return [];
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const at = (dist: number, offset: number): Point => ({
    x: tip.x - Math.cos(angle) * dist - Math.sin(angle) * offset,
    y: tip.y - Math.sin(angle) * dist + Math.cos(angle) * offset,
  });
  const fmt = (p: Point): string => `${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`;
  const bar = (dist: number): HeadPart => {
    const half = size * 0.55;
    return { d: `M${fmt(at(dist, half))}L${fmt(at(dist, -half))}`, fill: "none" };
  };
  const ring = (dist: number): HeadPart => {
    const r = size * 0.32;
    const c = at(dist, 0);
    return {
      d: `M${fmt({ x: c.x - r, y: c.y })}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`,
      fill: "background",
    };
  };
  // Crow's foot: three toes spreading from a point on the line out to the shape's edge.
  const crow = (): HeadPart => {
    const heel = at(size, 0);
    return {
      d: `M${fmt(heel)}L${fmt(at(0, size * 0.6))}M${fmt(heel)}L${fmt(tip)}M${fmt(heel)}L${fmt(at(0, -size * 0.6))}`,
      fill: "none",
    };
  };
  switch (kind) {
    case "arrow":
      return [
        { d: `M${fmt(at(size, size * 0.55))}L${fmt(tip)}L${fmt(at(size, -size * 0.55))}`, fill: "none" },
      ];
    case "triangle":
    case "triangle-open":
      return [
        {
          d: `M${fmt(tip)}L${fmt(at(size * 1.15, size * 0.6))}L${fmt(at(size * 1.15, -size * 0.6))}Z`,
          fill: kind === "triangle" ? "stroke" : "background",
        },
      ];
    case "diamond":
    case "diamond-open":
      return [
        {
          d: `M${fmt(tip)}L${fmt(at(size * 0.7, size * 0.45))}L${fmt(at(size * 1.4, 0))}L${fmt(at(size * 0.7, -size * 0.45))}Z`,
          fill: kind === "diamond" ? "stroke" : "background",
        },
      ];
    case "circle": {
      const r = size * 0.35;
      const c = at(r, 0);
      return [
        {
          d: `M${fmt({ x: c.x - r, y: c.y })}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`,
          fill: "none",
        },
      ];
    }
    case "one":
      return [bar(size * 0.55), bar(size * 0.95)];
    case "zero-or-one":
      return [bar(size * 0.55), ring(size * 1.25)];
    case "one-or-many":
      return [crow(), bar(size * 1.3)];
    case "zero-or-many":
      return [crow(), ring(size * 1.5)];
    case "many":
      return [crow()];
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
  readonly axis: "TB" | "LR" | undefined;
  /** Lines go under shapes; labels are drawn again on top so shapes never hide them. */
  readonly layer: "line" | "label";
}

/** Text beside one end of a connector, such as a multiplicity, offset to one side of the line. */
function EndLabel({
  text,
  tip,
  from,
  color,
  background,
  head,
}: {
  text: string;
  tip: Point;
  from: Point;
  color: string;
  background: string;
  /** The arrowhead at this end; labels move out past big ones. */
  head: Arrowhead;
}): ReactElement {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (from.x - tip.x) / len;
  const uy = (from.y - tip.y) / len;
  // Along the line away from the shape, then to its left (or above, for horizontal lines).
  let nx = uy;
  let ny = -ux;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const along = head === "none" || head === "arrow" ? 22 : 36;
  const x = tip.x + ux * along + nx * 12;
  const y = tip.y + uy * along + ny * 12;
  const width = text.length * 12 * 0.56 + 6;
  return (
    <g>
      <rect x={x - width / 2} y={y - 9} width={width} height={18} rx={3} fill={background} opacity={0.85} />
      <text x={x} y={y} fontSize={12} textAnchor="middle" dominantBaseline="central" fill={color}>
        {text}
      </text>
    </g>
  );
}

const EdgeView = memo(function EdgeView({
  edge,
  source,
  target,
  style,
  labelBackground,
  flow,
  axis,
  layer,
}: EdgeViewProps): ReactElement {
  const points = edgePoints(edge, source, target, flow, axis);
  const d = edgePath(edge.routing, points);
  const size = 8 + edge.strokeWidth * 2;
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const first = points[0];
  const second = points[1];
  const heads: ReactNode[] = [];
  if (last && beforeLast) {
    arrowheadParts(edge.arrowEnd, last, beforeLast, size).forEach((part, i) => {
      heads.push(
        <ArrowheadView key={`e${String(i)}`} part={part} edge={edge} background={labelBackground} />,
      );
    });
  }
  if (first && second) {
    arrowheadParts(edge.arrowStart, first, second, size).forEach((part, i) => {
      heads.push(
        <ArrowheadView key={`s${String(i)}`} part={part} edge={edge} background={labelBackground} />,
      );
    });
  }
  const mid = edgeMidpoint(edge.routing, points);
  const detail = edge.meta?.detail;
  const labelLines = [...(edge.label ? edge.label.split("\n") : []), ...(detail ? [`[${detail}]`] : [])];
  const detailIndex = detail ? labelLines.length - 1 : -1;
  const fontSize = 14;
  const labelWidth = Math.max(...labelLines.map((l) => l.length), 0) * fontSize * 0.56 + 12;
  const labelHeight = labelLines.length * fontSize * LINE_HEIGHT + 6;
  if (layer === "line") {
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
      </g>
    );
  }
  if (labelLines.length === 0 && !edge.startLabel && !edge.endLabel) return <g />;
  return (
    <g data-edge-id={edge.id}>
      {edge.startLabel && first && second && (
        <EndLabel
          text={edge.startLabel}
          tip={first}
          from={second}
          color={edge.stroke}
          background={labelBackground}
          head={edge.arrowStart}
        />
      )}
      {edge.endLabel && last && beforeLast && (
        <EndLabel
          text={edge.endLabel}
          tip={last}
          from={beforeLast}
          color={edge.stroke}
          background={labelBackground}
          head={edge.arrowEnd}
        />
      )}
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
              <tspan
                key={i}
                x={mid.x}
                y={mid.y + (i - (labelLines.length - 1) / 2) * fontSize * LINE_HEIGHT}
                {...(i === detailIndex ? { fontSize: 12, fontStyle: "italic", opacity: 0.85 } : {})}
              >
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
  part,
  edge,
  background,
}: {
  part: HeadPart;
  edge: DiagramEdge;
  background: string;
}): ReactElement {
  return (
    <path
      d={part.d}
      fill={part.fill === "stroke" ? edge.stroke : part.fill === "background" ? background : "none"}
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
  const flow = flowDirection(diagram) ?? kindModel(diagram.chartType)?.loopFlow?.(diagram);
  const axis = kindModel(diagram.chartType)?.elbowAxis?.(diagram);
  return (
    <g fontFamily={style.fontFamily}>
      {lanes.map((band) => (
        <LaneView key={band.lane.id} band={band} vertical={vertical} />
      ))}
      {containers.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          style={style}
          hideLabel={node.id === editingNodeId}
          halo={labelBackground}
        />
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
            axis={axis}
            layer="line"
          />
        );
      })}
      {others.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          style={style}
          hideLabel={node.id === editingNodeId}
          halo={labelBackground}
        />
      ))}
      {diagram.edges.map((edge) => {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);
        if (!source || !target) return null;
        return (
          <EdgeView
            key={`${edge.id}-label`}
            edge={edge}
            source={source}
            target={target}
            style={style}
            labelBackground={labelBackground}
            flow={flow}
            axis={axis}
            layer="label"
          />
        );
      })}
    </g>
  );
}
