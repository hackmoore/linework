/**
 * Upgrades documents saved by older versions to the current format. Works on untyped
 * JSON before validation; anything it doesn't recognise is passed through unchanged so
 * the schema can report a useful error.
 */

type Json = Record<string, unknown>;

export const DEFAULT_LAYER_ID = "layer-1";

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** v1 to v2: chart types, layers, comments, icons, typed gantt dependencies, calendars and baselines. */
function v1ToV2(doc: Json): Json {
  const nodes = asArray(doc.nodes).map((n) =>
    isObject(n) ? { icon: null, layerId: DEFAULT_LAYER_ID, ...n } : n,
  );
  const next: Json = {
    ...doc,
    version: 2,
    chartType: doc.chartType ?? "freeform",
    nodes,
    layers: [{ id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false }],
    comments: [],
  };
  if (isObject(doc.gantt)) {
    const gantt = doc.gantt;
    next.gantt = {
      showCriticalPath: false,
      calendar: { skipWeekends: false, holidays: [] },
      baseline: null,
      ...gantt,
      sections: asArray(gantt.sections).map((s) => (isObject(s) ? { collapsed: false, ...s } : s)),
      tasks: asArray(gantt.tasks).map((t) => {
        if (!isObject(t)) return t;
        const { dependsOn, ...rest } = t;
        return {
          ...rest,
          dependencies: asArray(dependsOn).map((taskId) => ({ taskId, type: "FS", lag: 0 })),
        };
      }),
    };
  }
  return next;
}

export function migrateDiagram(input: unknown): unknown {
  if (!isObject(input)) return input;
  let doc = input;
  if (doc.version === 1) doc = v1ToV2(doc);
  return doc;
}
