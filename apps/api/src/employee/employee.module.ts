import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { DwmsModule } from 'src/dwms/dwms.module';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, AuthModule, DwmsModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
