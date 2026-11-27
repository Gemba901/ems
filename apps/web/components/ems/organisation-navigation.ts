import { Role } from "../../types/role";

export const ORG_CHART_PATH = "/ems/organisation/chart";

export const canViewDepartments = (role: Role | string | null | undefined) =>
  role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.HR;

/** Explicit chart addresses; do not accept lookalike paths or external URLs. */
export const isOrgChartAddress = (address: string) =>
  /^\/ems\/organisation\/chart(?:-v[23])?(?:\?[^#]*)?(?:#.*)?$/.test(address);

export function departmentFromChartHref(id: string, view: string, branch = "") {
  const returnView = new URLSearchParams(view);
  returnView.set("chartReturn", "1");
  const from = `${ORG_CHART_PATH}?${returnView}`;
  const params = new URLSearchParams({ from });
  if (branch) params.set("branch", branch);
  return `/ems/organisation/departments/${encodeURIComponent(id)}?${params}`;
}
