import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { tenantTransaction } from "src/prisma/tenant-transaction";
import { personFullName } from "../onboarding-text";
import { analysePeople, type ChartPerson } from "./org-chart.model";
const bodies = new Set(["BOARD", "COMMITTEE", "MANAGEMENT_COMMITTEE", "OWNER"]);
@Injectable()
export class EmsOrgChartService {
  constructor(private readonly db: PrismaService) {}
  async read(organizationId: string) {
    return tenantTransaction(this.db, organizationId, async (tx) => {
      // Explicit allowlist: no contacts, identity documents, family, access roles or credentials.
      const rows = await tx.employee.findMany({
        where: { organizationId },
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          jobTitle: true,
          departmentId: true,
          plantBranch: true,
          reportingManagerId: true,
          reportsToBoard: true,
          reportingBody: true,
          employmentStatus: true,
          avatarUrl: true,
        },
      });
      const departments = await tx.department.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      });
      const byDepartment = new Map(departments.map((d) => [d.id, d]));
      const ids = new Set(rows.map((p) => p.id));
      const unavailable: string[] = [];
      const people: ChartPerson[] = rows.map((p) => {
        if (p.reportingManagerId && !ids.has(p.reportingManagerId))
          unavailable.push(p.id);
        return {
          id: p.id,
          name: personFullName(p),
          jobTitle: p.jobTitle,
          department: p.departmentId
            ? (byDepartment.get(p.departmentId) ?? null)
            : null,
          branch: null,
          branchText: p.plantBranch?.trim() || null,
          managerId:
            p.reportingManagerId && ids.has(p.reportingManagerId)
              ? p.reportingManagerId
              : null,
          reportsToBody: p.reportsToBoard
            ? "BOARD"
            : p.reportingBody && bodies.has(p.reportingBody)
              ? p.reportingBody
              : null,
          status: p.employmentStatus,
          photoUrl: p.avatarUrl,
        };
      });
      const result = analysePeople(people);
      const missing = new Set(unavailable);
      result.issues = result.issues.filter(
        (i) => !(missing.has(i.employeeId) && i.kind === "NO_MANAGER"),
      );
      unavailable.forEach((employeeId) =>
        result.issues.push({ employeeId, kind: "MANAGER_UNAVAILABLE" }),
      );
      return {
        ...result,
        source: "EMS registered employees",
        refreshedAt: new Date().toISOString(),
      };
    });
  }
}
