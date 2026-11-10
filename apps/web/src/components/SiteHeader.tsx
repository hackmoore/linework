import type { ReactElement } from "react";
import { Link } from "react-router";
import { Logo } from "./Logo";

export const REPO_URL = "https://github.com/hackmoore/linework";

export function SiteHeader(): ReactElement {
  return (
    <header className="site-header">
      <div className="page-container site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="Linework home">
          <Logo />
        </Link>
        <nav className="site-header__nav" aria-label="Main">
          <a href="/#templates">Templates</a>
          <a href="/#features">Features</a>
          <Link to="/diagrams">My diagrams</Link>
          <Link to="/llms">For AI</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <Link to="/new" className="btn btn--primary">
          Open editor
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter(): ReactElement {
  return (
    <footer className="site-footer">
      <div className="page-container site-footer__inner">
        <Logo size={22} />
        <p>
          Free and open source under the MIT licence. Your diagrams stay in your browser unless you choose
          otherwise.
        </p>
        <nav className="site-footer__links" aria-label="Footer">
          <Link to="/llms">Instructions for AI assistants</Link>
          <a href="/llms.txt">llms.txt</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
