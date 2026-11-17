// Mirrors the local API contract. Keep both in step until the shared contract is approved.
/** Draft Area 02 contract for review by Rodgers. No other area should import this local file yet.
 * This is descriptive source data, not approved plan responsibilities or an authorisation policy. */
export type OrganisationUnitType =
  | "COMPANY"
  | "BRANCH"
  | "DEPARTMENT"
  | "SECTION";
export interface UnitLead {
  employeeId: string;
  name: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  basis: "RECORDED_HOD" | "INFERRED_FROM_REPORTING";
}
/** Active includes probation. These are overlapping figures, not four additive categories. */
export interface UnitPeople {
  total: number;
  active: number;
  probation: number;
  inactive: number;
}
export interface OrganisationUnit {
  /** Derived branch/section references change when source labels change. Department identity is departmentId. */
  id: string;
  parentId: string | null;
  type: OrganisationUnitType;
  name: string;
  departmentId: string | null;
  branch: string | null;
  lead: UnitLead | null;
  people: UnitPeople;
}
/** Minimal directory data for the selected unit; no contacts, account IDs or personal identifiers. */
export interface StructurePerson {
  id: string;
  unitId: string;
  name: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  active: boolean;
  probation: boolean;
}
export interface StructureCheck {
  kind:
    | "NO_DEPARTMENT"
    | "EMPTY_DEPARTMENT"
    | "NO_LEAD"
    | "NO_MANAGER"
    | "MANAGER_MISSING"
    | "MANAGER_INACTIVE"
    | "REPORTING_LOOP";
  severity: "ERROR" | "WARNING";
  count: number;
  unitId: string | null;
  message: string;
}
export interface OrganisationStructure {
  source: {
    kind: "EMS" | "CORE_RECORDS" | "SAMPLE";
    label: string;
    loadedAt: string;
  };
  company: { id: string; name: string };
  multiBranch: boolean;
  units: OrganisationUnit[];
  members: StructurePerson[];
  people: UnitPeople & { withoutDepartment: number };
  checks: StructureCheck[];
}
/** Viewer context belongs to the page response, not the source contract used by other areas. */
export interface OrganogramViewData extends OrganisationStructure {
  viewer: {
    branchIds: string[];
    status: "ASSIGNED" | "MULTIPLE" | "UNASSIGNED";
  };
}
