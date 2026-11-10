import type { ReactElement } from "react";
import { Link } from "react-router";
import { SiteFooter, SiteHeader } from "../components/SiteHeader";

export function NotFoundPage(): ReactElement {
  return (
    <div className="home">
      <SiteHeader />
      <main className="page-container" style={{ padding: "5rem 1.25rem", textAlign: "center" }}>
        <h1>Page not found</h1>
        <p>That page doesn&apos;t exist. Your diagrams are safe.</p>
        <Link to="/" className="btn btn--primary">
          Back to home
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
