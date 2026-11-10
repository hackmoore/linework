import type { ReactElement } from "react";
import type { SequenceParticipant } from "@linework/shared";
import { getStyle, type DiagramStyle } from "../diagram/styles";
import { StrokedPath } from "../render/DiagramSvg";
import { shapePath } from "../render/geometry";
import {
  ACTIVATION_WIDTH,
  FONT_SIZE,
  HEAD_HEIGHT,
  isIconKind,
  LINE_HEIGHT,
  textWidth,
  type FragmentBox,
  type MessageBox,
  type NoteBox,
  type ParticipantBox,
  type SequenceLayout,
} from "./layout";

const TEXT = "#1f2937";
const MUTED = "#6b7280";
const LIFELINE = "#9ca3af";
const FRAME = "#6b7280";
const SELECTED = "#4f46e5";
const NOTE_FILL = "#fef9c3";
const NOTE_STROKE = "#ca8a04";

const tint = (color: string, alpha: string): string => `${color.slice(0, 7)}${alpha}`;
const n = (v: number): string => String(Math.round(v * 10) / 10);

/** The small picture above an actor, boundary, control or entity's name. */
function HeadIcon({
  kind,
  cx,
  top,
  color,
}: {
  kind: SequenceParticipant["kind"];
  cx: number;
  top: number;
  color: string;
}): ReactElement {
  const props = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const };
  if (kind === "actor")
    return (
      <g {...props}>
        <circle cx={cx} cy={top + 6} r={5.5} fill={tint(color, "26")} />
        <path
          d={`M${n(cx)} ${n(top + 11.5)}V${n(top + 22)}M${n(cx - 9)} ${n(top + 15)}H${n(cx + 9)}M${n(cx)} ${n(top + 22)}L${n(cx - 7)} ${n(top + 31)}M${n(cx)} ${n(top + 22)}L${n(cx + 7)} ${n(top + 31)}`}
        />
      </g>
    );
  const cy = top + 16;
  if (kind === "boundary")
    return (
      <g {...props}>
        <path d={`M${n(cx - 16)} ${n(cy - 10)}V${n(cy + 10)}M${n(cx - 16)} ${n(cy)}H${n(cx - 9)}`} />
        <circle cx={cx + 2} cy={cy} r={11} fill={tint(color, "26")} />
      </g>
    );
  if (kind === "control")
    return (
      <g {...props}>
        <circle cx={cx} cy={cy + 1} r={11} fill={tint(color, "26")} />
        <path d={`M${n(cx + 1)} ${n(cy - 14)}L${n(cx - 4)} ${n(cy - 10)}L${n(cx + 1)} ${n(cy - 6)}`} />
      </g>
    );
  return (
    <g {...props}>
      <circle cx={cx} cy={cy - 1} r={11} fill={tint(color, "26")} />
      <path d={`M${n(cx - 12)} ${n(cy + 12)}H${n(cx + 12)}`} />
    </g>
  );
}

function queuePath(x: number, y: number, w: number, h: number): string {
  const rx = Math.min(10, w * 0.1);
  const ry = h / 2;
  return (
    `M${n(x + rx)} ${n(y)}H${n(x + w - rx)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w - rx)} ${n(y + h)}` +
    `H${n(x + rx)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + rx)} ${n(y)}Z` +
    `M${n(x + w - rx)} ${n(y)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + w - rx)} ${n(y + h)}`
  );
}

function Head({
  box,
  y,
  style,
  selected,
  interactive,
}: {
  box: ParticipantBox;
  y: number;
  style: DiagramStyle;
  selected: boolean;
  interactive: boolean;
}): ReactElement {
  const { participant: p, x, width } = box;
  const name = p.name || "Untitled";
  const left = x - width / 2;
  const icon = isIconKind(p.kind);
  const bodyY = y + 4;
  const bodyH = HEAD_HEIGHT - 8;
  const d =
    p.kind === "database"
      ? shapePath("cylinder", { x: left, y: bodyY - 2, width, height: bodyH + 4 }, 0)
      : p.kind === "queue"
        ? queuePath(left, bodyY, width, bodyH)
        : shapePath("rounded", { x: left, y: bodyY, width, height: bodyH }, style.cornerRadius);
  return (
    <g data-participant-id={p.id} className={interactive ? "sequence__head" : undefined}>
      {selected && (
        <rect
          x={left - 4}
          y={y}
          width={width + 8}
          height={HEAD_HEIGHT}
          rx={8}
          fill="none"
          stroke={SELECTED}
          strokeWidth={2}
        />
      )}
      {icon ? (
        <>
          <HeadIcon kind={p.kind} cx={x} top={y + 2} color={p.color} />
          <text
            x={x}
            y={y + HEAD_HEIGHT - 8}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={FONT_SIZE}
            fontWeight={600}
            fill={TEXT}
          >
            {name}
          </text>
        </>
      ) : (
        <>
          <StrokedPath
            d={d}
            fill={tint(p.color, "1f")}
            stroke={p.color}
            strokeWidth={1.8}
            pattern="solid"
            sketchy={style.sketchy}
            roughness={style.roughness}
            seedKey={`${p.id}${String(y)}`}
          />
          <text
            x={x}
            y={bodyY + bodyH / 2 + (p.kind === "database" ? 3 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={FONT_SIZE}
            fontWeight={600}
            fill={TEXT}
          >
            {name}
          </text>
        </>
      )}
      {interactive && <rect x={left} y={y} width={width} height={HEAD_HEIGHT} fill="transparent" />}
      <title>{`${name} (${p.kind})`}</title>
    </g>
  );
}

function Arrowhead({
  x,
  y,
  dir,
  filled,
  color,
}: {
  x: number;
  y: number;
  dir: 1 | -1;
  filled: boolean;
  color: string;
}): ReactElement {
  const back = x - dir * 10;
  const d = `M${n(back)} ${n(y - 5)}L${n(x)} ${n(y)}L${n(back)} ${n(y + 5)}`;
  return filled ? (
    <path d={`${d}Z`} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
  ) : (
    <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  );
}

function Message({
  box,
  selected,
  interactive,
}: {
  box: MessageBox;
  selected: boolean;
  interactive: boolean;
}): ReactElement {
  const { step, x1, x2, y, self, returnX, returnY } = box;
  const color = selected ? SELECTED : TEXT;
  const dash = step.arrow === "reply" ? "6 4" : undefined;
  const d = self ? `M${n(x1)} ${n(y)}H${n(returnX)}V${n(returnY)}H${n(x2)}` : `M${n(x1)} ${n(y)}H${n(x2)}`;
  const dir: 1 | -1 = self ? -1 : x2 >= x1 ? 1 : -1;
  const endY = self ? returnY : y;
  const textX = self ? x1 + (box.number === null ? 6 : 14) : box.labelX;
  const anchor = self ? "start" : "middle";
  const labelWidth = Math.max(0, ...box.lines.map((l) => textWidth(l)));
  return (
    <g data-step-id={step.id} className={interactive ? "sequence__message" : undefined}>
      <path d={d} fill="none" stroke={color} strokeWidth={selected ? 2 : 1.5} strokeDasharray={dash} />
      <Arrowhead x={x2} y={endY} dir={dir} filled={step.arrow === "sync"} color={color} />
      {box.lines.map((line, i) => (
        <text
          key={i}
          x={textX}
          y={box.labelY + i * LINE_HEIGHT + LINE_HEIGHT / 2}
          textAnchor={anchor}
          dominantBaseline="central"
          fontSize={FONT_SIZE}
          fill={color}
          stroke="#ffffff"
          strokeWidth={4}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {line}
        </text>
      ))}
      {box.number !== null && (
        <g>
          <circle cx={x1} cy={y} r={9} fill={TEXT} />
          <text
            x={x1}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={box.number > 99 ? 8 : 10}
            fontWeight={700}
            fill="#ffffff"
          >
            {box.number}
          </text>
        </g>
      )}
      {interactive && (
        <>
          <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
          {box.lines.length > 0 && (
            <rect
              x={self ? textX - 4 : textX - labelWidth / 2 - 4}
              y={box.labelY - 2}
              width={labelWidth + 8}
              height={box.lines.length * LINE_HEIGHT + 4}
              fill="transparent"
            />
          )}
        </>
      )}
    </g>
  );
}

function Note({
  box,
  style,
  selected,
}: {
  box: NoteBox;
  style: DiagramStyle;
  selected: boolean;
}): ReactElement {
  const { step, x, y, width, height } = box;
  return (
    <g data-step-id={step.id}>
      {selected && (
        <rect
          x={x - 4}
          y={y - 4}
          width={width + 8}
          height={height + 8}
          rx={4}
          fill="none"
          stroke={SELECTED}
          strokeWidth={2}
        />
      )}
      <StrokedPath
        d={shapePath("note", { x, y, width, height }, 0)}
        fill={NOTE_FILL}
        stroke={NOTE_STROKE}
        strokeWidth={1.2}
        pattern="solid"
        sketchy={style.sketchy}
        roughness={style.roughness}
        seedKey={step.id}
      />
      {(box.lines.length > 0 ? box.lines : [""]).map((line, i) => (
        <text
          key={i}
          x={x + 10}
          y={y + 6 + i * LINE_HEIGHT + LINE_HEIGHT / 2}
          dominantBaseline="central"
          fontSize={12.5}
          fill={TEXT}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function Fragment({
  box,
  style,
  selectedIds,
}: {
  box: FragmentBox;
  style: DiagramStyle;
  selectedIds: ReadonlySet<string> | undefined;
}): ReactElement {
  const { span, x1, x2, y1, y2 } = box;
  const { fragment } = span;
  const selected = selectedIds?.has(fragment.id) ?? false;
  const color = selected ? SELECTED : FRAME;
  const tabWidth = textWidth(fragment.kind, 12) + 18;
  const tabHeight = 20;
  const group = fragment.kind === "group";
  return (
    <g data-step-id={fragment.id}>
      <g pointerEvents="none">
        <StrokedPath
          d={`M${n(x1)} ${n(y1)}H${n(x2)}V${n(y2)}H${n(x1)}Z`}
          fill={group ? "#6b72800d" : "transparent"}
          stroke={color}
          strokeWidth={selected ? 2 : 1.2}
          pattern="solid"
          sketchy={style.sketchy}
          roughness={style.roughness}
          seedKey={fragment.id}
        />
      </g>
      {!group && (
        <>
          <path
            d={`M${n(x1)} ${n(y1)}H${n(x1 + tabWidth)}V${n(y1 + tabHeight - 6)}L${n(x1 + tabWidth - 6)} ${n(y1 + tabHeight)}H${n(x1)}Z`}
            fill="#f3f4f6"
            stroke={color}
            strokeWidth={selected ? 2 : 1.2}
          />
          <text
            x={x1 + 7}
            y={y1 + tabHeight / 2}
            dominantBaseline="central"
            fontSize={12}
            fontWeight={700}
            fill={TEXT}
          >
            {fragment.kind}
          </text>
        </>
      )}
      {fragment.label && (
        <text
          x={group ? x1 + 8 : x1 + tabWidth + 8}
          y={y1 + tabHeight / 2}
          dominantBaseline="central"
          fontSize={12}
          fontWeight={group ? 700 : 400}
          fill={group ? TEXT : MUTED}
        >
          {group ? fragment.label : `[${fragment.label}]`}
        </text>
      )}
      {box.separators.map((s) => (
        <g key={s.index} data-step-id={s.id}>
          <line
            x1={x1}
            x2={x2}
            y1={s.y}
            y2={s.y}
            stroke={selectedIds?.has(s.id) ? SELECTED : color}
            strokeWidth={selectedIds?.has(s.id) ? 2 : 1.2}
            strokeDasharray="6 4"
          />
          <rect x={x1} y={s.y - 4} width={Math.min(x2 - x1, 160)} height={26} fill="transparent" />
          {s.label && (
            <text
              x={x1 + 8}
              y={s.y + 12}
              dominantBaseline="central"
              fontSize={12}
              fill={MUTED}
              stroke="#ffffff"
              strokeWidth={4}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {`[${s.label}]`}
            </text>
          )}
        </g>
      ))}
      <rect x={x1} y={y1} width={tabWidth + 8} height={tabHeight} fill="transparent" />
    </g>
  );
}

export interface SequenceContentProps {
  readonly layout: SequenceLayout;
  readonly styleId: string;
  readonly selectedIds?: ReadonlySet<string>;
  readonly interactive?: boolean;
}

/** The whole diagram. Used by the editor (interactive) and for export. */
export function SequenceContent({
  layout,
  styleId,
  selectedIds,
  interactive = false,
}: SequenceContentProps): ReactElement {
  const style = getStyle(styleId);
  const isSelected = (id: string): boolean => selectedIds?.has(id) ?? false;
  return (
    <g fontFamily={style.fontFamily}>
      {layout.participants.map((p) => (
        <g key={`life${p.participant.id}`}>
          <line
            x1={p.x}
            x2={p.x}
            y1={p.lifeTop}
            y2={p.lifeBottom}
            stroke={LIFELINE}
            strokeWidth={1.2}
            strokeDasharray="5 4"
          />
          {interactive && (
            <rect
              data-lifeline-id={p.participant.id}
              className="sequence__lifeline"
              x={p.x - 12}
              y={p.lifeTop}
              width={24}
              height={Math.max(0, p.lifeBottom - p.lifeTop)}
              fill="transparent"
            />
          )}
        </g>
      ))}
      {layout.activations.map((a, i) => {
        const color = layout.participants.find((p) => p.participant.id === a.participantId)?.participant
          .color;
        return (
          <rect
            key={`act${String(i)}`}
            x={a.x}
            y={a.y1}
            width={ACTIVATION_WIDTH}
            height={a.y2 - a.y1}
            fill={color ? tint(color, "33") : "#f3f4f6"}
            stroke={color ?? FRAME}
            strokeWidth={1.2}
            pointerEvents="none"
          />
        );
      })}
      {/* Frames go over the activation bars so their labels stay readable. */}
      {layout.fragments.map((f) => (
        <Fragment key={f.span.fragment.id} box={f} style={style} selectedIds={selectedIds} />
      ))}
      {layout.notes.map((note) => (
        <Note key={note.step.id} box={note} style={style} selected={isSelected(note.step.id)} />
      ))}
      {layout.messages.map((m) => (
        <Message key={m.step.id} box={m} selected={isSelected(m.step.id)} interactive={interactive} />
      ))}
      {layout.destroys.map((d, i) => (
        <path
          key={`x${String(i)}`}
          d={`M${n(d.x - 8)} ${n(d.y - 8)}L${n(d.x + 8)} ${n(d.y + 8)}M${n(d.x + 8)} ${n(d.y - 8)}L${n(d.x - 8)} ${n(d.y + 8)}`}
          stroke="#dc2626"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ))}
      {layout.participants.map((p) => (
        <g key={p.participant.id}>
          <Head
            box={p}
            y={p.headY}
            style={style}
            selected={isSelected(p.participant.id)}
            interactive={interactive}
          />
          {p.footY !== null && (
            <Head box={p} y={p.footY} style={style} selected={false} interactive={interactive} />
          )}
        </g>
      ))}
    </g>
  );
}

/** For export: a white page behind the diagram. */
export function SequenceChartContent({
  layout,
  styleId,
}: {
  layout: SequenceLayout;
  styleId: string;
}): ReactElement {
  return (
    <g>
      <rect width={layout.width} height={layout.height} fill="#ffffff" />
      <SequenceContent layout={layout} styleId={styleId} />
    </g>
  );
}
