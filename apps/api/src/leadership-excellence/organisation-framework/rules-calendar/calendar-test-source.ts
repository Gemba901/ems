// Explicit EMS dependency for service tests; never bound by a production module.
import { PrismaService } from 'src/prisma/prisma.service';
import { EmsDirectoryService } from 'src/ems/directory/ems-directory.service';
import { EmsCalendarPeopleSource } from '../ems/ems-calendar-people.source';
import { RulesCalendarService } from './rules-calendar.service';
export const calendarTestService = (db: PrismaService) =>
  new RulesCalendarService(
    db,
    new EmsCalendarPeopleSource(new EmsDirectoryService(db)),
  );
