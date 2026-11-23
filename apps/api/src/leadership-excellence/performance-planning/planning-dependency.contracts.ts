import type {
  Kra,
  KpiDefinition,
  PlanningCalendar,
  PlanningPillarWeights,
} from './planning.types';

/** Optional read capability; its absence never makes local defaults approved. */
export interface ApprovedPlanningPillarWeightsProvider {
  getApprovedPillarWeights(
    organizationId: string,
  ): Promise<PlanningPillarWeights | null>;
}

/** Provider contracts, implemented by the owning areas; Area 03 never creates EMS masters. */
export interface PlanningPositionReference {
  id: string;
  name: string;
  departmentId: string;
  holderIds: string[];
}

export interface OrganisationPlanningProvider {
  /** Stable EMS position IDs, including vacancies (holderIds=[]), not job-title strings. */
  getPlanningPositions(
    organizationId: string,
  ): Promise<PlanningPositionReference[]>;
  /** Null until Area 02 has published its performance calendar. */
  getApprovedPlanningCalendar(
    organizationId: string,
  ): Promise<PlanningCalendar | null>;
}

export interface ApprovedPlanningLibraryProvider {
  /** Definitions only. Assignment targets and schedules remain in Area 03. */
  getApprovedPlanningLibrary(organizationId: string): Promise<{
    kras: Kra[];
    definitions: KpiDefinition[];
  } | null>;
}
