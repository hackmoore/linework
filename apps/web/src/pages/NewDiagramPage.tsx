import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CHART_TYPES, type ChartType } from "@linework/shared";
import { CHART_TYPE_INFO, CHART_TYPE_ORDER } from "../charts/chartTypes";
import { SiteFooter, SiteHeader } from "../components/SiteHeader";
import { TemplateThumbnail } from "../components/TemplateThumbnail";
import { saveDiagram } from "../storage/localStore";
import { buildTemplate } from "../templates/build";
import { isTemplateId, templatesFor, type TemplateId } from "../templates/catalog";

// The AI dialog pulls in the Anthropic SDK; load it only when asked for.
const AiDialog = lazy(async () => ({ default: (await import("../ai/AiDialog")).AiDialog }));

function isChartType(value: string | null): value is ChartType {
  return value !== null && (CHART_TYPES as readonly string[]).includes(value);
}

/**
 * `/new` asks what kind of chart to make and explains it.
 * `/new?template=<id>` skips the question, creates the diagram and opens the editor.
 */
export function NewDiagramPage(): ReactElement {
  const [params] = useSearchParams();
  const template = params.get("template");
  return isTemplateId(template) ? <CreateFromTemplate templateId={template} /> : <ChartTypePicker />;
}

function CreateFromTemplate({ templateId }: { templateId: TemplateId }): ReactElement {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // StrictMode runs effects twice in development; only create one diagram.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const diagram = buildTemplate(templateId);
    saveDiagram(diagram).then(
      () => {
        void navigate(`/d/${diagram.id}`, { replace: true });
      },
      (cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Could not create a diagram");
      },
    );
  }, [templateId, navigate]);

  return (
    <div className="editor-message">
      {error ? (
        <>
          <h1>Couldn&apos;t open the editor</h1>
          <p className="error-text">{error}</p>
          <p>Your browser may be blocking local storage (for example in a private window).</p>
          <Link to="/" className="btn">
            Back to home
          </Link>
        </>
      ) : (
        <p>Creating diagram...</p>
      )}
    </div>
  );
}

function ChartTypePicker(): ReactElement {
  const [params, setParams] = useSearchParams();
  const requested = params.get("type");
  const selected: ChartType = isChartType(requested) ? requested : (CHART_TYPE_ORDER[0] ?? "freeform");
  const info = CHART_TYPE_INFO[selected];
  const templates = templatesFor(selected);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    document.title = "New chart - Linework";
  }, []);

  return (
    <div className="home">
      <SiteHeader />
      <main className="page-container picker">
        <div className="picker__title-row">
          <div>
            <h1>What are you making?</h1>
            <p className="picker__lede">
              Each chart type has its own objects and tools, so you only see what fits.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setAiOpen(true);
            }}
          >
            Generate with AI
          </button>
        </div>
        {aiOpen && (
          <Suspense fallback={null}>
            <AiDialog
              initialKind={selected === "freeform" ? "diagram" : selected}
              onClose={() => {
                setAiOpen(false);
              }}
            />
          </Suspense>
        )}
        <div className="picker__layout">
          <div className="picker__types" role="radiogroup" aria-label="Chart type">
            {CHART_TYPE_ORDER.map((type) => {
              const t = CHART_TYPE_INFO[type];
              const active = type === selected;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`picker__type${active ? " picker__type--active" : ""}`}
                  onClick={() => {
                    setParams({ type }, { replace: true });
                  }}
                >
                  <strong>{t.name}</strong>
                  <span>{t.tagline}</span>
                </button>
              );
            })}
            <p className="picker__more">More chart types are on the way.</p>
          </div>

          <section className="picker__detail" aria-live="polite">
            <h2>{info.name}</h2>
            <p className="picker__tagline">{info.tagline}</p>

            <h3 className="picker__heading">Good for</h3>
            <ul className="chips">
              {info.bestFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 className="picker__heading">What&apos;s in a {info.name.toLowerCase()}</h3>
            <dl className="guide-objects guide-objects--grid">
              {info.objects.map((o) => (
                <div key={o.name}>
                  <dt>{o.name}</dt>
                  <dd>{o.description}</dd>
                </div>
              ))}
            </dl>

            <h3 className="picker__heading">Tips</h3>
            <ul className="guide-tips">
              {info.tips.slice(0, 3).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>

            <h3 className="picker__heading">Choose a starting point</h3>
            <div className="picker__templates">
              {templates.map((template) => (
                <Link key={template.id} to={`/new?template=${template.id}`} className="template-card">
                  <div className="template-card__thumb">
                    <TemplateThumbnail templateId={template.id} />
                  </div>
                  <div className="template-card__body">
                    <h3>{template.name}</h3>
                    <p>{template.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
