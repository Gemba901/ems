import { Injectable } from '@nestjs/common';
import type { Prisma } from 'db';
import { EmsDirectoryService } from 'src/ems/directory/ems-directory.service';
import type { CalendarPeopleSource } from '../rules-calendar/calendar-people.source';
import type { CalendarDirectory } from '../rules-calendar/calendar-audience.types';

@Injectable()
export class EmsCalendarPeopleSource implements CalendarPeopleSource {
  constructor(private readonly directory: EmsDirectoryService) {}
  async read(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<CalendarDirectory> {
    const data = await this.directory.readDirectory(tx, organizationId);
    return {
      source: 'EMS',
      loadedAt: data.loadedAt,
      departments: data.departments,
      people: data.people.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.employeeCode,
        jobTitle: p.jobTitle,
        departmentId: p.departmentId,
        branch: p.branch,
        active: p.active,
      })),
    };
  }
}
