import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/kalam/400.css";
import "@fontsource/kalam/700.css";
import "./styles/global.css";
import "./styles/home.css";
import "./styles/editor.css";
import "./styles/gantt.css";
import "./styles/kanban.css";
import "./styles/roadmap.css";
import "./styles/sequence.css";
import "./styles/canvas-kinds.css";
import { App } from "./App";

const container: HTMLElement | null = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Public pages are prerendered at build time (scripts/prerender.ts); every other route gets an empty shell.
if (container.hasChildNodes()) hydrateRoot(container, app);
else createRoot(container).render(app);
