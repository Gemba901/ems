import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEmail,
    IsEnum,
    IsNumber,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrganizationDto {
    @IsString()
    @IsNotEmpty()
    name: string;

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
}

export class UpdateOrganizationDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    name?: string;

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
