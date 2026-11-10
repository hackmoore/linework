import type { ReactElement } from "react";
import { getStyle } from "../diagram/styles";
import { StrokedPath } from "../render/DiagramSvg";
import { shapePath } from "../render/geometry";
import {
  CARD_PAD,
  COLUMN_WIDTH,
  HEADER_HEIGHT,
  PAD,
  TITLE_LINE,
  TITLE_SIZE,
  type CardBox,
  type KanbanLayout,
} from "./layout";
import { PRIORITY_COLORS } from "./model";

const TEXT = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#d1d5db";
const DANGER = "#dc2626";

const tint = (color: string, alpha: string): string => `${color.slice(0, 7)}${alpha}`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

function shortDate(iso: string): string {
  const [y = 2000, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Card({
  box,
  sketchy,
  roughness,
}: {
  box: CardBox;
  sketchy: boolean;
  roughness: number;
}): ReactElement {
  const { card } = box;
  const metaY = box.y + CARD_PAD + box.lines.length * TITLE_LINE + 4;
  let mx = box.x + CARD_PAD;
  const meta: ReactElement[] = [];
  if (card.priority !== "none") {
    meta.push(
      <circle key="p" cx={mx + 4} cy={metaY + 9} r={4} fill={PRIORITY_COLORS[card.priority]}>
        <title>{`${card.priority} priority`}</title>
      </circle>,
    );
    mx += 14;
  }
  if (card.due) {
    const label = shortDate(card.due);
    const w = label.length * 6.4 + 12;
    meta.push(
      <g key="d">
        <rect
          x={mx}
          y={metaY}
          width={w}
          height={18}
          rx={4}
          fill={box.overdue ? tint(DANGER, "18") : "#f3f4f6"}
        />
        <text
          x={mx + 6}
          y={metaY + 9}
          dominantBaseline="central"
          fontSize={11}
          fill={box.overdue ? DANGER : MUTED}
        >
          {label}
        </text>
      </g>,
    );
    mx += w + 6;
  }
  const ownerSpace = card.owner ? 26 : 0;
  for (const tag of card.tags) {
    const w = tag.length * 6.2 + 12;
    if (mx + w > box.x + box.width - CARD_PAD - ownerSpace) break;
    meta.push(
      <g key={`t-${tag}`}>
        <rect x={mx} y={metaY} width={w} height={18} rx={9} fill="#eef2ff" />
        <text x={mx + 6} y={metaY + 9} dominantBaseline="central" fontSize={11} fill="#3730a3">
          {tag}
        </text>
      </g>,
    );
    mx += w + 4;
  }
  if (card.owner) {
    const cx = box.x + box.width - CARD_PAD - 10;
    meta.push(
      <g key="o">
        <circle cx={cx} cy={metaY + 9} r={10} fill="#e5e7eb" />
        <text
          x={cx}
          y={metaY + 9}
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={9}
          fontWeight={600}
          fill={TEXT}
        >
          {initials(card.owner)}
        </text>
        <title>{card.owner}</title>
      </g>,
    );
  }
  return (
    <g>
      <StrokedPath
        d={shapePath("rounded", box, 8)}
        fill="#ffffff"
        stroke={box.overdue ? DANGER : BORDER}
        strokeWidth={1}
        pattern="solid"
        sketchy={sketchy}
        roughness={roughness}
        seedKey={card.id}
      />
      {card.color && (
        <rect x={box.x + 1} y={box.y + 6} width={4} height={box.height - 12} rx={2} fill={card.color} />
      )}
      <text fontSize={TITLE_SIZE} fill={TEXT} fontWeight={500}>
        {box.lines.map((line, i) => (
          <tspan
            key={i}
            x={box.x + CARD_PAD}
            y={box.y + CARD_PAD + TITLE_LINE * i + TITLE_LINE / 2}
            dominantBaseline="central"
          >
            {line}
          </tspan>
        ))}
      </text>
      {box.hasMeta && meta}
    </g>
  );
}

/** The whole board as SVG, sized layout.width by layout.height. */
export function KanbanChartContent({
  layout,
  styleId,
}: {
  layout: KanbanLayout;
  styleId: string;
}): ReactElement {
  const style = getStyle(styleId);
  const bodyTop = PAD + HEADER_HEIGHT + 8;
  return (
    <g fontFamily={style.fontFamily}>
      <rect width={layout.width} height={layout.height} fill="#ffffff" />
      {layout.columns.map((col) => (
        <g key={col.column.id}>
          <rect
            x={col.x - 6}
            y={PAD}
            width={COLUMN_WIDTH + 12}
            height={layout.height - PAD * 2}
            rx={10}
            fill={col.overLimit ? tint(DANGER, "0f") : "#f3f4f6"}
          />
          <rect x={col.x - 6} y={PAD} width={COLUMN_WIDTH + 12} height={4} rx={2} fill={col.column.color} />
          <text
            x={col.x + 4}
            y={PAD + HEADER_HEIGHT / 2 + 2}
            dominantBaseline="central"
            fontSize={14}
            fontWeight={700}
            fill={TEXT}
          >
            {col.column.done ? `✓ ${col.column.name}` : col.column.name}
          </text>
          <text
            x={col.x + COLUMN_WIDTH - 4}
            y={PAD + HEADER_HEIGHT / 2 + 2}
            dominantBaseline="central"
            textAnchor="end"
            fontSize={12}
            fontWeight={600}
            fill={col.overLimit ? DANGER : MUTED}
          >
            {col.column.wipLimit === null
              ? String(col.count)
              : `${String(col.count)} / ${String(col.column.wipLimit)}`}
          </text>
        </g>
      ))}
      {layout.lanes.map((lane, i) =>
        lane.headerHeight > 0 ? (
          <g key={lane.lane?.id ?? "none"}>
            {i > 0 && (
              <line
                x1={PAD}
                x2={layout.width - PAD}
                y1={lane.y - 4}
                y2={lane.y - 4}
                stroke={BORDER}
                strokeDasharray="4 4"
              />
            )}
            <text
              x={PAD + 4}
              y={lane.y + lane.headerHeight / 2}
              dominantBaseline="central"
              fontSize={13}
              fontWeight={700}
              fill={MUTED}
            >
              {`${lane.lane?.collapsed ? "▸" : "▾"} ${lane.lane?.name ?? "No lane"} · ${String(lane.cardCount)}`}
            </text>
          </g>
        ) : null,
      )}
      {layout.cards.map((box) => (
        <Card key={box.card.id} box={box} sketchy={style.sketchy} roughness={style.roughness} />
      ))}
      {layout.cards.length === 0 && layout.columns.length > 0 && (
        <text x={PAD + 4} y={bodyTop + 28} fontSize={12} fill={MUTED}>
          No cards yet
        </text>
      )}
    </g>
  );
}
