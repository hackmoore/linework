import { lazy, Suspense, type ReactElement, type ReactNode } from "react";
import { Route, Routes } from "react-router";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Only the landing page is in the main bundle; every other route loads on demand.
const EditorPage = lazy(async () => ({ default: (await import("./editor/EditorPage")).EditorPage }));
const EmbedPage = lazy(async () => ({ default: (await import("./pages/EmbedPage")).EmbedPage }));
const LibraryPage = lazy(async () => ({ default: (await import("./pages/LibraryPage")).LibraryPage }));
const NewDiagramPage = lazy(async () => ({
  default: (await import("./pages/NewDiagramPage")).NewDiagramPage,
}));
const OpenPage = lazy(async () => ({ default: (await import("./pages/OpenPage")).OpenPage }));
const LivePage = lazy(async () => ({ default: (await import("./pages/LivePage")).LivePage }));
const LlmsPage = lazy(async () => ({ default: (await import("./pages/LlmsPage")).LlmsPage }));

function Loading({ children }: { children: ReactNode }): ReactElement {
  return <Suspense fallback={<p className="editor-message">Loading...</p>}>{children}</Suspense>;
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/new"
        element={
          <Loading>
            <NewDiagramPage />
          </Loading>
        }
      />
      <Route
        path="/d/:id"
        element={
          <Loading>
            <EditorPage />
          </Loading>
        }
      />
      <Route
        path="/diagrams"
        element={
          <Loading>
            <LibraryPage />
          </Loading>
        }
      />
      <Route
        path="/open"
        element={
          <Loading>
            <OpenPage />
          </Loading>
        }
      />
      <Route
        path="/embed"
        element={
          <Suspense fallback={null}>
            <EmbedPage />
          </Suspense>
        }
      />
      <Route
        path="/llms"
        element={
          <Loading>
            <LlmsPage />
          </Loading>
        }
      />
      <Route
        path="/live"
        element={
          <Loading>
            <LivePage />
          </Loading>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
