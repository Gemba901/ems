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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
