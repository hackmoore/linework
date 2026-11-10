import type { SequenceData, SequenceMessage, SequenceNote, SequenceParticipant } from "@linework/shared";
import { fragmentSpans, type FragmentSpan } from "./model";

/** Static sequence diagram layout, shared by the editor, export, thumbnails and presenting. */

export const MARGIN = 24;
export const HEAD_HEIGHT = 52;
export const LINE_HEIGHT = 16;
export const FONT_SIZE = 13;
export const ACTIVATION_WIDTH = 10;
const HEAD_MIN_WIDTH = 96;
const ICON_MIN_WIDTH = 76;
const SELF_WIDTH = 34;
const SELF_HEIGHT = 26;
const STEP_GAP = 20;
const FRAGMENT_HEADER = 32;
const NOTE_MAX_WIDTH = 320;

/** Rough text width (no DOM measuring in export). */
export function textWidth(text: string, size = FONT_SIZE): number {
  return text.length * size * 0.56;
}

export function linesOf(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

const widest = (lines: readonly string[], size = FONT_SIZE): number =>
  Math.max(0, ...lines.map((l) => textWidth(l, size)));

/** Participants drawn as an icon with the name underneath, rather than a box. */
export function isIconKind(kind: SequenceParticipant["kind"]): boolean {
  return kind === "actor" || kind === "boundary" || kind === "control" || kind === "entity";
}

export interface ParticipantBox {
  readonly participant: SequenceParticipant;
  readonly index: number;
  /** Centre of the lifeline. */
  readonly x: number;
  readonly width: number;
  /** Top of the head: the top margin, or where the creating message arrives. */
  readonly headY: number;
  readonly lifeTop: number;
  readonly lifeBottom: number;
  /** Top of the copy of the head under the lifeline; null once destroyed. */
  readonly footY: number | null;
}

export interface MessageBox {
  readonly step: SequenceMessage;
  readonly index: number;
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly lines: readonly string[];
  /** Top of the label. */
  readonly labelY: number;
  readonly labelX: number;
  readonly self: boolean;
  /** Where a message to self comes back. */
  readonly returnX: number;
  readonly returnY: number;
  readonly number: number | null;
}

export interface NoteBox {
  readonly step: SequenceNote;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
}

export interface FragmentBox {
  readonly span: FragmentSpan;
  readonly x1: number;
  readonly x2: number;
  readonly y1: number;
  readonly y2: number;
  /** Dashed lines between operands, with their conditions. */
  readonly separators: readonly {
    readonly id: string;
    readonly index: number;
    readonly y: number;
    readonly label: string;
  }[];
}

export interface ActivationBox {
  readonly participantId: string;
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

export interface SequenceLayout {
  readonly width: number;
  readonly height: number;
  readonly participants: readonly ParticipantBox[];
  readonly messages: readonly MessageBox[];
  readonly notes: readonly NoteBox[];
  readonly fragments: readonly FragmentBox[];
  readonly activations: readonly ActivationBox[];
  readonly destroys: readonly { readonly x: number; readonly y: number }[];
  /** A y position for each step, to work out where a new step dropped at a y goes. */
  readonly stepYs: readonly number[];
  /** Where the next step would go. */
  readonly endY: number;
}

function headWidth(p: SequenceParticipant): number {
  const name = textWidth(p.name || "Untitled", FONT_SIZE);
  return isIconKind(p.kind) ? Math.max(ICON_MIN_WIDTH, name + 12) : Math.max(HEAD_MIN_WIDTH, name + 28);
}

function noteWidth(lines: readonly string[]): number {
  return Math.min(NOTE_MAX_WIDTH, Math.max(60, widest(lines) + 20));
}

function messageLabelWidth(step: SequenceMessage, numbered: boolean): number {
  return widest(linesOf(step.text)) + (numbered ? 24 : 0) + 16;
}

/** Lifeline centres: far enough apart for the heads and every label between them. */
function columns(data: SequenceData): { xs: number[]; widths: number[]; right: number } {
  const n = data.participants.length;
  const index = new Map(data.participants.map((p, i) => [p.id, i]));
  const widths = data.participants.map(headWidth);
  // need[i][j]: least distance from lifeline i to lifeline j (i < j).
  const need = new Map<string, number>();
  const want = (i: number, j: number, d: number): void => {
    const key = `${String(i)},${String(j)}`;
    need.set(key, Math.max(need.get(key) ?? 0, d));
  };
  let extraLeft = 0;
  let extraRight = 0;
  for (let i = 0; i + 1 < n; i++) want(i, i + 1, (widths[i] ?? 0) / 2 + (widths[i + 1] ?? 0) / 2 + 36);
  for (const step of data.steps) {
    if (step.type === "message") {
      const a = index.get(step.from);
      const b = index.get(step.to);
      if (a === undefined || b === undefined) continue;
      const label = messageLabelWidth(step, data.autonumber);
      if (a === b) {
        const room = Math.max(SELF_WIDTH, label) + SELF_WIDTH / 2 + 16;
        if (a + 1 < n) want(a, a + 1, room + (widths[a + 1] ?? 0) / 4);
        else extraRight = Math.max(extraRight, room);
      } else want(Math.min(a, b), Math.max(a, b), label + 24);
    } else if (step.type === "note") {
      const idx = step.participants.flatMap((p) => index.get(p) ?? []);
      const first = Math.min(...idx);
      const last = Math.max(...idx);
      if (idx.length === 0) continue;
      const w = noteWidth(linesOf(step.text));
      if (step.position === "right") {
        if (last + 1 < n) want(last, last + 1, w + 30);
        else extraRight = Math.max(extraRight, w + 20);
      } else if (step.position === "left") {
        if (first > 0) want(first - 1, first, w + 30);
        else extraLeft = Math.max(extraLeft, w + 20);
      } else if (first === last) {
        if (first + 1 < n) want(first, first + 1, w / 2 + 40);
        if (first > 0) want(first - 1, first, w / 2 + 40);
        if (first === 0) extraLeft = Math.max(extraLeft, w / 2);
        if (first === n - 1) extraRight = Math.max(extraRight, w / 2);
      }
    }
  }
  const xs: number[] = [];
  for (let j = 0; j < n; j++) {
    if (j === 0) {
      xs.push(MARGIN + Math.max((widths[0] ?? 0) / 2, extraLeft + 8));
      continue;
    }
    let x = 0;
    for (let i = 0; i < j; i++) {
      const d = need.get(`${String(i)},${String(j)}`);
      if (d !== undefined) x = Math.max(x, (xs[i] ?? 0) + d);
    }
    xs.push(x);
  }
  const last = n - 1;
  const right = n === 0 ? MARGIN * 2 : (xs[last] ?? 0) + Math.max((widths[last] ?? 0) / 2, extraRight + 8);
  return { xs, widths, right };
}

export function computeSequenceLayout(data: SequenceData): SequenceLayout {
  const { xs, widths, right } = columns(data);
  const index = new Map(data.participants.map((p, i) => [p.id, i]));
  const xOf = (id: string): number => xs[index.get(id) ?? 0] ?? MARGIN;
  const createdAt = new Map<string, number>();
  const destroyedAt = new Map<string, number>();
  const stacks = new Map<string, number[]>();
  const activations: ActivationBox[] = [];
  const messages: MessageBox[] = [];
  const notes: NoteBox[] = [];
  const destroys: { x: number; y: number }[] = [];
  const stepYs: number[] = [];
  const fragmentTops = new Map<number, number>();
  const fragmentBottoms = new Map<number, number>();
  const separatorYs = new Map<number, number>();
  const depthOf = (id: string): number => stacks.get(id)?.length ?? 0;
  /** Edge of the innermost activation bar on one side, or the lifeline itself. */
  const edge = (id: string, side: 1 | -1): number => {
    const d = depthOf(id);
    if (d === 0) return xOf(id);
    return xOf(id) + side * (ACTIVATION_WIDTH / 2) + (d - 1) * (ACTIVATION_WIDTH / 2);
  };
  const activate = (id: string, y: number): void => {
    stacks.set(id, [...(stacks.get(id) ?? []), y]);
  };
  const deactivate = (id: string, y: number): void => {
    const stack = stacks.get(id) ?? [];
    const start = stack.pop();
    if (start === undefined) return;
    activations.push({
      participantId: id,
      x: xOf(id) - ACTIVATION_WIDTH / 2 + stack.length * (ACTIVATION_WIDTH / 2),
      y1: start,
      y2: Math.max(y, start + 8),
    });
  };

  const snapshots: Map<string, number>[] = [];
  let y = MARGIN + HEAD_HEIGHT + 24;
  let number = 0;
  data.steps.forEach((step, i) => {
    if (step.type === "message") {
      if (!index.has(step.from) || !index.has(step.to)) {
        stepYs.push(y);
        return;
      }
      const lines = linesOf(step.text);
      const lineY = y + lines.length * LINE_HEIGHT + 6;
      const self = step.from === step.to;
      const fromX = xOf(step.from);
      const toX = xOf(step.to);
      const dir: 1 | -1 = toX >= fromX ? 1 : -1;
      const x1 = edge(step.from, self ? 1 : dir);
      if (step.deactivate && !self) deactivate(step.from, lineY);
      const returnY = self ? lineY + SELF_HEIGHT : lineY;
      if (step.activate) activate(step.to, returnY);
      let x2 = self ? edge(step.to, 1) : edge(step.to, dir === 1 ? -1 : 1);
      if (step.create && !self) {
        createdAt.set(step.to, lineY);
        x2 = toX - dir * ((widths[index.get(step.to) ?? 0] ?? 0) / 2);
      }
      if (step.deactivate && self) deactivate(step.from, returnY);
      if (data.autonumber) number += 1;
      const labelLeft = self ? x1 + 8 : Math.min(x1, x2);
      const labelWidth = self ? 0 : Math.abs(x2 - x1);
      messages.push({
        step,
        index: i,
        x1,
        x2,
        y: lineY,
        lines,
        labelY: y,
        labelX: self ? labelLeft : labelLeft + labelWidth / 2,
        self,
        returnX: x1 + SELF_WIDTH,
        returnY,
        number: data.autonumber ? number : null,
      });
      stepYs.push(lineY);
      y = returnY + STEP_GAP;
      if (step.create && !self) y = Math.max(y, lineY + HEAD_HEIGHT / 2 + 14);
      if (step.destroy) {
        const at = returnY;
        while (depthOf(step.to) > 0) deactivate(step.to, at);
        destroyedAt.set(step.to, at);
        destroys.push({ x: toX, y: at });
        y += 6;
      }
    } else if (step.type === "note") {
      const lines = linesOf(step.text);
      const known = step.participants.filter((p) => index.has(p));
      if (known.length === 0) {
        stepYs.push(y);
        return;
      }
      let width = noteWidth(lines);
      const height = Math.max(1, lines.length) * LINE_HEIGHT + 12;
      const centres = known.map(xOf);
      const lo = Math.min(...centres);
      const hi = Math.max(...centres);
      let x: number;
      if (step.position === "right") x = Math.max(...known.map((p) => edge(p, 1))) + 10;
      else if (step.position === "left") x = Math.min(...known.map((p) => edge(p, -1))) - 10 - width;
      else {
        width = Math.max(width, hi - lo + 40);
        x = (lo + hi) / 2 - width / 2;
      }
      notes.push({ step, index: i, x, y, width, height, lines });
      stepYs.push(y + height / 2);
      y += height + 14;
    } else if (step.type === "fragment") {
      fragmentTops.set(i, y);
      // Each section of an alt, par or critical starts from the same activations.
      snapshots.push(new Map([...stacks].map(([id, stack]) => [id, stack.length])));
      stepYs.push(y);
      y += FRAGMENT_HEADER;
    } else if (step.type === "else") {
      separatorYs.set(i, y);
      const snapshot = snapshots.at(-1);
      if (snapshot) {
        for (const id of new Set([...stacks.keys(), ...snapshot.keys()])) {
          const want = snapshot.get(id) ?? 0;
          while (depthOf(id) > want) deactivate(id, y);
          while (depthOf(id) < want) activate(id, y);
        }
      }
      stepYs.push(y);
      y += FRAGMENT_HEADER - 6;
    } else {
      y += 2;
      fragmentBottoms.set(i, y);
      snapshots.pop();
      stepYs.push(y);
      y += 16;
    }
  });
  const endY = y;
  const lifeEnd = y + 8;
  for (const [id, stack] of stacks) while (stack.length > 0) deactivate(id, lifeEnd - 4);

  // Frames enclose everything inside them, with more room for each frame nested inside.
  const spans = fragmentSpans(data.steps);
  const fragments: FragmentBox[] = spans.map((span) => {
    const inner = spans.filter((s) => s.start > span.start && s.end < span.end);
    const innerDepth = Math.max(0, ...inner.map((s) => s.depth - span.depth));
    const pad = 16 + innerDepth * 10;
    const xsInside: number[] = [];
    for (const m of messages)
      if (m.index > span.start && m.index < span.end) {
        // Clear of the lifelines and activation bars, and the step number.
        const lifelines = [xOf(m.step.from), xOf(m.step.to)];
        xsInside.push(m.x1, m.x2, Math.min(...lifelines) - 14, Math.max(...lifelines) + 14);
        if (m.number !== null) xsInside.push(m.x1 - 12);
        if (m.self) xsInside.push(m.returnX + 8 + widest(m.lines));
        else {
          const half = widest(m.lines) / 2 + (m.number === null ? 0 : 12);
          xsInside.push(m.labelX - half, m.labelX + half);
        }
      }
    for (const n of notes)
      if (n.index > span.start && n.index < span.end) xsInside.push(n.x - 6, n.x + n.width + 6);
    const label = textWidth(span.fragment.label ? `[${span.fragment.label}]` : "", 12);
    const tab = textWidth(span.fragment.kind, 12) + 22;
    let x1 = xsInside.length > 0 ? Math.min(...xsInside) - pad : (xs[0] ?? MARGIN) - 60;
    let x2 = xsInside.length > 0 ? Math.max(...xsInside) + pad : (xs[0] ?? MARGIN) + 60;
    x2 = Math.max(x2, x1 + tab + label + 24);
    x1 = Math.max(4, x1);
    return {
      span,
      x1,
      x2,
      y1: fragmentTops.get(span.start) ?? 0,
      y2: fragmentBottoms.get(span.end) ?? endY,
      separators: span.elses.map((e) => {
        const step = data.steps[e];
        return {
          id: step?.id ?? "",
          index: e,
          y: separatorYs.get(e) ?? 0,
          label: step?.type === "else" ? step.label : "",
        };
      }),
    };
  });

  const participants: ParticipantBox[] = data.participants.map((participant, i) => {
    const created = createdAt.get(participant.id);
    const destroyed = destroyedAt.get(participant.id);
    const headY = created === undefined ? MARGIN : created - HEAD_HEIGHT / 2;
    return {
      participant,
      index: i,
      x: xs[i] ?? MARGIN,
      width: widths[i] ?? HEAD_MIN_WIDTH,
      headY,
      lifeTop: headY + HEAD_HEIGHT,
      lifeBottom: destroyed ?? lifeEnd,
      footY: destroyed === undefined ? lifeEnd : null,
    };
  });
  const widestRight = Math.max(
    right,
    ...notes.map((n) => n.x + n.width),
    ...fragments.map((f) => f.x2),
    ...messages.filter((m) => m.self).map((m) => m.returnX + 8 + widest(m.lines)),
  );
  return {
    width: Math.ceil(widestRight + MARGIN),
    height: Math.ceil(lifeEnd + HEAD_HEIGHT + MARGIN),
    participants,
    messages,
    notes,
    fragments,
    activations,
    destroys,
    stepYs,
    endY,
  };
}

/** Index in the step list for something dropped at height `y`. */
export function insertIndexAt(layout: SequenceLayout, y: number): number {
  const i = layout.stepYs.findIndex((s) => s > y);
  return i < 0 ? layout.stepYs.length : i;
}

/** The lifeline nearest to `x`, within half the gap to its neighbours. */
export function participantAtX(layout: SequenceLayout, x: number): ParticipantBox | undefined {
  let best: ParticipantBox | undefined;
  for (const p of layout.participants) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  if (!best) return undefined;
  return Math.abs(best.x - x) <= Math.max(best.width / 2 + 30, 60) ? best : undefined;
}
