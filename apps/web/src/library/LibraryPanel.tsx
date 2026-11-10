import { useMemo, useState, type DragEvent, type ReactElement } from "react";
import { SHAPE_KINDS, type ShapeKind } from "@linework/shared";
import { createNode, DEFAULT_LABEL } from "../diagram/factory";
import { insertSnippet } from "../editor/clipboard";
import { useEditor } from "../editor/store";
import { shapePath } from "../render/geometry";
import { getIcon, ICON_CATEGORIES, searchIcons } from "./icons";
import { deleteSavedShape, useSavedShapes } from "./savedShapes";

/** What a library item drops onto the canvas. */
export type LibraryItem =
  | { readonly type: "shape"; readonly kind: ShapeKind }
  | { readonly type: "icon"; readonly icon: string }
  | { readonly type: "saved"; readonly id: string };

export const LIBRARY_MIME = "application/x-linework-library";

const SHAPE_NAMES: Partial<Record<ShapeKind, string>> = {
  rounded: "Rounded rectangle",
  diamond: "Decision",
  parallelogram: "Input / output",
  cylinder: "Database",
  note: "Sticky note",
  container: "Group",
  hexagon: "Preparation",
  document: "Document",
  cloud: "Cloud",
  actor: "Person",
};

function shapeName(kind: ShapeKind): string {
  return SHAPE_NAMES[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Adds a library item centred at a diagram point. */
export function placeLibraryItem(
  item: LibraryItem,
  at: { x: number; y: number },
  saved: ReturnType<typeof useSavedShapes>,
): void {
  const state = useEditor.getState();
  if (item.type === "shape") {
    state.addNode(item.kind, Math.round(at.x), Math.round(at.y));
  } else if (item.type === "icon") {
    state.addNode("icon", Math.round(at.x), Math.round(at.y), {
      icon: item.icon,
      label: getIcon(item.icon)?.name ?? "",
    });
  } else {
    const shape = saved.find((s) => s.id === item.id);
    if (shape) insertSnippet(shape, at);
  }
}

function ShapePreview({ kind }: { kind: ShapeKind }): ReactElement {
  const box = { x: 4, y: 6, width: 40, height: 28 };
  if (kind === "text") {
    return (
      <text x="24" y="24" textAnchor="middle" fontSize="16" fontWeight="600" fill="currentColor">
        Aa
      </text>
    );
  }
  const d = shapePath(
    kind === "icon" ? "rectangle" : kind,
    kind === "actor" ? { x: 14, y: 4, width: 20, height: 34 } : box,
    6,
  );
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray={kind === "container" ? "4 3" : undefined}
    />
  );
}

function IconPreview({ id }: { id: string }): ReactElement {
  return (
    <g transform="translate(12 8)">
      {getIcon(id)?.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

interface TileProps {
  readonly item: LibraryItem;
  readonly title: string;
  readonly children: ReactElement;
  readonly onPlace: (item: LibraryItem) => void;
  readonly onDelete?: () => void;
}

function Tile({ item, title, children, onPlace, onDelete }: TileProps): ReactElement {
  const onDragStart = (event: DragEvent<HTMLButtonElement>): void => {
    event.dataTransfer.setData(LIBRARY_MIME, JSON.stringify(item));
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div className="library-tile">
      <button
        type="button"
        className="library-tile__button"
        title={`${title} - click or drag onto the canvas`}
        draggable
        onDragStart={onDragStart}
        onClick={() => {
          onPlace(item);
        }}
      >
        <svg viewBox="0 0 48 40" width="48" height="40" aria-hidden="true">
          {children}
        </svg>
        <span>{title}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          className="library-tile__delete"
          aria-label={`Remove ${title} from My shapes`}
          onClick={onDelete}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface LibraryPanelProps {
  /** Places an item at the centre of the visible canvas. */
  readonly onPlace: (item: LibraryItem) => void;
  readonly onClose: () => void;
}

export function LibraryPanel({ onPlace, onClose }: LibraryPanelProps): ReactElement {
  const [query, setQuery] = useState("");
  const saved = useSavedShapes();
  const q = query.trim().toLowerCase();
  const shapes = useMemo(
    () =>
      SHAPE_KINDS.filter(
        (k) => k !== "icon" && (!q || `${k} ${shapeName(k)} ${DEFAULT_LABEL[k]}`.toLowerCase().includes(q)),
      ),
    [q],
  );
  const icons = useMemo(() => searchIcons(query), [query]);
  const savedMatches = saved.filter((s) => !q || s.name.toLowerCase().includes(q));
  const nothing = shapes.length === 0 && icons.length === 0 && savedMatches.length === 0;

  return (
    <aside className="library-panel" aria-label="Shape library">
      <div className="library-panel__header">
        <h2>Library</h2>
        <button type="button" className="icon-btn" aria-label="Close library" onClick={onClose}>
          ×
        </button>
      </div>
      <input
        className="input library-panel__search"
        type="search"
        placeholder="Search shapes and icons"
        aria-label="Search shapes and icons"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <div className="library-panel__scroll">
        {savedMatches.length > 0 && (
          <section>
            <h3>My shapes</h3>
            <div className="library-grid">
              {savedMatches.map((s) => {
                const sample = s.nodes[0] ?? createNode("rectangle", 0, 0);
                return (
                  <Tile
                    key={s.id}
                    item={{ type: "saved", id: s.id }}
                    title={s.name}
                    onPlace={onPlace}
                    onDelete={() => {
                      deleteSavedShape(s.id);
                    }}
                  >
                    {sample.kind === "icon" && sample.icon ? (
                      <IconPreview id={sample.icon} />
                    ) : (
                      <ShapePreview kind={sample.kind} />
                    )}
                  </Tile>
                );
              })}
            </div>
          </section>
        )}
        {shapes.length > 0 && (
          <section>
            <h3>Shapes</h3>
            <div className="library-grid">
              {shapes.map((kind) => (
                <Tile key={kind} item={{ type: "shape", kind }} title={shapeName(kind)} onPlace={onPlace}>
                  <ShapePreview kind={kind} />
                </Tile>
              ))}
            </div>
          </section>
        )}
        {ICON_CATEGORIES.map((category) => {
          const inCategory = icons.filter((i) => i.category === category);
          if (inCategory.length === 0) return null;
          return (
            <section key={category}>
              <h3>{category}</h3>
              <div className="library-grid">
                {inCategory.map((icon) => (
                  <Tile
                    key={icon.id}
                    item={{ type: "icon", icon: icon.id }}
                    title={icon.name}
                    onPlace={onPlace}
                  >
                    <IconPreview id={icon.id} />
                  </Tile>
                ))}
              </div>
            </section>
          );
        })}
        {nothing && <p className="library-panel__empty">Nothing matches &ldquo;{query}&rdquo;.</p>}
        <p className="library-panel__hint">
          Select shapes and choose &ldquo;Save to library&rdquo; to reuse them in any diagram.
        </p>
      </div>
    </aside>
  );
}
