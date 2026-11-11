import { Injectable } from "@nestjs/common";
import { Prisma } from "db";
import type { CalendarDirectory } from "./calendar-audience.types";
export const CALENDAR_PEOPLE_SOURCE = Symbol("CALENDAR_PEOPLE_SOURCE");
export interface CalendarPeopleSource {
  read(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<CalendarDirectory>;
}
/** TEMPORARY, read-only source. Replace this binding with the EMS directory service after integration.
 * Branch text is a selection filter only; assignments persist recorded employee/department IDs. */
@Injectable()
export class CoreCalendarPeopleSource implements CalendarPeopleSource {
  async read(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<CalendarDirectory> {
    const [departments, people] = await Promise.all([
      tx.department.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      tx.employee.findMany({
        where: { organizationId },
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          employeeCode: true,
          jobTitle: true,
          departmentId: true,
          plantBranch: true,
          employmentStatus: true,
        },
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
        take: 10001,
      }),
    ]);
    if (people.length > 10000)
      throw new Error(
        "The calendar directory exceeds 10,000 people. A paginated directory integration is required before editing or comparing assignments.",
      );
    return {
      source: "CORE_RECORDS",
      loadedAt: new Date().toISOString(),
      departments,
      people: people.map((p) => ({
        id: p.id,
        name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "),
        code: p.employeeCode,
        jobTitle: p.jobTitle,
        departmentId: p.departmentId,
        branch: p.plantBranch?.trim() || null,
        active: ["ACTIVE", "PROBATION"].includes(p.employmentStatus),
      })),
    };
  }
}
