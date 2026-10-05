import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { PeopleController } from './people/people.controller';
import { PeopleService } from './people/people.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { SprintsController } from './sprints/sprints.controller';
import { SprintsService } from './sprints/sprints.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { WorkAccessService } from './work-access.service';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, AuthModule],
  controllers: [ProjectsController, TasksController, SprintsController, AttendanceController, PeopleController],
  providers: [WorkAccessService, ModuleGuard, ProjectsService, TasksService, SprintsService, AttendanceService, PeopleService],
})
export class WorkModule {}
