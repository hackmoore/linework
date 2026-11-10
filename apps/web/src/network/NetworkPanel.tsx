import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  ENTITY_TYPES,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type EntityAttribute,
  type EntityType,
} from "@linework/shared";
import { CHART_TYPE_INFO } from "../charts/chartTypes";
import { useEditor } from "../editor/store";
import { CommitInput, CommitTextarea, DateInput } from "../gantt/inputs";
import { networkActions } from "./actions";
import {
  betweenness,
  clusters,
  degrees,
  ENTITY_INFO,
  entityOf,
  isEntityNode,
  linkOf,
  neighbours,
  searchEntities,
  shortestPath,
  STRENGTHS,
} from "./model";

/** Above this many entities, betweenness (which is slow on big maps) isn't computed. */
const BETWEENNESS_LIMIT = 1_500;

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="inspector__section">
      <h3 className="inspector__heading">{title}</h3>
      {children}
    </section>
  );
}

const nameOf = (n: DiagramNode): string =>
  n.label.trim() || `Unnamed ${ENTITY_INFO.other.label.toLowerCase()}`;

function TypeSelect({
  value,
  onChange,
}: {
  value: EntityType | undefined;
  onChange: (type: EntityType) => void;
}): ReactElement {
  return (
    <label className="inspector__field">
      <span className="inspector__label">Type</span>
      <select
        className="select"
        value={value ?? ""}
        onChange={(event) => {
          onChange(event.target.value as EntityType);
        }}
      >
        {value === undefined && <option value="">Mixed</option>}
        {ENTITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {ENTITY_INFO[t].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Attributes({ diagram, node }: { diagram: Diagram; node: DiagramNode }): ReactElement {
  const entity = entityOf(diagram, node);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const save = (attributes: EntityAttribute[]): void => {
    networkActions.updateEntity(node.id, { attributes });
  };
  const suggestions = ENTITY_INFO[entity.type].attributes.filter(
    (s) => !entity.attributes.some((a) => a.key === s),
  );
  const add = (): void => {
    const k = key.trim().slice(0, 60);
    if (!k || entity.attributes.length >= 40) return;
    save([...entity.attributes, { key: k, value: value.trim().slice(0, 500) }]);
    setKey("");
    setValue("");
  };
  return (
    <div className="inspector__field">
      <span className="inspector__label">Details</span>
      {entity.attributes.length > 0 && (
        <ul className="network-attrs">
          {entity.attributes.map((a, i) => (
            <li key={`${a.key}-${String(i)}`} className="network-attrs__row">
              <span className="network-attrs__key" title={a.key}>
                {a.key}
              </span>
              <CommitInput
                key={a.value}
                className="input network-attrs__value"
                label={a.key}
                maxLength={500}
                value={a.value}
                onCommit={(next) => {
                  save(entity.attributes.map((x, j) => (j === i ? { ...x, value: next.trim() } : x)));
                }}
              />
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Remove ${a.key}`}
                onClick={() => {
                  save(entity.attributes.filter((_, j) => j !== i));
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="network-attrs__row"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          className="input network-attrs__new-key"
          aria-label="Detail name"
          placeholder={suggestions[0] ?? "Detail"}
          list={`attr-suggestions-${node.id}`}
          value={key}
          maxLength={60}
          onChange={(event) => {
            setKey(event.target.value);
          }}
        />
        <datalist id={`attr-suggestions-${node.id}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input
          className="input network-attrs__value"
          aria-label="Detail value"
          placeholder="Value"
          value={value}
          maxLength={500}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <button type="submit" className="icon-btn" aria-label="Add detail" disabled={!key.trim()}>
          +
        </button>
      </form>
    </div>
  );
}

function Connections({ diagram, node }: { diagram: Diagram; node: DiagramNode }): ReactElement {
  const list = neighbours(diagram, node.id);
  const { select } = useEditor.getState();
  return (
    <div className="inspector__field">
      <span className="inspector__label">
        Linked to {list.length === 0 ? "nothing yet" : String(new Set(list.map((l) => l.node.id)).size)}
      </span>
      {list.length > 0 && (
        <ul className="network-links">
          {list.map(({ node: other, edge, direction }) => (
            <li key={edge.id}>
              <button
                type="button"
                className="network-links__item"
                onClick={() => {
                  select({ nodeIds: [other.id] });
                }}
              >
                <span className="network-links__dot" style={{ background: other.stroke }} />
                <span className="network-links__name">{nameOf(other)}</span>
                <span className="network-links__type">
                  {direction === "out" ? "→ " : direction === "in" ? "← " : ""}
                  {edge.label || "linked"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              select({
                nodeIds: [node.id, ...list.map((l) => l.node.id)],
                edgeIds: list.map((l) => l.edge.id),
              });
            }}
          >
            Select linked
          </button>
          <button
            type="button"
            className="btn btn--sm"
            title="Put this entity in the middle, its links in a ring around it and everything else outside"
            onClick={() => {
              networkActions.layout("focus", node.id);
            }}
          >
            Focus layout
          </button>
        </div>
      )}
    </div>
  );
}

/** Network controls for selected entities. */
export function EntitySection({
  diagram,
  nodes,
}: {
  diagram: Diagram;
  nodes: readonly DiagramNode[];
}): ReactElement | null {
  const entities = nodes.filter(isEntityNode);
  if (entities.length === 0) return null;
  const types = new Set(entities.map((n) => entityOf(diagram, n).type));
  const type = types.size === 1 ? [...types][0] : undefined;
  const only = entities.length === 1 ? entities[0] : undefined;
  const ids = entities.map((n) => n.id);
  const pair = entities.length === 2 ? entities : null;
  const path = pair?.[0] && pair[1] ? shortestPath(diagram, pair[0].id, pair[1].id) : null;
  return (
    <Section title={only ? ENTITY_INFO[type ?? "other"].label : `${String(entities.length)} entities`}>
      <TypeSelect
        value={type}
        onChange={(t) => {
          networkActions.setType(ids, t);
        }}
      />
      {only && <Attributes key={only.id} diagram={diagram} node={only} />}
      {only && (
        <label className="inspector__field">
          <span className="inspector__label">Notes</span>
          <CommitTextarea
            key={entityOf(diagram, only).notes}
            className="input"
            label="Notes"
            value={entityOf(diagram, only).notes}
            placeholder="Sources, aliases, anything else"
            onCommit={(notes) => {
              networkActions.updateEntity(only.id, { notes });
            }}
          />
        </label>
      )}
      {only && <Connections diagram={diagram} node={only} />}
      {pair && (
        <div className="inspector__field">
          <span className="inspector__label">Connection</span>
          {path ? (
            <>
              <p className="inspector__hint">
                {path.edgeIds.length === 1
                  ? "Linked directly."
                  : `Linked through ${String(path.edgeIds.length - 1)} ${path.edgeIds.length === 2 ? "entity" : "entities"}.`}
              </p>
              <div className="inspector__actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    useEditor.getState().select({ nodeIds: path.nodeIds, edgeIds: path.edgeIds });
                  }}
                >
                  Show shortest path
                </button>
              </div>
            </>
          ) : (
            <p className="inspector__hint">These two aren&apos;t connected, even indirectly.</p>
          )}
        </div>
      )}
      {entities.length > 1 && (
        <div className="inspector__actions">
          <button
            type="button"
            className="btn btn--sm"
            title="Combine duplicates into the first selected entity"
            onClick={() => {
              const first = entities[0];
              if (
                first &&
                window.confirm(
                  `Merge ${String(entities.length)} entities into "${nameOf(first)}"? Their links, details and notes move to it.`,
                )
              )
                networkActions.merge(ids);
            }}
          >
            Merge duplicates
          </button>
        </div>
      )}
    </Section>
  );
}

/** Network controls for selected links: how sure, which way, and when. */
export function LinkSection({
  diagram,
  edges,
}: {
  diagram: Diagram;
  edges: readonly DiagramEdge[];
}): ReactElement {
  const ids = edges.map((e) => e.id);
  const patterns = new Set(edges.map((e) => e.strokePattern));
  const pattern = patterns.size === 1 ? [...patterns][0] : undefined;
  const only = edges.length === 1 ? edges[0] : undefined;
  const link = only ? linkOf(diagram, only) : null;
  const directionOf = (e: DiagramEdge): string =>
    e.arrowStart !== "none" && e.arrowEnd !== "none"
      ? "both"
      : e.arrowEnd !== "none"
        ? "forward"
        : e.arrowStart !== "none"
          ? "back"
          : "none";
  const directions = new Set(edges.map(directionOf));
  const direction = directions.size === 1 ? [...directions][0] : undefined;
  const { updateEdges } = useEditor.getState();
  return (
    <Section title={only ? "Link" : `${String(edges.length)} links`}>
      <div className="inspector__field">
        <span className="inspector__label">How sure</span>
        <div className="segmented segmented--full" role="radiogroup" aria-label="How sure">
          {STRENGTHS.map(([p, label, hint]) => (
            <button
              key={p}
              type="button"
              role="radio"
              title={hint}
              aria-checked={pattern === p}
              className={`segmented__option${pattern === p ? " segmented__option--active" : ""}`}
              onClick={() => {
                networkActions.setStrength(ids, p);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector__field">
        <span className="inspector__label">Direction</span>
        <div className="segmented segmented--full" role="radiogroup" aria-label="Direction">
          {(
            [
              ["none", "None", { arrowStart: "none", arrowEnd: "none" }],
              ["forward", "→", { arrowStart: "none", arrowEnd: "arrow" }],
              ["back", "←", { arrowStart: "arrow", arrowEnd: "none" }],
              ["both", "↔", { arrowStart: "arrow", arrowEnd: "arrow" }],
            ] as const
          ).map(([id, label, patch]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={direction === id}
              className={`segmented__option${direction === id ? " segmented__option--active" : ""}`}
              onClick={() => {
                updateEdges(ids, patch);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {only && link && (
        <div className="inspector__field">
          <span className="inspector__label">When</span>
          <div className="network-dates">
            <DateInput
              className="input"
              label="From"
              value={link.date ?? ""}
              onCommit={(date) => {
                networkActions.setLinkDates(only.id, { date, endDate: link.endDate });
              }}
            />
            <span aria-hidden="true">to</span>
            <DateInput
              className="input"
              label="To"
              value={link.endDate ?? ""}
              {...(link.date ? { min: link.date } : {})}
              onCommit={(endDate) => {
                networkActions.setLinkDates(only.id, { date: link.date, endDate });
              }}
            />
          </div>
          {(link.date ?? link.endDate) && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                networkActions.setLinkDates(only.id, { date: null, endDate: null });
              }}
            >
              Clear dates
            </button>
          )}
        </div>
      )}
      <p className="inspector__hint">
        The link&apos;s label is its type, such as &quot;calls&quot; or &quot;director of&quot;. Double-click
        a link to edit it.
      </p>
    </Section>
  );
}

function EntityButton({ node, detail }: { node: DiagramNode; detail: string }): ReactElement {
  return (
    <button
      type="button"
      className="network-links__item"
      onClick={() => {
        useEditor.getState().select({ nodeIds: [node.id] });
      }}
    >
      <span className="network-links__dot" style={{ background: node.stroke }} />
      <span className="network-links__name">{nameOf(node)}</span>
      <span className="network-links__type">{detail}</span>
    </button>
  );
}

/** Network map settings and analysis, shown when nothing is selected. */
export function NetworkSettings({ diagram }: { diagram: Diagram }): ReactElement {
  const [query, setQuery] = useState("");
  const entities = useMemo(() => diagram.nodes.filter(isEntityNode), [diagram.nodes]);
  const byId = useMemo(() => new Map(entities.map((n) => [n.id, n])), [entities]);
  const analysis = useMemo(() => {
    const degree = degrees(diagram);
    const between = entities.length <= BETWEENNESS_LIMIT ? betweenness(diagram) : null;
    const groups = clusters(diagram);
    return { degree, between, groups };
    // Recompute only when the structure changes, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram.nodes.length, diagram.edges]);
  const top = (scores: Map<string, number> | null): [DiagramNode, number][] =>
    scores
      ? [...scores]
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .flatMap(([id, v]) => {
            const node = byId.get(id);
            return node ? [[node, v] as [DiagramNode, number]] : [];
          })
      : [];
  const counts = new Map<EntityType, string[]>();
  for (const n of entities) {
    const t = entityOf(diagram, n).type;
    counts.set(t, [...(counts.get(t) ?? []), n.id]);
  }
  const matches = searchEntities(diagram, query);
  const info = CHART_TYPE_INFO.network;
  const { select } = useEditor.getState();
  return (
    <>
      <Section title="Find">
        <form
          className="network-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches.length > 0) select({ nodeIds: matches.map((n) => n.id) });
          }}
        >
          <input
            className="input"
            type="search"
            aria-label="Find entities"
            placeholder="Name, detail or note"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <button type="submit" className="btn btn--sm" disabled={matches.length === 0}>
            Select {query.trim() ? String(matches.length) : ""}
          </button>
        </form>
      </Section>
      <Section title="Layout">
        <div className="inspector__actions">
          {(
            [
              ["organic", "Organic", "Linked entities pull together and clusters separate"],
              ["circle", "Circle", "Everything in a ring, most connected first"],
              ["hierarchy", "Hierarchy", "Layers along the direction of the links"],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              className="btn btn--sm"
              title={hint}
              disabled={entities.length === 0}
              onClick={() => {
                networkActions.layout(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Key entities">
        {entities.length === 0 ? (
          <p className="inspector__hint">Add entities from the toolbar on the left, then link them.</p>
        ) : top(analysis.degree).length === 0 ? (
          <p className="inspector__hint">Link entities to see who is most connected.</p>
        ) : (
          <>
            <span className="inspector__label">Most links</span>
            <ul className="network-links">
              {top(analysis.degree).map(([node, v]) => (
                <li key={node.id}>
                  <EntityButton node={node} detail={`${String(v)} linked`} />
                </li>
              ))}
            </ul>
            {top(analysis.between).length > 0 && (
              <>
                <span className="inspector__label" title="Entities that sit on the paths between others">
                  Go-betweens
                </span>
                <ul className="network-links">
                  {top(analysis.between).map(([node, v]) => (
                    <li key={node.id}>
                      <EntityButton node={node} detail={`${String(Math.round(v))} paths`} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Section>
      {entities.length > 0 && (
        <Section title="Breakdown">
          <ul className="network-links">
            {ENTITY_TYPES.filter((t) => counts.has(t)).map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className="network-links__item"
                  onClick={() => {
                    select({ nodeIds: counts.get(t) ?? [] });
                  }}
                >
                  <span className="network-links__dot" style={{ background: ENTITY_INFO[t].color }} />
                  <span className="network-links__name">{ENTITY_INFO[t].label}</span>
                  <span className="network-links__type">{String(counts.get(t)?.length ?? 0)}</span>
                </button>
              </li>
            ))}
          </ul>
          {analysis.groups.length > 1 && (
            <>
              <span className="inspector__label">{analysis.groups.length} separate groups</span>
              <div className="inspector__actions">
                {analysis.groups.slice(0, 6).map((group, i) => (
                  <button
                    key={group[0] ?? i}
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      select({ nodeIds: group });
                    }}
                  >
                    {group.length === 1 ? "1 entity" : `${String(group.length)} entities`}
                  </button>
                ))}
              </div>
            </>
          )}
        </Section>
      )}
      <Section title="Working with network maps">
        <dl className="guide-objects">
          {info.objects.map((o) => (
            <div key={o.name}>
              <dt>{o.name}</dt>
              <dd>{o.description}</dd>
            </div>
          ))}
        </dl>
        <ul className="guide-tips">
          {info.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
