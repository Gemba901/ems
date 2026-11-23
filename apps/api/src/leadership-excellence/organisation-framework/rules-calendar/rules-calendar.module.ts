import {
  CALENDAR_PEOPLE_SOURCE,
  CoreCalendarPeopleSource,
} from "./calendar-people.source";
import { Module } from "@nestjs/common";
import { TenancyModule } from "src/tenancy/tenancy.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { AuthModule } from "src/auth/auth.module";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { RulesCalendarController } from "./rules-calendar.controller";
import { RulesCalendarService } from "./rules-calendar.service";

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [RulesCalendarController],
  providers: [
    RulesCalendarService,
    ModuleGuard,
    { provide: CALENDAR_PEOPLE_SOURCE, useClass: CoreCalendarPeopleSource },
  ],
  exports: [RulesCalendarService],
})
export class RulesCalendarModule {}
