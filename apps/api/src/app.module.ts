import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmployeeModule } from './employee/employee.module';
import { DepartmentsModule } from './departments/departments.module';

@Module({
  imports: [PrismaModule, AuthModule, EmployeeModule, DepartmentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
