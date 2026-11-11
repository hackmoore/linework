// Writes static HTML for the public pages so search engines and link previews see real content.
// Runs after `vite build` (client) and `vite build --ssr` (dist-ssr). The browser then hydrates it.
//   dist/index.html       the home page
//   dist/llms.html        the AI assistants page
//   dist/app.html         empty shell for every other route (the server's fallback)
//   dist/robots.txt, dist/sitemap.xml (the sitemap only when LINEWORK_SITE_URL is set)
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface Page {
  readonly url: string;
  readonly file: string;
  readonly title?: string;
  readonly description?: string;
}

const PAGES: readonly Page[] = [
  { url: "/", file: "index.html" },
  {
    url: "/llms",
    file: "llms.html",
    title: "Use Linework with AI assistants - Linework",
    description:
      "Have ChatGPT, Claude or Gemini draw Gantt charts, flowcharts and other diagrams that open straight in Linework.",
  },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const ssrDir = join(root, "dist-ssr");

const escapeAttr = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Public origin, e.g. https://linework.example. Without it, absolute URLs are left out. */
const siteUrl = (process.env.LINEWORK_SITE_URL ?? "").replace(/\/+$/, "");

function withHead(html: string, page: Page): string {
  let out = html;
  if (page.title) {
    const title = escapeAttr(page.title);
    out = out
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*/, `$1${title}`);
  }
  if (page.description) {
    const description = escapeAttr(page.description);
    out = out.replace(/(<meta\s+(?:name|property)="(?:og:)?description"\s+content=")[^"]*/g, `$1${description}`);
  }
  if (siteUrl) {
    const url = escapeAttr(siteUrl + page.url);
    const tags = [
      `<link rel="canonical" href="${url}" />`,
      `<meta property="og:url" content="${url}" />`,
      `<meta property="og:image" content="${escapeAttr(siteUrl)}/og.png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
    ];
    out = out.replace(/\s*<\/head>/, `\n    ${tags.join("\n    ")}\n  </head>`);
  }
  return out;
}

const shell = await readFile(join(dist, "index.html"), "utf8");
if (!shell.includes('<div id="root"></div>')) throw new Error("dist/index.html has no empty #root");
const { render } = (await import(pathToFileURL(join(ssrDir, "entry-server.js")).href)) as {
  render: (url: string) => Promise<string>;
};

await writeFile(join(dist, "app.html"), shell);
for (const page of PAGES) {
  const body = await render(page.url);
  const html = withHead(shell, page).replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  const file = join(dist, page.file);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
  console.log(`prerendered ${page.url} -> dist/${page.file}`);
}
const robots = ["User-agent: *", "Disallow: /d/", "Disallow: /embed", "Disallow: /live"];
if (siteUrl) {
  const urls = PAGES.map((p) => `  <url><loc>${escapeAttr(siteUrl + p.url)}</loc></url>`).join("\n");
  await writeFile(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  robots.push(`Sitemap: ${siteUrl}/sitemap.xml`);
}
await writeFile(join(dist, "robots.txt"), robots.join("\n") + "\n");
await rm(ssrDir, { recursive: true, force: true });
