import type { Prisma } from "db";
import type { CalendarDirectory } from "./calendar-audience.types";
export const CALENDAR_PEOPLE_SOURCE = Symbol("CALENDAR_PEOPLE_SOURCE");
export interface CalendarPeopleSource {
  read(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<CalendarDirectory>;
}
