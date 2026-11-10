import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Link } from "react-router";
import { SiteFooter, SiteHeader } from "../components/SiteHeader";
import { ICONS } from "../library/icons";
import { llmsGuide } from "../share/llmsGuide";

/** Human-facing page explaining how to have an AI assistant draw charts that open here. */
export function LlmsPage(): ReactElement {
  const origin = window.location.origin;
  const guide = useMemo(() => llmsGuide({ origin, iconIds: ICONS.map((i) => i.id) }), [origin]);
  const prompt = `Read ${origin}/llms.txt, then make me a Linework chart: `;
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Use Linework with AI assistants - Linework";
  }, []);

  const copy = async (text: string, what: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => {
        setCopied(null);
      }, 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="home">
      <SiteHeader />
      <main className="page-container llms">
        <p className="eyebrow">For AI assistants</p>
        <h1>Have your AI assistant draw it</h1>
        <p className="llms__lede">
          ChatGPT, Claude, Gemini and other assistants can create Linework charts. Point them at the
          instructions below and they reply with a link. Open it and the chart is in the editor, ready to
          change and export. No account, and the chart is in the link itself, so nothing is uploaded.
        </p>

        <ol className="steps llms__steps">
          <li className="steps__item">
            <span className="steps__number">1</span>
            <h3>Copy the starter prompt</h3>
            <p>It tells the assistant where the instructions are.</p>
          </li>
          <li className="steps__item">
            <span className="steps__number">2</span>
            <h3>Describe your chart</h3>
            <p>
              &ldquo;A Gantt chart for our Q3 launch&rdquo;, &ldquo;a flowchart of our refund process&rdquo;.
            </p>
          </li>
          <li className="steps__item">
            <span className="steps__number">3</span>
            <h3>Open the link</h3>
            <p>It opens as a new chart in your browser.</p>
          </li>
        </ol>

        <div className="llms__prompt">
          <code>{prompt}…</code>
          <button type="button" className="btn btn--primary" onClick={() => void copy(prompt, "prompt")}>
            {copied === "prompt" ? "Copied" : "Copy prompt"}
          </button>
        </div>
        <p className="llms__note">
          Assistants that can't browse the web can use the full instructions instead: copy them below and
          paste them into the chat.
        </p>

        <section className="llms__guide">
          <div className="llms__guide-header">
            <h2>Instructions for AI assistants</h2>
            <div className="llms__guide-actions">
              <a className="btn btn--sm" href="/llms.txt" target="_blank" rel="noreferrer">
                Open llms.txt
              </a>
              <button type="button" className="btn btn--sm" onClick={() => void copy(guide, "guide")}>
                {copied === "guide" ? "Copied" : "Copy instructions"}
              </button>
            </div>
          </div>
          <pre className="llms__text">{guide}</pre>
        </section>

        <p>
          Prefer to do it yourself? <Link to="/new">Start a chart</Link>, or paste Mermaid or JSON into{" "}
          <Link to="/diagrams">My diagrams → Import</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
