/** 02.01's shapes now live in common/contracts.ts (Area 02 section), the only place other areas import them from.
 * They are re-exported here so Area 02's own files keep their imports. Descriptive source data, not approved plan
 * responsibilities or an authorisation policy. */
import type { OrganisationStructure } from "../../common/contracts";
export type {
  OrganisationUnitType,
  UnitLead,
  UnitPeople,
  OrganisationUnit,
  StructurePerson,
  StructureCheck,
  OrganisationStructure,
  OrganisationStructureProvider,
} from "../../common/contracts";

/** Viewer context belongs to the page response, not the contract used by other areas. */
export interface OrganogramViewData extends OrganisationStructure {
  viewer: {
    branchIds: string[];
    status: "ASSIGNED" | "MULTIPLE" | "UNASSIGNED";
  };
}

/** Nest injection token for whichever source currently provides the structure (temporary core records, then EMS). */
export const ORGANISATION_STRUCTURE_SOURCE = Symbol(
  "ORGANISATION_STRUCTURE_SOURCE",
);
