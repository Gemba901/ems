import { CompanyOrganizationController } from './company-organization.controller';
import { ConfigModule } from '@nestjs/config';
import { TenancyModule } from '../tenancy/tenancy.module';
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EmployeeModule } from 'src/employee/employee.module';

@Module({
    imports: [ConfigModule, TenancyModule, PrismaModule, EmployeeModule],
    controllers: [CompanyOrganizationController, OrganizationsController],
    providers: [OrganizationsService],
    exports: [OrganizationsService],
})
export class OrganizationsModule {}
