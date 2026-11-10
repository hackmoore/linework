import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router";
import { SiteFooter, SiteHeader } from "../components/SiteHeader";
import { TEMPLATE_CATALOG } from "../templates/catalog";
import { StyleShowcase } from "../components/StyleShowcase";
import { TemplateThumbnail } from "../components/TemplateThumbnail";

interface Feature {
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
}

const FEATURES: readonly Feature[] = [
  {
    title: "No account, no paywall",
    body: "Open the editor and start drawing. Every feature works without signing in.",
    icon: <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />,
  },
  {
    title: "Local-first storage",
    body: "Diagrams save to your browser automatically. Nothing leaves your machine unless you ask.",
    icon: <path d="M4 7h16v10H4zM8 21h8M12 17v4" />,
  },
  {
    title: "Hand-drawn or professional",
    body: "Switch the whole diagram between a sketchy whiteboard look and crisp presentation lines.",
    icon: <path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" />,
  },
  {
    title: "Export anywhere",
    body: "Download SVG for docs and wikis, PNG for slides, or JSON to share and re-open later.",
    icon: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  },
  {
    title: "Optional cloud sync",
    body: "Create a free account to keep up to 500 diagrams in the cloud and open them on any device.",
    icon: <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 1117 18H7z" />,
  },
  {
    title: "Open source",
    body: "MIT licensed. Self-host it, audit it, or contribute a new diagram style.",
    icon: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />,
  },
];

const STEPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: "Pick a chart type",
    body: "Gantt charts, flowcharts, architecture and more - each with guidance.",
  },
  { title: "Draw and connect", body: "Drag shapes, pull connectors between them, double-click to type." },
  { title: "Style and export", body: "Choose a look, then export SVG or PNG straight from your browser." },
];

const AI_SAMPLE = [
  "You: Read linework's llms.txt and plan our",
  "     6-week website relaunch as a Gantt chart.",
  "",
  "Assistant: Here's your plan:",
  "           Open in Linework \u2192",
].join("\n");

export function HomePage(): ReactElement {
  return (
    <div className="home">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="page-container hero__inner">
            <div className="hero__copy">
              <p className="eyebrow">Free and open source</p>
              <h1>
                Diagrams for projects and software. <span className="hero__accent">No sign-in.</span>
              </h1>
              <p className="hero__lede">
                Linework is a fast, browser-based editor for flowcharts, system architecture, kanban boards
                and roadmaps. Everything renders on your device, saves locally, and exports in one click.
              </p>
              <div className="hero__actions">
                <Link to="/new" className="btn btn--primary btn--lg">
                  Start drawing - it&apos;s free
                </Link>
                <a href="#templates" className="btn btn--lg">
                  Browse templates
                </a>
              </div>
              <p className="hero__note">No account. No watermark. No limits on local diagrams.</p>
            </div>
            <StyleShowcase />
          </div>
        </section>

        <section id="features" className="section">
          <div className="page-container">
            <h2 className="section__title">Everything you need, nothing in the way</h2>
            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="feature-card">
                  <svg
                    className="feature-card__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {feature.icon}
                  </svg>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="templates" className="section section--alt">
          <div className="page-container">
            <h2 className="section__title">Start from a template</h2>
            <p className="section__lede">Built for the diagrams teams actually make.</p>
            <div className="template-grid">
              {TEMPLATE_CATALOG.filter((t) => !t.blank).map((template) => (
                <Link key={template.id} to={`/new?template=${template.id}`} className="template-card">
                  <div className="template-card__thumb">
                    <TemplateThumbnail templateId={template.id} />
                  </div>
                  <div className="template-card__body">
                    <span className="template-card__category">{template.category}</span>
                    <h3>{template.name}</h3>
                    <p>{template.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="page-container">
            <h2 className="section__title">How it works</h2>
            <ol className="steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="steps__item">
                  <span className="steps__number">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="ai" className="section section--alt">
          <div className="page-container ai-band">
            <div>
              <p className="eyebrow">Works with your AI assistant</p>
              <h2 className="section__title ai-band__title">Ask ChatGPT, Claude or Gemini to draw it</h2>
              <p className="section__lede ai-band__lede">
                Point any assistant at our instructions and it replies with a link that opens straight into
                the editor: Gantt charts, flowcharts, architecture diagrams. Then tweak, save and export like
                any other chart.
              </p>
              <div className="hero__actions">
                <Link to="/llms" className="btn btn--primary">
                  How it works
                </Link>
                <a href="/llms.txt" className="btn">
                  llms.txt
                </a>
              </div>
            </div>
            <pre className="ai-band__sample" aria-label="Example prompt">
              {AI_SAMPLE}
            </pre>
          </div>
        </section>

        <section className="section cta">
          <div className="page-container cta__inner">
            <h2>Your next diagram is one click away.</h2>
            <Link to="/new" className="btn btn--primary btn--lg">
              Open the editor
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
