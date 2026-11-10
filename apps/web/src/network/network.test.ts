import { beforeEach, describe, expect, it } from "vitest";
import { itemCount, parseDiagram, type Diagram, type DiagramNode } from "@linework/shared";
import { applyPatch, diffDiagrams } from "../collab/patch";
import { createDiagram, createEdge, createNode } from "../diagram/factory";
import { useEditor } from "../editor/store";
import { diagramToSvg } from "../export/exporters";
import { importText } from "../share/importText";
import { parseSimpleSpec } from "../share/simpleSpec";
import { buildTemplate } from "../templates/build";
import { addEntity, mergeEntities, setEntityType, setLinkDates, updateEntity } from "./actions";
import { importLinksCsv, isNetworkCsv, linksToCsv } from "./io";
import { circleLayout, egoLayout, forceLayout } from "./layout";
import {
  betweenness,
  clusters,
  degrees,
  ENTITY_INFO,
  entityOf,
  linkOf,
  neighbours,
  searchEntities,
  shortestPath,
} from "./model";

function valid(d: Diagram): Diagram {
  const result = parseDiagram(d);
  if (!result.ok) throw new Error(result.error);
  return d;
}

const byName = (d: Diagram, name: string): DiagramNode => {
  const node = d.nodes.find((n) => n.label === name);
  if (!node) throw new Error(`no ${name}`);
  return node;
};

/** a - b - c, plus d on its own. */
function chain(): Diagram {
  let d = createDiagram("Net", "professional", "network");
  const layer = d.layers[0]?.id ?? "";
  for (const name of ["a", "b", "c", "d"]) d = addEntity(d, "person", 0, 0, layer, name).diagram;
  const [a, b, c] = ["a", "b", "c"].map((n) => byName(d, n).id);
  return {
    ...d,
    edges: [
      createEdge(a ?? "", b ?? "", { label: "knows" }),
      createEdge(b ?? "", c ?? "", { label: "knows" }),
    ],
  };
}

describe("network documents", () => {
  it("builds a valid investigation template with details and dates", () => {
    const d = valid(buildTemplate("network-investigation"));
    expect(d.chartType).toBe("network");
    expect(itemCount(d)).toBe(10);
    const alex = byName(d, "Alex Mercer");
    expect(entityOf(d, alex).attributes).toEqual([{ key: "Role", value: "Director" }]);
    const calls = d.edges.find((e) => e.label === "calls ×14");
    expect(calls && linkOf(d, calls)).toMatchObject({ date: "2025-01-06", endDate: "2025-03-28" });
    expect(d.edges.find((e) => e.label === "seen driving")?.strokePattern).toBe("dotted");
    expect(diagramToSvg(d).svg).toContain("Alex Mercer");
    valid(buildTemplate("network-blank"));
  });

  it("rejects duplicate details and backwards dates", () => {
    const d = buildTemplate("network-investigation");
    const entity = d.network?.entities[0];
    if (!entity || !d.network) throw new Error("no entity");
    expect(parseDiagram({ ...d, network: { ...d.network, entities: [entity, entity] } }).ok).toBe(false);
    const edge = d.edges[0];
    if (!edge) throw new Error("no edge");
    const backwards = { id: edge.id, date: "2025-02-01", endDate: "2025-01-01" };
    expect(parseDiagram({ ...d, network: { ...d.network, links: [backwards] } }).ok).toBe(false);
    expect(parseDiagram({ ...d, network: undefined }).ok).toBe(false);
  });
});

describe("entities and links", () => {
  it("reads a type from the icon when no details are stored", () => {
    const d = createDiagram("Net", "professional", "network");
    const phone = createNode("icon", 0, 0, { icon: "phone" });
    expect(entityOf(d, phone).type).toBe("phone");
    expect(entityOf(d, createNode("rectangle", 0, 0)).type).toBe("other");
  });

  it("changes types, details and link dates", () => {
    let d = chain();
    const a = byName(d, "a");
    d = setEntityType(d, [a.id], "vehicle");
    expect(byName(d, "a").icon).toBe(ENTITY_INFO.vehicle.icon);
    expect(byName(d, "a").stroke).toBe(ENTITY_INFO.vehicle.color);
    d = updateEntity(d, a.id, { attributes: [{ key: "Registration", value: "AB12 CDE" }] });
    expect(entityOf(d, byName(d, "a"))).toMatchObject({
      type: "vehicle",
      attributes: [{ key: "Registration" }],
    });
    const edge = d.edges[0];
    if (!edge) throw new Error("no edge");
    d = valid(setLinkDates(d, edge.id, { date: "2025-03-01", endDate: "2025-02-01" }));
    expect(linkOf(d, edge)).toEqual({ id: edge.id, date: "2025-03-01", endDate: null });
    d = setLinkDates(d, edge.id, { date: null, endDate: null });
    expect(d.network?.links).toHaveLength(0);
  });

  it("merges duplicates into the first entity", () => {
    let d = chain();
    const [a, b, c] = ["a", "b", "c"].map((n) => byName(d, n));
    if (!a || !b || !c) throw new Error("nodes");
    d = updateEntity(d, c.id, { attributes: [{ key: "Alias", value: "Cee" }], notes: "Seen twice" });
    // c also knows a, so merging c into a drops the a-a loop and keeps one a-b link.
    d = { ...d, edges: [...d.edges, createEdge(c.id, a.id, { label: "knows" })] };
    const merged = valid(mergeEntities(d, [a.id, c.id]));
    expect(merged.nodes.some((n) => n.id === c.id)).toBe(false);
    expect(merged.edges.map((e) => [e.source, e.target].sort().join())).toEqual([[a.id, b.id].sort().join()]);
    expect(entityOf(merged, a)).toMatchObject({
      attributes: [{ key: "Alias", value: "Cee" }],
      notes: "Seen twice",
    });
    expect(merged.network?.entities.some((e) => e.id === c.id)).toBe(false);
  });
});

describe("analysis", () => {
  it("finds hubs, brokers, paths and separate groups", () => {
    const d = chain();
    const [a, b, c, dd] = ["a", "b", "c", "d"].map((n) => byName(d, n).id);
    expect(degrees(d).get(b ?? "")).toBe(2);
    expect(betweenness(d).get(b ?? "")).toBe(1);
    expect(betweenness(d).get(a ?? "")).toBe(0);
    expect(shortestPath(d, a ?? "", c ?? "")?.nodeIds).toEqual([a, b, c]);
    expect(shortestPath(d, a ?? "", dd ?? "")).toBeNull();
    expect(clusters(d).map((g) => g.length)).toEqual([3, 1]);
    expect(neighbours(d, b ?? "").map((n) => n.node.label)).toEqual(["a", "c"]);
  });

  it("searches names, details and notes", () => {
    const d = buildTemplate("network-investigation");
    expect(searchEntities(d, "accountant").map((n) => n.label)).toEqual(["Jo Tanaka"]);
    expect(searchEntities(d, "example bank").map((n) => n.label)).toEqual(["Account ending 4417"]);
    expect(searchEntities(d, "  ")).toEqual([]);
  });
});

describe("network layouts", () => {
  it("spreads entities out the same way every time", () => {
    const d = buildTemplate("network-investigation");
    const first = forceLayout(d);
    expect(forceLayout(d)).toEqual(first);
    const points = [...first.values()];
    let closest = Infinity;
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const p = points[i];
        const q = points[j];
        if (p && q) closest = Math.min(closest, Math.hypot(p.x - q.x, p.y - q.y));
      }
    expect(closest).toBeGreaterThan(60);
    expect(circleLayout(d).size).toBe(10);
    const alex = byName(d, "Alex Mercer");
    const ego = egoLayout(d, alex.id);
    expect(ego.get(alex.id)).toEqual({ x: alex.x, y: alex.y });
  });
});

describe("building network maps in the editor", () => {
  beforeEach(() => {
    useEditor.getState().load(chain());
  });

  it("links without arrows and drops details of deleted entities", () => {
    const state = useEditor.getState();
    const d = state.diagram;
    if (!d) throw new Error("no diagram");
    const id = state.connect(byName(d, "a").id, byName(d, "d").id);
    const edge = useEditor.getState().diagram?.edges.find((e) => e.id === id);
    expect(edge?.arrowEnd).toBe("none");
    state.select({ nodeIds: [byName(d, "d").id] });
    useEditor.getState().deleteSelection();
    const after = useEditor.getState().diagram;
    expect(after && valid(after).network?.entities).toHaveLength(3);
  });
});

describe("network import and export", () => {
  const csv = [
    "Caller,Callee,Type,Date",
    "07700 900111,07700 900222,call,2025-01-03 09:10",
    "07700 900111,07700 900222,call,05/01/2025",
    "07700 900111,07700 900222,call,2025-01-02",
    "07700 900222,someone@example.com,email,2025-01-04",
    "07700 900222,07700 900222,call,2025-01-04",
  ].join("\n");

  it("builds a map from call records, grouping repeated links", () => {
    expect(isNetworkCsv(csv)).toBe(true);
    const result = importLinksCsv(csv, "Calls");
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(result.skipped).toBe(1);
    expect(d.nodes.map((n) => entityOf(d, n).type)).toEqual(["phone", "phone", "email"]);
    const calls = d.edges.find((e) => e.label === "call ×3");
    expect(calls && linkOf(d, calls)).toMatchObject({ date: "2025-01-02", endDate: "2025-01-05" });
    expect(calls?.arrowEnd).toBe("arrow");
  });

  it("round-trips its own CSV and opens CSVs from My diagrams", () => {
    const original = buildTemplate("network-investigation");
    const text = linksToCsv(original);
    expect(text.split("\n")[0]).toBe("From,From type,To,To type,Type,Strength,Date,End date");
    const result = importText(text, "export.csv");
    if (!result.ok) throw new Error(result.error);
    const d = valid(result.diagram);
    expect(d.chartType).toBe("network");
    expect(itemCount(d)).toBe(itemCount(original));
    expect(entityOf(d, byName(d, "Bluefin Holdings")).type).toBe("organisation");
    expect(d.edges.find((e) => e.label === "seen driving")?.strokePattern).toBe("dotted");
  });

  it("reports bad simple-spec links", () => {
    const bad = parseSimpleSpec({
      type: "network",
      entities: [{ id: "a" }],
      links: [{ from: "a", to: "x" }],
    });
    expect(!bad.ok && bad.error).toMatch(/unknown entity/);
  });
});

describe("network collaboration", () => {
  it("syncs entity details and drops details of entities deleted elsewhere", () => {
    const original = chain();
    const a = byName(original, "a");
    const theirs = updateEntity(original, a.id, { notes: "From the other side" });
    const patch = diffDiagrams(original, theirs);
    if (!patch) throw new Error("no patch");
    const mine = {
      ...original,
      nodes: original.nodes.filter((n) => n.id !== a.id),
      edges: original.edges.slice(1),
    };
    const merged = valid(applyPatch(mine, patch));
    expect(merged.network?.entities.some((e) => e.id === a.id)).toBe(false);
    const kept = valid(applyPatch(original, patch));
    expect(entityOf(kept, a).notes).toBe("From the other side");
  });
});
