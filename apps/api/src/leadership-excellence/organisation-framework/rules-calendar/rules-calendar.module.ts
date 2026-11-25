import {
  CALENDAR_PEOPLE_SOURCE,
} from "./calendar-people.source";
import { EmsDirectoryModule } from 'src/ems/directory/ems-directory.module';
import { EmsCalendarPeopleSource } from '../ems/ems-calendar-people.source';
import { Module } from "@nestjs/common";
import { TenancyModule } from "src/tenancy/tenancy.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { AuthModule } from "src/auth/auth.module";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { RulesCalendarController } from "./rules-calendar.controller";
import { RulesCalendarService } from "./rules-calendar.service";

@Module({
  imports: [EmsDirectoryModule, TenancyModule, PrismaModule, AuthModule],
  controllers: [RulesCalendarController],
  providers: [
    RulesCalendarService,
    ModuleGuard,
    { provide: CALENDAR_PEOPLE_SOURCE, useClass: EmsCalendarPeopleSource },
  ],
  exports: [RulesCalendarService],
})
export class RulesCalendarModule {}
