import { SteelIntakeStage, SteelIntakeStatus } from "@/services/material-intake.service";

// Filter-state shape shared between the P03 list page (which now renders
// the actual filter UI via the shared FilterBar component) and
// QuickActions.tsx (which reads the current filters to decide button
// active-states). Kept here as the single source of truth for both.
export interface P03FiltersState {
  search: string;
  stage: SteelIntakeStage | "";
  status: SteelIntakeStatus | "";
}

export const DEFAULT_P03_FILTERS: P03FiltersState = { search: "", stage: "", status: "" };
