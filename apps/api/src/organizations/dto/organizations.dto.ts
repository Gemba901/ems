import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEmail,
    IsEnum,
    IsArray,
    IsNumber,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModuleType } from 'db';

export class CreateOrganizationDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    shortName?: string;

    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsString()
    industry?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsArray()
    @IsEnum(ModuleType, { each: true })
    modules?: ModuleType[];

    // Initial admin user
    @IsString()
    @IsNotEmpty()
    adminFirstName: string;

    @IsString()
    @IsNotEmpty()
    adminLastName: string;

    @IsEmail()
    adminEmail: string;

    @IsString()
    @IsNotEmpty()
    adminPhone: string;

    // Existing SUPER_ADMIN users to add as employees in the org's GembaPMS
    // platform-team department. Falls back to all current SUPER_ADMIN users
    // when omitted.
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    gembaTeamUserIds?: string[];
}

export class UpdateOrganizationDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    name?: string;

    @IsOptional()
    @IsString()
    shortName?: string;

    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsString()
    industry?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsArray()
    @IsEnum(ModuleType, { each: true })
    modules?: ModuleType[];

    @IsOptional()
    @IsString()
    primaryColor?: string;
}

export class UpdateOrgStatusDto {
    @IsEnum(['ACTIVE', 'SUSPENDED', 'INACTIVE'], {
        message: 'status must be one of: ACTIVE, SUSPENDED, INACTIVE',
    })
    status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

export class OrgPaginationDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number = 20;
}

export class OrgEmployeePaginationDto extends OrgPaginationDto {
    @IsOptional()
    @IsString()
    departmentId?: string;
}
