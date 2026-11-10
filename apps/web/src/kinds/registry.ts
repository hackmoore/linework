import type { ChartType } from "@linework/shared";
import type { KindImporter, KindModel } from "./model";

/** Models for the node-and-edge chart types; see kinds/model.ts. */
const MODELS: Partial<Record<ChartType, KindModel>> = {};

export function kindModel(chartType: ChartType | undefined): KindModel | undefined {
  return chartType ? MODELS[chartType] : undefined;
}

export function kindImporters(): readonly KindImporter[] {
  return Object.values(MODELS).flatMap((m) => m.importers ?? []);
}
