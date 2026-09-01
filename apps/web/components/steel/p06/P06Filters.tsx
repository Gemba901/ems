import { SteelHeatApprovalStage, SteelHeatApprovalStatus } from "@/services/steel-heat-approval.service";

export interface P06FiltersState {
  search: string;
  stage: SteelHeatApprovalStage | "";
  status: SteelHeatApprovalStatus | "";
}

export const DEFAULT_P06_FILTERS: P06FiltersState = { search: "", stage: "", status: "" };
