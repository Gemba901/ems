import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsEnum,
    IsOptional,
    IsString,
    Length,
    MaxLength,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { WorkProjectRole } from 'db';
import { Trim } from './common.dto';

export class ProjectMemberDto {
    @IsString()
    @Length(1, 64)
    employeeId!: string;

    // Defaults to MEMBER in the service when omitted.
    @IsOptional()
    @IsEnum(WorkProjectRole)
    role?: WorkProjectRole;
}

export class CreateProjectDto {
    @Trim()
    @IsString()
    @Length(1, 120)
    name!: string;

    @IsOptional()
    @Trim()
    @IsString()
    @MaxLength(2000)
    description?: string;

    // The creator is always added as MANAGER by the service; listing them here is allowed.
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @ArrayUnique((member: ProjectMemberDto) => member.employeeId)
    @ValidateNested({ each: true })
    @Type(() => ProjectMemberDto)
    members?: ProjectMemberDto[];
}

export class UpdateProjectDto {
    @IsOptional()
    @Trim()
    @IsString()
    @Length(1, 120)
    name?: string;

    // null clears the description; undefined leaves it unchanged.
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @Trim()
    @IsString()
    @MaxLength(2000)
    description?: string | null;

    // Full replacement of the member list when present.
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @ArrayUnique((member: ProjectMemberDto) => member.employeeId)
    @ValidateNested({ each: true })
    @Type(() => ProjectMemberDto)
    members?: ProjectMemberDto[];
}
