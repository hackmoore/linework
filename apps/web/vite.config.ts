import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { ICONS } from "./src/library/icons.ts";
import { llmsGuide } from "./src/share/llmsGuide.ts";

const apiTarget: string = process.env.LINEWORK_API_URL ?? "http://localhost:8787";
/** Public origin used in /llms.txt links, e.g. https://linework.example. */
const siteUrl: string = (process.env.LINEWORK_SITE_URL ?? "").replace(/\/+$/, "");

/** Serves /llms.txt in dev and writes it into the build, from the same text as the /llms page. */
function llmsTxt(): Plugin {
  const text = (origin: string): string => llmsGuide({ origin, iconIds: ICONS.map((i) => i.id) });
  return {
    name: "linework-llms-txt",
    configureServer(server) {
      server.middlewares.use("/llms.txt", (req, res) => {
        const host = req.headers.host ? `http://${req.headers.host}` : "";
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(text(siteUrl || host));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "llms.txt", source: text(siteUrl) });
    },
  };
}

export default defineConfig({
  plugins: [react(), llmsTxt()],
  define: { "import.meta.env.VITE_LINEWORK_SITE_URL": JSON.stringify(siteUrl) },
  server: {
    port: 5173,
    proxy: { "/api": { target: apiTarget, changeOrigin: true, ws: true } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
