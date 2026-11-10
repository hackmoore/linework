import type { ChartType } from "@linework/shared";
import { architectureModel } from "../architecture/model";
import { classModel } from "../classes/model";
import { erModel } from "../er/model";
import { mindmapModel } from "../mindmap/model";
import { orgModel } from "../org/model";
import { stateModel } from "../statemachine/model";
import type { KindImporter, KindModel } from "./model";

/** Models for the node-and-edge chart types; see kinds/model.ts. */
const MODELS: Partial<Record<ChartType, KindModel>> = {
  architecture: architectureModel,
  er: erModel,
  org: orgModel,
  mindmap: mindmapModel,
  class: classModel,
  state: stateModel,
};

export function kindModel(chartType: ChartType | undefined): KindModel | undefined {
  return chartType ? MODELS[chartType] : undefined;
}

export function kindImporters(): readonly KindImporter[] {
  return Object.values(MODELS).flatMap((m) => m.importers ?? []);
}
