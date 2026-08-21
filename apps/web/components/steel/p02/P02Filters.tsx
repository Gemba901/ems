import {
  SteelSourcingStage,
  SteelSourcingStatus,
  SteelMaterialType,
} from "@/services/steel-sourcing.service";

// Shared filter-state shape for the P02 sourcing list page. The filter UI
// itself now lives inline in app/steel/p02/page.tsx (built on the shared
// FilterBar component); this file is kept only because QuickActions.tsx
// imports the type/default from here.
export interface P02FiltersState {
  search: string;
  stage: SteelSourcingStage | "";
  status: SteelSourcingStatus | "";
  materialType: SteelMaterialType | "";
}

export const DEFAULT_P02_FILTERS: P02FiltersState = { search: "", stage: "", status: "", materialType: "" };
