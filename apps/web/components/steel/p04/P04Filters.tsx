import {
  SteelChargeStage,
  SteelChargeStatus,
} from "@/services/steel-charge-preparation.service";

export interface P04FiltersState {
  search: string;
  stage: SteelChargeStage | "";
  status: SteelChargeStatus | "";
  planId: string;
}

export const DEFAULT_P04_FILTERS: P04FiltersState = { search: "", stage: "", status: "", planId: "" };
