import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { parseDiagram, summarize, type Diagram, type DiagramSummary } from "@linework/shared";

const DB_NAME = "linework";
const DB_VERSION = 2;
/** Automatic snapshots are taken at most this often while editing. */
export const AUTO_VERSION_INTERVAL_MS = 10 * 60 * 1000;
const MAX_AUTO_VERSIONS = 30;

export interface DiagramVersion {
  readonly id: string;
  readonly diagramId: string;
  readonly createdAt: string;
  /** Empty for automatic snapshots. */
  readonly label: string;
  readonly auto: boolean;
  readonly diagram: Diagram;
}

interface LineworkDB extends DBSchema {
  diagrams: { key: string; value: Diagram };
  /** Denormalised listing so the library doesn't load every full document. */
  summaries: { key: string; value: DiagramSummary; indexes: { byUpdated: string } };
  versions: { key: string; value: DiagramVersion; indexes: { byDiagram: string } };
}

let dbPromise: Promise<IDBPDatabase<LineworkDB>> | null = null;

function db(): Promise<IDBPDatabase<LineworkDB>> {
  dbPromise ??= openDB<LineworkDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("diagrams", { keyPath: "id" });
        const summaries = database.createObjectStore("summaries", { keyPath: "id" });
        summaries.createIndex("byUpdated", "updatedAt");
      }
      if (oldVersion < 2) {
        const versions = database.createObjectStore("versions", { keyPath: "id" });
        versions.createIndex("byDiagram", "diagramId");
      }
    },
  });
  return dbPromise;
}

/** Most recently edited first. */
export async function listDiagrams(): Promise<DiagramSummary[]> {
  const all = await (await db()).getAllFromIndex("summaries", "byUpdated");
  return all.reverse().map(upgradeSummary);
}

/** Summaries written before chart types existed have `nodeCount` and no `chartType`. */
function upgradeSummary(stored: DiagramSummary): DiagramSummary {
  const legacy = stored as Partial<DiagramSummary> & { nodeCount?: number };
  if (legacy.chartType && typeof legacy.itemCount === "number") return stored;
  return {
    ...stored,
    chartType: legacy.chartType ?? "freeform",
    itemCount: legacy.itemCount ?? legacy.nodeCount ?? 0,
  };
}

/** Returns null when missing or when stored data no longer validates. */
export async function getDiagram(id: string): Promise<Diagram | null> {
  const stored = await (await db()).get("diagrams", id);
  if (!stored) return null;
  const parsed = parseDiagram(stored);
  return parsed.ok ? parsed.value : null;
}

export async function saveDiagram(diagram: Diagram): Promise<void> {
  const tx = (await db()).transaction(["diagrams", "summaries"], "readwrite");
  await Promise.all([
    tx.objectStore("diagrams").put(diagram),
    tx.objectStore("summaries").put(summarize(diagram)),
    tx.done,
  ]);
}

export async function deleteDiagram(id: string): Promise<void> {
  const database = await db();
  const versionKeys = await database.getAllKeysFromIndex("versions", "byDiagram", id);
  const tx = database.transaction(["diagrams", "summaries", "versions"], "readwrite");
  await Promise.all([
    tx.objectStore("diagrams").delete(id),
    tx.objectStore("summaries").delete(id),
    ...versionKeys.map((key) => tx.objectStore("versions").delete(key)),
    tx.done,
  ]);
}

/** Saved versions of a diagram, newest first. */
export async function listVersions(diagramId: string): Promise<DiagramVersion[]> {
  const all = await (await db()).getAllFromIndex("versions", "byDiagram", diagramId);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveVersion(diagram: Diagram, label: string, auto: boolean): Promise<DiagramVersion> {
  const version: DiagramVersion = {
    id: crypto.randomUUID(),
    diagramId: diagram.id,
    createdAt: new Date().toISOString(),
    label: label.slice(0, 100),
    auto,
    diagram,
  };
  const database = await db();
  await database.put("versions", version);
  if (auto) {
    // Keep only the most recent automatic snapshots; named versions are kept forever.
    const autos = (await listVersions(diagram.id)).filter((v) => v.auto);
    await Promise.all(autos.slice(MAX_AUTO_VERSIONS).map((v) => database.delete("versions", v.id)));
  }
  return version;
}

/** Takes an automatic snapshot if the last one is older than the interval. */
export async function maybeAutoVersion(diagram: Diagram, now = Date.now()): Promise<boolean> {
  const latest = (await listVersions(diagram.id))[0];
  if (latest && now - Date.parse(latest.createdAt) < AUTO_VERSION_INTERVAL_MS) return false;
  await saveVersion(diagram, "", true);
  return true;
}

export async function deleteVersion(id: string): Promise<void> {
  await (await db()).delete("versions", id);
}

/** Test hook: closes and forgets the connection so each test can start from a clean database. */
export async function resetLocalStoreForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to delete database"));
    };
  });
}
