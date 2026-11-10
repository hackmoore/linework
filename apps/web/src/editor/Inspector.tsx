import type { ReactElement, ReactNode } from "react";
import {
  ARROWHEADS,
  EDGE_ROUTINGS,
  SHAPE_KINDS,
  STROKE_PATTERNS,
  TEXT_ALIGNS,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
} from "@linework/shared";
import { DIAGRAM_STYLES, STYLE_IDS } from "../diagram/styles";
import { ICONS } from "../library/icons";
import { saveShape } from "../library/savedShapes";
import {
  alignBoxes,
  distributeBoxes,
  layeredLayout,
  withPositions,
  type AlignMode,
  type LayoutDirection,
} from "./arrange";
import { selectedSnippet } from "./clipboard";
import { addLayer, deleteLayer, moveLayer, moveSelectionToLayer, updateLayer } from "./layers";
import { applyTheme, THEMES } from "./themes";
import { editableLayerIds, useEditor } from "./store";

const SWATCHES = ["#1f2937", "#1a56db", "#1e7e34", "#b45309", "#b91c1c", "#6d28d9", "#ffffff"];
const FILL_SWATCHES = [
  "transparent",
  "#ffffff",
  "#e8f0fe",
  "#e6f4ea",
  "#fff4e0",
  "#fde8e8",
  "#f1ebff",
  "#fff3b0",
];

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The shared value of a property across items, or undefined when they differ. */
function common<T, K extends keyof T>(items: readonly T[], key: K): T[K] | undefined {
  const first = items[0];
  if (!first) return undefined;
  const value = first[key];
  return items.every((item) => item[key] === value) ? value : undefined;
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="inspector__section">
      <h3 className="inspector__heading">{title}</h3>
      {children}
    </section>
  );
}

interface ColorFieldProps {
  readonly label: string;
  readonly value: string | undefined;
  readonly swatches: readonly string[];
  readonly onChange: (value: string) => void;
}

function ColorField({ label, value, swatches, onChange }: ColorFieldProps): ReactElement {
  const pickerValue = value && value !== "transparent" ? value.slice(0, 7) : "#ffffff";
  return (
    <div className="inspector__field">
      <span className="inspector__label">{label}</span>
      <div className="swatches" role="group" aria-label={label}>
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`swatch${swatch === "transparent" ? " swatch--none" : ""}${value === swatch ? " swatch--active" : ""}`}
            style={swatch === "transparent" ? undefined : { background: swatch }}
            title={swatch === "transparent" ? "None" : swatch}
            aria-label={swatch === "transparent" ? "No fill" : swatch}
            aria-pressed={value === swatch}
            onClick={() => {
              onChange(swatch);
            }}
          />
        ))}
        <input
          type="color"
          className="swatch swatch--picker"
          aria-label={`Custom ${label.toLowerCase()}`}
          value={pickerValue}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </div>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  readonly label: string;
  readonly value: T | undefined;
  readonly options: readonly T[];
  readonly onChange: (value: T) => void;
  readonly format?: (value: T) => string;
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  format = titleCase,
}: SelectFieldProps<T>): ReactElement {
  return (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      <select
        className="select"
        value={value ?? ""}
        onChange={(event) => {
          onChange(event.target.value as T);
        }}
      >
        {value === undefined && <option value="">Mixed</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
}

function NumberField({ label, value, min, max, step = 1, onChange }: NumberFieldProps): ReactElement {
  return (
    <label className="inspector__field">
      <span className="inspector__label">{label}</span>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder="Mixed"
        onChange={(event) => {
          const n = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
}

function NodeInspector({ nodes }: { nodes: readonly DiagramNode[] }): ReactElement {
  const { updateNodes, reorderSelection, deleteSelection, duplicateSelection } = useEditor.getState();
  const layers = useEditor((s) => s.diagram?.layers ?? []);
  const ids = nodes.map((n) => n.id);
  const update = (patch: Partial<Omit<DiagramNode, "id">>): void => {
    updateNodes(ids, patch);
  };
  return (
    <>
      <Section title={nodes.length === 1 ? "Shape" : `${nodes.length} shapes`}>
        <SelectField
          label="Kind"
          value={common(nodes, "kind")}
          options={SHAPE_KINDS}
          onChange={(kind) => {
            update(kind === "icon" ? { kind, icon: common(nodes, "icon") ?? "star" } : { kind });
          }}
        />
        {nodes.every((n) => n.kind === "icon") && (
          <label className="inspector__field">
            <span className="inspector__label">Icon</span>
            <select
              className="select"
              value={common(nodes, "icon") ?? ""}
              onChange={(event) => {
                update({ icon: event.target.value });
              }}
            >
              {common(nodes, "icon") === undefined && <option value="">Mixed</option>}
              {ICONS.map((icon) => (
                <option key={icon.id} value={icon.id}>
                  {icon.category}: {icon.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <ColorField
          label="Fill"
          value={common(nodes, "fill")}
          swatches={FILL_SWATCHES}
          onChange={(fill) => {
            update({ fill });
          }}
        />
        <ColorField
          label="Stroke"
          value={common(nodes, "stroke")}
          swatches={SWATCHES}
          onChange={(stroke) => {
            update({ stroke });
          }}
        />
        <div className="inspector__row">
          <NumberField
            label="Width"
            value={common(nodes, "strokeWidth")}
            min={0}
            max={20}
            onChange={(strokeWidth) => {
              update({ strokeWidth });
            }}
          />
          <SelectField
            label="Line"
            value={common(nodes, "strokePattern")}
            options={STROKE_PATTERNS}
            onChange={(strokePattern) => {
              update({ strokePattern });
            }}
          />
        </div>
      </Section>
      <Section title="Text">
        <ColorField
          label="Colour"
          value={common(nodes, "textColor")}
          swatches={SWATCHES}
          onChange={(textColor) => {
            update({ textColor });
          }}
        />
        <div className="inspector__row">
          <NumberField
            label="Size"
            value={common(nodes, "fontSize")}
            min={6}
            max={200}
            onChange={(fontSize) => {
              update({ fontSize });
            }}
          />
          <SelectField
            label="Align"
            value={common(nodes, "textAlign")}
            options={TEXT_ALIGNS}
            onChange={(textAlign) => {
              update({ textAlign });
            }}
          />
        </div>
      </Section>
      {nodes.length > 1 && <AlignSection nodes={nodes} />}
      <Section title="Arrange">
        {layers.length > 1 && (
          <SelectField
            label="Layer"
            value={common(nodes, "layerId")}
            options={layers.map((l) => l.id)}
            format={(id) => layers.find((l) => l.id === id)?.name ?? id}
            onChange={moveSelectionToLayer}
          />
        )}
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              reorderSelection("front");
            }}
          >
            Bring to front
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              reorderSelection("back");
            }}
          >
            Send to back
          </button>
          <button type="button" className="btn btn--sm" onClick={duplicateSelection}>
            Duplicate
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              const snippet = selectedSnippet();
              if (!snippet) return;
              const name = window.prompt(
                "Name for this library item",
                (nodes[0]?.label.split("\n")[0] ?? "") || "My shape",
              );
              if (name !== null) saveShape(name.trim() || "My shape", snippet);
            }}
          >
            Save to library
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Section>
    </>
  );
}

function AlignSection({ nodes }: { nodes: readonly DiagramNode[] }): ReactElement {
  const apply = (positions: Map<string, { x: number; y: number }>): void => {
    useEditor.getState().commit((d) => withPositions(d, positions));
  };
  const align = (mode: AlignMode): void => {
    apply(alignBoxes(nodes, mode));
  };
  const ALIGN: readonly [AlignMode, string, string][] = [
    ["left", "Align left", "M4 3v18M8 7h12M8 15h7"],
    ["center", "Align centres horizontally", "M12 3v18M6 7h12M8.5 15h7"],
    ["right", "Align right", "M20 3v18M4 7h12M9 15h7"],
    ["top", "Align top", "M3 4h18M7 8v12M15 8v7"],
    ["middle", "Align middles vertically", "M3 12h18M7 6v12M15 8.5v7"],
    ["bottom", "Align bottom", "M3 20h18M7 4v12M15 9v7"],
  ];
  return (
    <Section title="Align">
      <div className="icon-row" role="group" aria-label="Align">
        {ALIGN.map(([mode, label, d]) => (
          <button
            key={mode}
            type="button"
            className="icon-btn icon-btn--lg"
            title={label}
            aria-label={label}
            onClick={() => {
              align(mode);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d={d} />
            </svg>
          </button>
        ))}
      </div>
      <div className="inspector__actions">
        <button
          type="button"
          className="btn btn--sm"
          disabled={nodes.length < 3}
          onClick={() => {
            apply(distributeBoxes(nodes, "horizontal"));
          }}
        >
          Space horizontally
        </button>
        <button
          type="button"
          className="btn btn--sm"
          disabled={nodes.length < 3}
          onClick={() => {
            apply(distributeBoxes(nodes, "vertical"));
          }}
        >
          Space vertically
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            autoLayout(
              "TB",
              nodes.map((n) => n.id),
            );
          }}
        >
          Tidy up
        </button>
      </div>
    </Section>
  );
}

/** Lays out the given shapes (or every unlocked, non-group shape) along their connectors. */
export function autoLayout(direction: LayoutDirection, ids?: readonly string[]): void {
  const state = useEditor.getState();
  const diagram = state.diagram;
  if (!diagram) return;
  const editable = editableLayerIds(diagram);
  const wanted = ids ? new Set(ids) : null;
  const nodes = diagram.nodes.filter(
    (n) => editable.has(n.layerId) && n.kind !== "container" && (!wanted || wanted.has(n.id)),
  );
  state.commit((d) => withPositions(d, layeredLayout(nodes, d.edges, direction)));
}

function MiniIcon({ d }: { d: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function LayersSection({ diagram }: { diagram: Diagram }): ReactElement {
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const { setActiveLayer } = useEditor.getState();
  // Show the top layer first, like most design tools.
  const ordered = [...diagram.layers].reverse();
  return (
    <Section title="Layers">
      <ul className="layer-list">
        {ordered.map((layer) => {
          const count = diagram.nodes.filter((n) => n.layerId === layer.id).length;
          const index = diagram.layers.indexOf(layer);
          return (
            <li
              key={layer.id}
              className={`layer-list__item${layer.id === activeLayerId ? " layer-list__item--active" : ""}`}
            >
              <button
                type="button"
                className="icon-btn"
                aria-pressed={layer.visible}
                title={layer.visible ? "Hide layer" : "Show layer"}
                aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                onClick={() => {
                  updateLayer(layer.id, { visible: !layer.visible });
                }}
              >
                <MiniIcon
                  d={
                    layer.visible
                      ? "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"
                      : "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.5 6 10 6a9.6 9.6 0 0 0 4.4-1.1"
                  }
                />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-pressed={layer.locked}
                title={layer.locked ? "Unlock layer" : "Lock layer"}
                aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
                onClick={() => {
                  updateLayer(layer.id, { locked: !layer.locked });
                }}
              >
                <MiniIcon
                  d={
                    layer.locked
                      ? "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"
                      : "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2"
                  }
                />
              </button>
              <button
                type="button"
                className="layer-list__name"
                title="Add new shapes to this layer"
                onClick={() => {
                  setActiveLayer(layer.id);
                }}
                onDoubleClick={() => {
                  const name = window.prompt("Rename layer", layer.name);
                  if (name?.trim()) updateLayer(layer.id, { name: name.trim().slice(0, 100) });
                }}
              >
                {layer.name} <small>{count}</small>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${layer.name} up`}
                disabled={index === diagram.layers.length - 1}
                onClick={() => {
                  moveLayer(layer.id, 1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${layer.name} down`}
                disabled={index === 0}
                onClick={() => {
                  moveLayer(layer.id, -1);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Delete ${layer.name}`}
                disabled={diagram.layers.length <= 1}
                onClick={() => {
                  if (
                    count === 0 ||
                    window.confirm(
                      `Delete "${layer.name}" and its ${String(count)} shape${count === 1 ? "" : "s"}?`,
                    )
                  )
                    deleteLayer(layer.id);
                }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <div className="inspector__actions">
        <button type="button" className="btn btn--sm" onClick={() => void addLayer()}>
          + Layer
        </button>
      </div>
      <p className="inspector__hint">
        New shapes go on the highlighted layer. Double-click a name to rename it.
      </p>
    </Section>
  );
}

function EdgeInspector({ edges }: { edges: readonly DiagramEdge[] }): ReactElement {
  const { updateEdges, deleteSelection } = useEditor.getState();
  const ids = edges.map((e) => e.id);
  const update = (patch: Partial<Omit<DiagramEdge, "id" | "source" | "target">>): void => {
    updateEdges(ids, patch);
  };
  return (
    <Section title={edges.length === 1 ? "Connector" : `${edges.length} connectors`}>
      <ColorField
        label="Colour"
        value={common(edges, "stroke")}
        swatches={SWATCHES}
        onChange={(stroke) => {
          update({ stroke });
        }}
      />
      <div className="inspector__row">
        <NumberField
          label="Width"
          value={common(edges, "strokeWidth")}
          min={0.5}
          max={20}
          step={0.5}
          onChange={(strokeWidth) => {
            update({ strokeWidth });
          }}
        />
        <SelectField
          label="Line"
          value={common(edges, "strokePattern")}
          options={STROKE_PATTERNS}
          onChange={(strokePattern) => {
            update({ strokePattern });
          }}
        />
      </div>
      <SelectField
        label="Routing"
        value={common(edges, "routing")}
        options={EDGE_ROUTINGS}
        onChange={(routing) => {
          update({ routing });
        }}
      />
      <div className="inspector__row">
        <SelectField
          label="Start"
          value={common(edges, "arrowStart")}
          options={ARROWHEADS}
          onChange={(arrowStart) => {
            update({ arrowStart });
          }}
        />
        <SelectField
          label="End"
          value={common(edges, "arrowEnd")}
          options={ARROWHEADS}
          onChange={(arrowEnd) => {
            update({ arrowEnd });
          }}
        />
      </div>
      <div className="inspector__actions">
        <button type="button" className="btn btn--sm btn--danger" onClick={deleteSelection}>
          Delete
        </button>
      </div>
    </Section>
  );
}

export function Inspector(): ReactElement | null {
  const diagram = useEditor((s) => s.diagram);
  const selection = useEditor((s) => s.selection);
  if (!diagram) return null;
  const nodes = diagram.nodes.filter((n) => selection.nodeIds.includes(n.id));
  const edges = diagram.edges.filter((e) => selection.edgeIds.includes(e.id));
  const { setStyle, setBackground } = useEditor.getState();
  return (
    <div className="inspector__content" aria-label="Properties">
      {nodes.length > 0 && <NodeInspector nodes={nodes} />}
      {edges.length > 0 && <EdgeInspector edges={edges} />}
      {nodes.length === 0 && edges.length === 0 && (
        <Section title="Diagram">
          <div className="inspector__field">
            <span className="inspector__label">Style</span>
            <div className="style-options" role="radiogroup" aria-label="Diagram style">
              {STYLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={diagram.styleId === id}
                  className={`style-option${diagram.styleId === id ? " style-option--active" : ""}`}
                  style={{ fontFamily: DIAGRAM_STYLES[id].fontFamily }}
                  onClick={() => {
                    setStyle(id);
                  }}
                >
                  <strong>{DIAGRAM_STYLES[id].name}</strong>
                  <span>{DIAGRAM_STYLES[id].description}</span>
                </button>
              ))}
            </div>
          </div>
          <ColorField
            label="Background"
            value={diagram.background}
            swatches={["transparent", "#ffffff", "#f8f7f2", "#f1f5f9", "#111827"]}
            onChange={setBackground}
          />
          <div className="inspector__field">
            <span className="inspector__label">Colour theme</span>
            <div className="theme-options" role="group" aria-label="Colour theme">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className="theme-option"
                  title={`Recolour the diagram: ${theme.name}`}
                  onClick={() => {
                    useEditor.getState().commit((d) => applyTheme(d, theme));
                  }}
                >
                  <span
                    className="theme-option__swatch"
                    style={{ background: theme.background, borderColor: theme.stroke }}
                  >
                    <span style={{ background: theme.fills[1] }} />
                    <span style={{ background: theme.fills[2] }} />
                  </span>
                  {theme.name}
                </button>
              ))}
            </div>
          </div>
          <div className="inspector__field">
            <span className="inspector__label">Automatic layout</span>
            <div className="inspector__actions">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  autoLayout("TB");
                }}
              >
                Top to bottom
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  autoLayout("LR");
                }}
              >
                Left to right
              </button>
            </div>
          </div>
          <p className="inspector__hint">
            Select a shape or connector to edit it. Double-click the canvas to add text.
          </p>
        </Section>
      )}
      {nodes.length === 0 && edges.length === 0 && <LayersSection diagram={diagram} />}
    </div>
  );
}
