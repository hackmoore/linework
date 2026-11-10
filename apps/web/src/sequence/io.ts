import {
  PARTICIPANT_KINDS,
  type FragmentKind,
  type MessageArrow,
  type ParticipantKind,
  type SequenceData,
  type SequenceMessage,
  type SequenceParticipant,
  type SequenceStep,
} from "@linework/shared";
import {
  balanceSteps,
  createElse,
  createEnd,
  createFragment,
  createMessage,
  createNote,
  createParticipant,
  ELSE_WORD,
} from "./model";

/*
 * Mermaid sequenceDiagram text, both ways. Participant types other than actor use Mermaid's
 * `participant Id@{ "type": "database" } as Name` form.
 */

const ARROW_TEXT: Readonly<Record<MessageArrow, string>> = { sync: "->>", async: "-)", reply: "-->>" };

const oneLine = (text: string): string => text.replace(/\r?\n/g, "<br/>").replace(/[;#]/g, ",");

/** Mermaid ids for participants: their names made safe and unique. */
function mermaidIds(participants: readonly SequenceParticipant[]): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const p of participants) {
    let base = p.name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "P";
    if (!/^[A-Za-z]/.test(base)) base = `P${base}`;
    if (
      /^(end|participant|actor|as|loop|alt|else|opt|par|and|note|rect|box|critical|break|option|create|destroy|activate|deactivate|title|autonumber)$/i.test(
        base,
      )
    )
      base = `${base}_`;
    let id = base;
    for (let n = 2; used.has(id.toLowerCase()); n++) id = `${base}${String(n)}`;
    used.add(id.toLowerCase());
    ids.set(p.id, id);
  }
  return ids;
}

function declaration(p: SequenceParticipant, id: string): string {
  const keyword = p.kind === "actor" ? "actor" : "participant";
  const type = p.kind === "actor" || p.kind === "participant" ? "" : `@{ "type": "${p.kind}" }`;
  const name = oneLine(p.name);
  return `${keyword} ${id}${type}${name && name !== id ? ` as ${name}` : ""}`;
}

export function sequenceToMermaid(title: string, data: SequenceData): string {
  const ids = mermaidIds(data.participants);
  const id = (pid: string): string => ids.get(pid) ?? "Unknown";
  const out = ["sequenceDiagram"];
  if (title.trim()) out.push(`  title ${oneLine(title.trim())}`);
  if (data.autonumber) out.push("  autonumber");
  const created = new Set(data.steps.flatMap((s) => (s.type === "message" && s.create ? [s.to] : [])));
  for (const p of data.participants) if (!created.has(p.id)) out.push(`  ${declaration(p, id(p.id))}`);
  const open: FragmentKind[] = [];
  const indent = (): string => "  ".repeat(open.length + 1);
  for (const step of data.steps) {
    if (step.type === "message") {
      const target = data.participants.find((p) => p.id === step.to);
      if (step.create && target) out.push(`${indent()}create ${declaration(target, id(target.id))}`);
      if (step.destroy) out.push(`${indent()}destroy ${id(step.to)}`);
      const sign = step.activate ? "+" : step.deactivate && step.from !== step.to ? "-" : "";
      out.push(
        `${indent()}${id(step.from)}${ARROW_TEXT[step.arrow]}${sign}${id(step.to)}: ${oneLine(step.text)}`.trimEnd(),
      );
      if (step.activate && step.deactivate) out.push(`${indent()}deactivate ${id(step.from)}`);
      else if (step.deactivate && step.from === step.to) out.push(`${indent()}deactivate ${id(step.from)}`);
    } else if (step.type === "note") {
      const where = step.position === "over" ? "over" : `${step.position} of`;
      out.push(`${indent()}Note ${where} ${step.participants.map(id).join(",")}: ${oneLine(step.text)}`);
    } else if (step.type === "fragment") {
      out.push(
        step.kind === "group"
          ? `${indent()}rect rgba(128, 128, 128, 0.1)`
          : `${indent()}${step.kind} ${oneLine(step.label)}`.trimEnd(),
      );
      if (step.kind === "group" && step.label) out.push(`${indent()}  %% ${oneLine(step.label)}`);
      open.push(step.kind);
    } else if (step.type === "else") {
      const word = ELSE_WORD[open.at(-1) ?? "alt"] ?? "else";
      out.push(`${"  ".repeat(open.length)}${word} ${oneLine(step.label)}`.trimEnd());
    } else {
      open.pop();
      out.push(`${indent()}end`);
    }
  }
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------- import

export type SequenceImportResult =
  { ok: true; data: SequenceData; title: string | null } | { ok: false; error: string };

export function isMermaidSequence(text: string): boolean {
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("%%"));
  return first !== undefined && /^sequenceDiagram\b/.test(first);
}

const MESSAGE =
  /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->|--\|[\\/]|-\|[\\/])\s*([+-]?)\s*([^:]+?)\s*(?::(.*))?$/;

function arrowOf(text: string): MessageArrow {
  if (text === "-)") return "async";
  if (text.startsWith("--") || text === "<<-->>") return "reply";
  return "sync";
}

const unbreak = (text: string): string => text.replace(/<br\s*\/?>/gi, "\n").trim();

export function parseMermaidSequence(text: string): SequenceImportResult {
  if (!isMermaidSequence(text)) return { ok: false, error: "Expected a Mermaid sequenceDiagram" };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("%%"));
  lines.shift();
  let title: string | null = null;
  let autonumber = false;
  const participants: SequenceParticipant[] = [];
  const byId = new Map<string, SequenceParticipant>();
  const steps: SequenceStep[] = [];
  const blocks: ("fragment" | "box")[] = [];
  let pendingCreate: string | null = null;
  let pendingDestroy: string | null = null;
  const pendingActivate = new Set<string>();
  const pendingDeactivate = new Set<string>();

  const declare = (mermaidId: string, kind: ParticipantKind, name: string): SequenceParticipant => {
    const known = byId.get(mermaidId);
    if (known) {
      const updated = { ...known, kind, name: name.slice(0, 100) };
      participants[participants.indexOf(known)] = updated;
      byId.set(mermaidId, updated);
      return updated;
    }
    const p = createParticipant(name.slice(0, 100), participants.length, kind);
    participants.push(p);
    byId.set(mermaidId, p);
    return p;
  };
  const ref = (mermaidId: string): SequenceParticipant =>
    byId.get(mermaidId) ?? declare(mermaidId, "participant", mermaidId);
  // The latest message, looking back past notes and fragment lines, so `deactivate B` after an
  // `end` still ends the bar where B last spoke.
  const lastMessageIndex = (): number => steps.findLastIndex((s) => s.type === "message");
  const lastMessage = (): SequenceMessage | undefined => {
    const last = steps[lastMessageIndex()];
    return last?.type === "message" ? last : undefined;
  };
  const replaceLast = (patch: Partial<SequenceMessage>): void => {
    const index = lastMessageIndex();
    const last = steps[index];
    if (last?.type === "message") steps[index] = { ...last, ...patch };
  };

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = /^title\s*:?\s*(.*)$/i.exec(line))) {
      title = m[1]?.trim() ?? null;
    } else if (/^autonumber\b/i.test(line)) {
      autonumber = !/\boff\b/i.test(line);
    } else if ((m = /^(create\s+)?(participant|actor)\s+(.+)$/i.exec(line))) {
      const rest = m[3] ?? "";
      const parts = /^([^@\s]+?)(?:@\{(.*)\})?(?:\s+as\s+(.+))?$/i.exec(rest.trim());
      if (!parts) continue;
      const mermaidId = parts[1] ?? rest;
      const config = parts[2] ?? "";
      const type = /"type"\s*:\s*"(\w+)"/.exec(config)?.[1]?.toLowerCase();
      const alias = /"alias"\s*:\s*"([^"]*)"/.exec(config)?.[1];
      const kind: ParticipantKind =
        m[2]?.toLowerCase() === "actor"
          ? "actor"
          : type && (PARTICIPANT_KINDS as readonly string[]).includes(type)
            ? (type as ParticipantKind)
            : type === "collections"
              ? "database"
              : "participant";
      declare(mermaidId, kind, unbreak(parts[3] ?? alias ?? mermaidId).replace(/\n/g, " "));
      if (m[1]) pendingCreate = mermaidId;
    } else if ((m = /^destroy\s+(.+)$/i.exec(line))) {
      pendingDestroy = m[1]?.trim() ?? null;
    } else if ((m = /^(activate|deactivate)\s+(.+)$/i.exec(line))) {
      const who = ref(m[2]?.trim() ?? "");
      const last = lastMessage();
      if (m[1]?.toLowerCase() === "activate") {
        if (last?.to === who.id && !last.activate) replaceLast({ activate: true });
        else pendingActivate.add(who.id);
      } else if (last?.from === who.id && !last.deactivate) replaceLast({ deactivate: true });
      else pendingDeactivate.add(who.id);
    } else if ((m = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:(.*)$/i.exec(line))) {
      const where = m[1]?.toLowerCase() ?? "over";
      const ids = (m[2] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => ref(s).id);
      const position = where.startsWith("left") ? "left" : where.startsWith("right") ? "right" : "over";
      steps.push(createNote(position === "over" ? ids : ids.slice(0, 1), unbreak(m[3] ?? ""), position));
    } else if ((m = /^(loop|alt|opt|par|critical|break)\b\s*(.*)$/i.exec(line))) {
      blocks.push("fragment");
      steps.push(createFragment((m[1]?.toLowerCase() ?? "loop") as FragmentKind, unbreak(m[2] ?? "")));
    } else if (/^rect\b/i.test(line)) {
      blocks.push("fragment");
      steps.push(createFragment("group", ""));
    } else if (/^box\b/i.test(line)) {
      blocks.push("box");
    } else if ((m = /^(else|and|option)\b\s*(.*)$/i.exec(line))) {
      steps.push(createElse(unbreak(m[2] ?? "")));
    } else if (/^end$/i.test(line)) {
      if (blocks.pop() === "fragment") steps.push(createEnd());
    } else if ((m = MESSAGE.exec(line))) {
      const from = ref((m[1] ?? "").trim());
      const to = ref((m[4] ?? "").trim());
      const sign = m[3] ?? "";
      const toMermaidId = (m[4] ?? "").trim();
      steps.push(
        createMessage(from.id, to.id, unbreak(m[5] ?? ""), {
          arrow: arrowOf(m[2] ?? "->>"),
          activate: sign === "+" || pendingActivate.delete(to.id),
          deactivate: sign === "-" || pendingDeactivate.delete(from.id),
          create: pendingCreate === toMermaidId,
          // Only a receiver can be destroyed here; a sender being destroyed is dropped.
          destroy: pendingDestroy === toMermaidId,
        }),
      );
      if (pendingCreate === toMermaidId) pendingCreate = null;
      pendingDestroy = null;
    }
  }
  if (participants.length === 0) return { ok: false, error: "The sequence diagram has no participants" };
  if (participants.length > 100) return { ok: false, error: "Too many participants (the limit is 100)" };
  const balanced = balanceSteps(steps, new Set(participants.map((p) => p.id)));
  if (balanced.length > 5_000) return { ok: false, error: "Too many steps (the limit is 5,000)" };
  return { ok: true, data: { autonumber, participants, steps: balanced }, title };
}
