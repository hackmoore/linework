import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
import { App } from "./App";

const container: HTMLElement | null = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
