import { StrictMode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { StaticRouter } from "react-router";
import { App } from "./App";

/** Renders a route to HTML at build time, waiting for lazy pages. See scripts/prerender.ts. */
export async function render(url: string): Promise<string> {
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}
