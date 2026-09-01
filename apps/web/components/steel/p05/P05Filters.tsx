import { SteelMeltingStage, SteelMeltingStatus } from "@/services/steel-melting.service";

export interface P05FiltersState {
  search: string;
  stage: SteelMeltingStage | "";
  status: SteelMeltingStatus | "";
}

export const DEFAULT_P05_FILTERS: P05FiltersState = { search: "", stage: "", status: "" };
