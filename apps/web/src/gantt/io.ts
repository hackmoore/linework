import {
  DEPENDENCY_TYPES,
  isValidIsoDate,
  toDayNumber,
  type DependencyType,
  type GanttData,
  type GanttDependency,
  type GanttSection,
  type GanttTask,
} from "@linework/shared";
import { createGanttData, createSection, createTask, orderedTasks } from "./model";
import { calendarOf, spanOf } from "./schedule";

/*
 * CSV and Microsoft Project XML import/export for gantt charts. CSV opens directly in
 * Excel, Google Sheets and Numbers; MS Project XML is understood by Project,
 * ProjectLibre and GanttProject.
 */

export type ImportResult = { ok: true; data: GanttData; title: string | null } | { ok: false; error: string };

// ---------------------------------------------------------------- CSV

const CSV_HEADERS = [
  "ID",
  "Name",
  "Type",
  "Section",
  "Start",
  "End",
  "Duration",
  "Progress",
  "Owner",
  "Depends on",
] as const;

export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Dependencies as "3FS+2; 5SS" using the exported row IDs. */
function formatDependencies(deps: readonly GanttDependency[], rowIds: ReadonlyMap<string, number>): string {
  return deps
    .flatMap((d) => {
      const id = rowIds.get(d.taskId);
      if (id === undefined) return [];
      const lag = d.lag === 0 ? "" : d.lag > 0 ? `+${String(d.lag)}` : String(d.lag);
      return [`${String(id)}${d.type === "FS" && lag === "" ? "" : d.type}${lag}`];
    })
    .join("; ");
}

export function ganttToCsv(data: GanttData): string {
  const cal = calendarOf(data);
  const tasks = orderedTasks(data);
  const rowIds = new Map(tasks.map((t, i) => [t.id, i + 1]));
  const sections = new Map(data.sections.map((s) => [s.id, s.name]));
  const lines = [CSV_HEADERS.join(",")];
  tasks.forEach((task, i) => {
    lines.push(
      [
        i + 1,
        task.name,
        task.kind === "milestone" ? "Milestone" : "Task",
        task.sectionId ? (sections.get(task.sectionId) ?? "") : "",
        task.start,
        task.end,
        task.kind === "milestone" ? 0 : spanOf(task, cal).duration,
        task.progress,
        task.owner,
        formatDependencies(task.dependencies, rowIds),
      ]
        .map(csvCell)
        .join(","),
    );
  });
  return `${lines.join("\r\n")}\r\n`;
}

/** RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Accepts YYYY-MM-DD plus D/M/YYYY-style dates, which spreadsheets often produce. */
export function normaliseDate(value: string): string | null {
  const v = value.trim();
  if (isValidIsoDate(v)) return v;
  const m = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(v);
  if (!m) return null;
  const [, a = "", b = "", c = ""] = m;
  const pad = (n: string): string => n.padStart(2, "0");
  // YYYY/MM/DD, else assume DD/MM/YYYY (ISO 8601-adjacent and most of the world).
  const iso = a.length === 4 ? `${a}-${pad(b)}-${pad(c)}` : `${c}-${pad(b)}-${pad(a)}`;
  return isValidIsoDate(iso) ? iso : null;
}

function parseDependencyList(value: string): { row: number; type: DependencyType; lag: number }[] {
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const m = /^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?$/i.exec(part);
      if (!m) return [];
      const type = (m[2]?.toUpperCase() ?? "FS") as DependencyType;
      return [
        {
          row: Number(m[1]),
          type: DEPENDENCY_TYPES.includes(type) ? type : "FS",
          lag: m[3] ? Number(m[3].replace(/\s/g, "")) : 0,
        },
      ];
    });
}

export function csvToGantt(text: string): ImportResult {
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase());
  if (!header) return { ok: false, error: "The file is empty" };
  const col = (...names: string[]): number => header.findIndex((h) => names.includes(h));
  const iName = col("name", "task", "task name", "title");
  const iStart = col("start", "start date", "begin");
  const iEnd = col("end", "end date", "finish", "due", "due date");
  if (iName < 0 || iStart < 0) return { ok: false, error: "Needs at least Name and Start columns" };
  const iId = col("id", "#");
  const iType = col("type", "kind");
  const iSection = col("section", "phase", "group");
  const iDuration = col("duration", "days");
  const iProgress = col("progress", "% complete", "percent complete", "complete");
  const iOwner = col("owner", "assignee", "assigned to", "resource");
  const iDeps = col("depends on", "dependencies", "predecessors");

  const data = createGanttData();
  const cal = calendarOf(data);
  const sections = new Map<string, GanttSection>();
  const byRow = new Map<number, GanttTask>();
  const pendingDeps: { task: GanttTask; spec: string }[] = [];
  const tasks: GanttTask[] = [];

  for (const [index, cells] of rows.slice(1).entries()) {
    const cell = (i: number): string => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const name = cell(iName);
    const start = normaliseDate(cell(iStart));
    if (!name && !start) continue;
    if (!start) return { ok: false, error: `Row ${String(index + 2)}: "${cell(iStart)}" is not a date` };
    const sectionName = cell(iSection);
    let section: GanttSection | undefined;
    if (sectionName) {
      section = sections.get(sectionName) ?? createSection(sectionName, sections.size);
      sections.set(sectionName, section);
    }
    const milestone = /^milestone$/i.test(cell(iType));
    let end = normaliseDate(cell(iEnd));
    const duration = Number(cell(iDuration));
    if (!end && Number.isFinite(duration) && duration > 0) {
      end = new Date(cal.dayAt(cal.index(toDayNumber(start)) + duration - 1) * 86_400_000)
        .toISOString()
        .slice(0, 10);
    }
    if (milestone || !end || end < start) end = start;
    const progress = Math.min(100, Math.max(0, Number(cell(iProgress).replace("%", "")) || 0));
    const task: GanttTask = {
      ...createTask(
        milestone ? "milestone" : "task",
        name.slice(0, 200) || "Untitled task",
        start,
        1,
        section?.id ?? null,
      ),
      end,
      progress: milestone ? 0 : progress,
      owner: cell(iOwner).slice(0, 100),
    };
    tasks.push(task);
    const rowId = Number(cell(iId)) || index + 1;
    byRow.set(rowId, task);
    if (cell(iDeps)) pendingDeps.push({ task, spec: cell(iDeps) });
  }
  if (tasks.length === 0) return { ok: false, error: "No tasks found" };

  const resolved = new Map(tasks.map((t) => [t.id, t]));
  for (const { task, spec } of pendingDeps) {
    const deps = parseDependencyList(spec).flatMap((d) => {
      const pred = byRow.get(d.row);
      return pred && pred.id !== task.id ? [{ taskId: pred.id, type: d.type, lag: d.lag }] : [];
    });
    resolved.set(task.id, { ...task, dependencies: dedupeDeps(deps) });
  }
  return {
    ok: true,
    data: { ...data, sections: [...sections.values()], tasks: dropCycles([...resolved.values()]) },
    title: null,
  };
}

function dedupeDeps(deps: GanttDependency[]): GanttDependency[] {
  const seen = new Set<string>();
  return deps.filter((d) => !seen.has(d.taskId) && seen.add(d.taskId));
}

/** Removes dependencies that would close a cycle, so imported files always validate. */
function dropCycles(tasks: GanttTask[]): GanttTask[] {
  const accepted = new Map<string, GanttDependency[]>();
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (accepted.get(from) ?? []).some((d) => reaches(d.taskId, to, seen));
  };
  return tasks.map((task) => {
    const keep: GanttDependency[] = [];
    accepted.set(task.id, keep);
    for (const dep of task.dependencies) {
      if (!reaches(dep.taskId, task.id)) keep.push(dep);
    }
    return { ...task, dependencies: keep };
  });
}

// ---------------------------------------------------------------- MS Project XML

const MSP_TYPE: Readonly<Record<DependencyType, number>> = { FF: 0, FS: 1, SF: 2, SS: 3 };
const MSP_TYPE_REVERSE: Readonly<Record<number, DependencyType>> = { 0: "FF", 1: "FS", 2: "SF", 3: "SS" };
/** MS Project stores lag in tenths of a minute; one 8-hour working day is 4800. */
const LAG_UNITS_PER_DAY = 4800;

function xmlEscape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function ganttToMsProjectXml(data: GanttData, title: string): string {
  const cal = calendarOf(data);
  const lines: string[] = [];
  const add = (s: string): void => {
    lines.push(s);
  };
  add('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  add('<Project xmlns="http://schemas.microsoft.com/project">');
  add(`  <Name>${xmlEscape(title)}</Name>`);
  add(`  <Title>${xmlEscape(title)}</Title>`);
  add("  <ScheduleFromStart>1</ScheduleFromStart>");
  add("  <Tasks>");
  // UIDs follow display order: ungrouped tasks, then each section (as a summary task) and its tasks.
  type Item = { kind: "section"; section: GanttSection } | { kind: "task"; task: GanttTask; level: number };
  const ordered = orderedTasks(data);
  const sectionIds = new Set(data.sections.map((s) => s.id));
  const list: Item[] = [];
  for (const t of ordered)
    if (t.sectionId === null || !sectionIds.has(t.sectionId)) list.push({ kind: "task", task: t, level: 1 });
  for (const s of data.sections) {
    list.push({ kind: "section", section: s });
    for (const t of ordered) if (t.sectionId === s.id) list.push({ kind: "task", task: t, level: 2 });
  }
  const assigned = list.map((item, i) => ({ item, uid: i + 1 }));
  const uids = new Map<string, number>();
  for (const { item, uid } of assigned) if (item.kind === "task") uids.set(item.task.id, uid);

  for (const { item, uid: u } of assigned) {
    add("    <Task>");
    add(`      <UID>${String(u)}</UID>`);
    add(`      <ID>${String(u)}</ID>`);
    if (item.kind === "section") {
      const tasks = ordered.filter((t) => t.sectionId === item.section.id);
      const start = tasks.reduce<string | null>((m, t) => (m === null || t.start < m ? t.start : m), null);
      const end = tasks.reduce<string | null>((m, t) => (m === null || t.end > m ? t.end : m), null);
      add(`      <Name>${xmlEscape(item.section.name)}</Name>`);
      add("      <Summary>1</Summary>");
      add("      <OutlineLevel>1</OutlineLevel>");
      if (start && end) {
        add(`      <Start>${start}T08:00:00</Start>`);
        add(`      <Finish>${end}T17:00:00</Finish>`);
      }
    } else {
      const { task, level } = item;
      const days = task.kind === "milestone" ? 0 : spanOf(task, cal).duration;
      add(`      <Name>${xmlEscape(task.name)}</Name>`);
      add(`      <OutlineLevel>${String(level)}</OutlineLevel>`);
      add(`      <Start>${task.start}T08:00:00</Start>`);
      add(`      <Finish>${task.end}T${task.kind === "milestone" ? "08:00:00" : "17:00:00"}</Finish>`);
      add(`      <Duration>PT${String(days * 8)}H0M0S</Duration>`);
      add(`      <Milestone>${task.kind === "milestone" ? "1" : "0"}</Milestone>`);
      add(`      <PercentComplete>${String(Math.round(task.progress))}</PercentComplete>`);
      if (task.owner) add(`      <Notes>Owner: ${xmlEscape(task.owner)}</Notes>`);
      for (const dep of task.dependencies) {
        const pred = uids.get(dep.taskId);
        if (!pred) continue;
        add("      <PredecessorLink>");
        add(`        <PredecessorUID>${String(pred)}</PredecessorUID>`);
        add(`        <Type>${String(MSP_TYPE[dep.type])}</Type>`);
        add(`        <LinkLag>${String(dep.lag * LAG_UNITS_PER_DAY)}</LinkLag>`);
        add("        <LagFormat>7</LagFormat>");
        add("      </PredecessorLink>");
      }
    }
    add("    </Task>");
  }
  add("  </Tasks>");
  add("</Project>");
  return `${lines.join("\n")}\n`;
}

export function msProjectXmlToGantt(xml: string): ImportResult {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return { ok: false, error: "The file is not valid XML" };
  const project = doc.documentElement;
  if (project.localName !== "Project") return { ok: false, error: "Not a Microsoft Project XML file" };
  const text = (el: Element, name: string): string =>
    Array.from(el.children)
      .find((c) => c.localName === name)
      ?.textContent.trim() ?? "";
  const title = text(project, "Title") || text(project, "Name") || null;
  const taskEls = Array.from(project.getElementsByTagNameNS("*", "Task"));

  const data = createGanttData();
  const sections: GanttSection[] = [];
  const tasks: GanttTask[] = [];
  const byUid = new Map<string, GanttTask>();
  const links: { task: GanttTask; el: Element }[] = [];
  let currentSection: GanttSection | null = null;

  for (const el of taskEls) {
    const level = Number(text(el, "OutlineLevel") || "1");
    const name = text(el, "Name");
    if (level === 0) continue; // project summary task
    const summary = text(el, "Summary") === "1";
    if (summary) {
      if (level === 1) {
        currentSection = createSection(name.slice(0, 200) || "Section", sections.length);
        sections.push(currentSection);
      }
      continue;
    }
    const start = text(el, "Start").slice(0, 10);
    let end = text(el, "Finish").slice(0, 10);
    if (!isValidIsoDate(start)) continue;
    if (!isValidIsoDate(end) || end < start) end = start;
    const milestone = text(el, "Milestone") === "1";
    const notes = text(el, "Notes");
    const owner = /^Owner:\s*(.+)$/m.exec(notes)?.[1]?.trim() ?? "";
    const task: GanttTask = {
      ...createTask(
        milestone ? "milestone" : "task",
        name.slice(0, 200) || "Untitled task",
        start,
        1,
        level === 1 ? null : (currentSection?.id ?? null),
      ),
      end: milestone ? start : end,
      progress: milestone ? 0 : Math.min(100, Math.max(0, Number(text(el, "PercentComplete")) || 0)),
      owner: owner.slice(0, 100),
    };
    tasks.push(task);
    byUid.set(text(el, "UID"), task);
    links.push({ task, el });
  }
  if (tasks.length === 0) return { ok: false, error: "No tasks found" };

  const resolved = new Map(tasks.map((t) => [t.id, t]));
  for (const { task, el } of links) {
    const deps = Array.from(el.children)
      .filter((c) => c.localName === "PredecessorLink")
      .flatMap((link) => {
        const pred = byUid.get(text(link, "PredecessorUID"));
        if (!pred || pred.id === task.id) return [];
        const type = MSP_TYPE_REVERSE[Number(text(link, "Type") || "1")] ?? "FS";
        const lag = Math.max(
          -999,
          Math.min(999, Math.round(Number(text(link, "LinkLag") || "0") / LAG_UNITS_PER_DAY)),
        );
        return [{ taskId: pred.id, type, lag }];
      });
    resolved.set(task.id, { ...task, dependencies: dedupeDeps(deps) });
  }
  return { ok: true, data: { ...data, sections, tasks: dropCycles([...resolved.values()]) }, title };
}

/** Picks an importer by file name or content. */
export function importGanttFile(fileName: string, text: string): ImportResult {
  if (/\.xml$/i.test(fileName) || text.trimStart().startsWith("<")) return msProjectXmlToGantt(text);
  return csvToGantt(text);
}
