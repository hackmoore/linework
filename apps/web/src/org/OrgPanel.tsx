import type { ReactElement } from "react";
import type { Diagram, DiagramNode } from "@linework/shared";
import { usableLayerId, useEditor } from "../editor/store";
import { CONNECT, SELECT, byTool, type ToolDef } from "../editor/tools";
import { CommitInput } from "../gantt/inputs";
import {
  ChecksSection,
  GuideSection,
  PaletteButton,
  PaletteDivider,
  Section,
  TidyButtons,
} from "../kinds/KindPanels";
import { descendants } from "../kinds/tree";
import type { KindUi, SelectionPanelProps } from "../kinds/ui";
import {
  createPersonNode,
  departmentColor,
  departments,
  isPerson,
  orgDirection,
  orgTree,
  personOf,
  personPatch,
  reportingLine,
  tidyOrg,
  type Person,
} from "./model";

// ---------------------------------------------------------------- actions

/** Applies a change and lays the chart out again, selecting `select` afterwards. */
function changeAndTidy(change: (d: Diagram) => Diagram, select?: string): void {
  const state = useEditor.getState();
  state.commit((d) => tidyOrg(change(d), orgDirection(d)));
  if (select) state.select({ nodeIds: [select] });
}

function newPerson(d: Diagram, near?: DiagramNode, details: Partial<Person> = {}): DiagramNode {
  const layerId = usableLayerId(d, useEditor.getState().activeLayerId);
  const node = createPersonNode(
    { name: "New person", title: "Job title", department: near?.meta?.department ?? "", ...details },
    near ? near.x + near.width / 2 : 0,
    near ? near.y + near.height * 2 : 0,
  );
  return layerId ? { ...node, layerId } : node;
}

export function addPerson(at: { x: number; y: number }): void {
  const state = useEditor.getState();
  const d = state.diagram;
  if (!d) return;
  const node = { ...newPerson(d), x: Math.round(at.x - 100), y: Math.round(at.y - 40) };
  state.commit((doc) => ({ ...doc, nodes: [...doc.nodes, node] }));
  state.select({ nodeIds: [node.id] });
}

/** Tab: a new direct report under the selected person. */
export function addReport(managerId: string): boolean {
  const d = useEditor.getState().diagram;
  const manager = d?.nodes.find((n) => n.id === managerId);
  if (!d || !manager || !isPerson(manager)) return false;
  const node = newPerson(d, manager);
  changeAndTidy(
    (doc) => ({
      ...doc,
      nodes: [...doc.nodes, node],
      edges: [...doc.edges, reportingLine(managerId, node.id)],
    }),
    node.id,
  );
  return true;
}

/** Enter: a new colleague with the same manager. */
export function addPeer(personId: string): boolean {
  const d = useEditor.getState().diagram;
  const person = d?.nodes.find((n) => n.id === personId);
  if (!d || !person || !isPerson(person)) return false;
  const manager = orgTree(d).parent.get(personId);
  if (!manager) return addReport(personId);
  const node = newPerson(d, person);
  changeAndTidy(
    (doc) => ({
      ...doc,
      nodes: [...doc.nodes, node],
      edges: [...doc.edges, reportingLine(manager, node.id)],
    }),
    node.id,
  );
  return true;
}

/** Moves a person (and their team) to report to someone else, or to nobody. */
export function setManager(personId: string, managerId: string | null): void {
  changeAndTidy((d) => {
    const people = new Set(d.nodes.filter(isPerson).map((n) => n.id));
    const edges = d.edges.filter((e) => !(e.target === personId && people.has(e.source)));
    return { ...d, edges: managerId ? [...edges, reportingLine(managerId, personId)] : edges };
  });
}

export function updatePerson(id: string, patch: Partial<Person>): void {
  changeAndTidy((d) => ({
    ...d,
    nodes: d.nodes.map((n) => {
      const p = n.id === id ? personOf(n) : null;
      return p ? { ...n, ...personPatch({ ...p, ...patch }) } : n;
    }),
  }));
}

// ---------------------------------------------------------------- inspector

function PersonSection({ diagram, node }: { diagram: Diagram; node: DiagramNode }): ReactElement | null {
  const person = personOf(node);
  if (!person) return null;
  const tree = orgTree(diagram);
  const below = descendants(tree, node.id);
  const manager = tree.parent.get(node.id) ?? "";
  const reports = tree.children.get(node.id) ?? [];
  const people = diagram.nodes.filter((n) => isPerson(n) && n.id !== node.id && !below.has(n.id));
  const depts = departments(diagram);
  const field = (label: string, key: "name" | "title" | "email", placeholder: string): ReactElement => (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      <CommitInput
        key={person[key]}
        className="input"
        label={label}
        maxLength={200}
        placeholder={placeholder}
        value={person[key]}
        onCommit={(value) => {
          updatePerson(node.id, { [key]: value });
        }}
      />
    </label>
  );
  return (
    <Section title={person.vacant ? "Open position" : "Person"}>
      {field("Name", "name", "Full name")}
      {field("Job title", "title", "Such as Head of Design")}
      <label className="inspector__field">
        <span className="inspector__label">Department</span>
        <CommitInput
          key={person.department}
          className="input"
          label="Department"
          maxLength={100}
          placeholder="Such as Engineering"
          value={person.department}
          list="org-departments"
          onCommit={(department) => {
            updatePerson(node.id, { department });
          }}
        />
        <datalist id="org-departments">
          {depts.map((dep) => (
            <option key={dep} value={dep} />
          ))}
        </datalist>
      </label>
      {field("Email", "email", "Optional")}
      <label className="inspector__field">
        <span className="inspector__label">Reports to</span>
        <select
          className="select"
          value={manager}
          onChange={(event) => {
            setManager(node.id, event.target.value || null);
          }}
        >
          <option value="">Nobody (top of the chart)</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.meta?.subtitle ? `, ${p.meta.subtitle}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="kanban-settings__done">
        <input
          type="checkbox"
          checked={person.vacant}
          onChange={(event) => {
            updatePerson(node.id, { vacant: event.target.checked });
          }}
        />
        Open position (vacant)
      </label>
      <p className="inspector__hint">
        {reports.length === 0
          ? "No direct reports."
          : `${String(reports.length)} direct ${reports.length === 1 ? "report" : "reports"}, ${String(below.size)} in their team.`}
      </p>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm"
          title="Tab"
          onClick={() => {
            addReport(node.id);
          }}
        >
          + Report
        </button>
        <button
          type="button"
          className="btn btn--sm"
          title="Enter"
          onClick={() => {
            addPeer(node.id);
          }}
        >
          + Peer
        </button>
      </div>
    </Section>
  );
}

function OrgSelection({ diagram, nodes }: SelectionPanelProps): ReactElement | null {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  return only ? <PersonSection diagram={diagram} node={only} /> : null;
}

function OrgSettings({ diagram }: { diagram: Diagram }): ReactElement {
  const people = diagram.nodes.filter(isPerson);
  const vacant = people.filter((n) => n.meta?.vacant === "true").length;
  const depts = departments(diagram);
  return (
    <>
      <Section title="Org chart">
        <p className="inspector__hint">
          {`${String(people.length)} ${people.length === 1 ? "person" : "people"}`}
          {vacant > 0 ? `, ${String(vacant)} open ${vacant === 1 ? "position" : "positions"}` : ""}.
        </p>
        <TidyButtons directions />
        {depts.length > 0 && (
          <ul className="kind-list">
            {depts.map((dep) => {
              const members = people.filter((n) => n.meta?.department === dep);
              return (
                <li key={dep}>
                  <button
                    type="button"
                    className="kind-list__item"
                    onClick={() => {
                      useEditor.getState().select({ nodeIds: members.map((n) => n.id) });
                    }}
                  >
                    <span
                      className="network-links__dot"
                      style={{ background: departmentColor(diagram, dep) }}
                    />
                    {dep}
                    <span className="kind-list__meta">{members.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <ChecksSection
        diagram={diagram}
        empty="Add the first person from the toolbar."
        allClear="No problems found. Everyone has one manager."
      />
      <GuideSection chartType="org" />
    </>
  );
}

function OrgPalette({ canvasCentre }: { canvasCentre: () => { x: number; y: number } }): ReactElement {
  return (
    <>
      <PaletteDivider />
      <PaletteButton
        label="Add person"
        onClick={() => {
          addPerson(canvasCentre());
        }}
      >
        <path d="M12 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 20c0-3.3 3.1-6 7-6s7 2.7 7 6M19 4v4M17 6h4" />
      </PaletteButton>
    </>
  );
}

const TOOLS: readonly ToolDef[] = [SELECT, CONNECT, byTool("note"), byTool("text")].filter(
  (t): t is ToolDef => t !== undefined,
);

export const orgUi: KindUi = {
  tools: TOOLS,
  Palette: OrgPalette,
  SelectionPanel: OrgSelection,
  Settings: OrgSettings,
  onTab: addReport,
  onEnter: addPeer,
};
