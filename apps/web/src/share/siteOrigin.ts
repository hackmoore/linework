// The public site URL the static pages were prerendered with (scripts/prerender.ts). Docker images
// are built with a placeholder that the container swaps for the real URL when it starts, in the
// HTML and its <meta name="linework-site-url">, so the browser reads it from the page, not the bundle.

let prerenderOrigin = "";

/** Set by the prerender step, which runs in Node with no document. */
export function setPrerenderOrigin(origin: string): void {
  prerenderOrigin = origin;
}

/** The site URL the current page was rendered with, or "" if none was given. */
export function renderedOrigin(): string {
  if (typeof document === "undefined") return prerenderOrigin;
  return document.querySelector<HTMLMetaElement>('meta[name="linework-site-url"]')?.content ?? "";
}
