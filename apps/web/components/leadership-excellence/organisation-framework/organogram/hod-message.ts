import type { OrganisationUnit } from "./types";
export function hodMessage(
  unit: Pick<OrganisationUnit, "hodState">,
): string | null {
  switch (unit.hodState) {
    case "ASSIGNED":
      return "Recorded HOD in EMS";
    case "PENDING":
      return "HOD chosen · waiting for registration in EMS";
    case "UNASSIGNED":
      return "HOD deliberately left unassigned in EMS";
    case "NOT_RECORDED":
      return "HOD not recorded in EMS";
    case "NEEDS_ATTENTION":
      return "Recorded HOD needs attention in EMS";
    default:
      return null;
  }
}
