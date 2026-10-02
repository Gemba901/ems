import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmployeeModule } from './employee/employee.module';
import { DepartmentsModule } from './departments/departments.module';
import { SimsModule } from './sims/sims.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CommitteeModule } from './committee/committee.module';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { QuotesModule } from './quotes/quotes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadsModule } from './uploads/uploads.module';
import { ChatModule } from './chat/chat.module';
import { EmsModule } from './ems/ems.module';
import { CalendarModule } from './calendar/calendar.module';
import { LeaveModule } from './leave/leave.module';
import { NoticesModule } from './notices/notices.module';
import { DwmsModule } from './dwms/dwms.module';
import { TicketsModule } from './tickets/tickets.module';
import { KaizenModule } from './kaizen/kaizen.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    // In-memory cache — 60 s TTL, max 500 items. Upgrade to Redis by swapping the store.
    CacheModule.register({
      isGlobal: true,
      ttl: 60_000,
      max: 500,
    }),
    PrismaModule,
    AuthModule,
    EmployeeModule,
    DepartmentsModule,
    SimsModule,
    OrganizationsModule,
    CommitteeModule,
    QuotesModule,
    NotificationsModule,
    UploadsModule,
    ChatModule,
    EmsModule,
    CalendarModule,
    LeaveModule,
    NoticesModule,
    DwmsModule,
    TicketsModule,
    KaizenModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // No custom catch-all filter on this branch: report unexpected errors here.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
