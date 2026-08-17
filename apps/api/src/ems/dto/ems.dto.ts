import {
  IsString, IsOptional, IsEnum, IsBoolean, IsDateString, IsNumber, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EmploymentStatusDto {
  ACTIVE        = 'ACTIVE',
  PROBATION     = 'PROBATION',
  RESIGNED      = 'RESIGNED',
  TERMINATED    = 'TERMINATED',
  RETIRED       = 'RETIRED',
  SUSPENDED     = 'SUSPENDED',
  ABSCONDED     = 'ABSCONDED',
  CONTRACT_ENDED = 'CONTRACT_ENDED',
}

export enum EmploymentTypeDto {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT  = 'CONTRACT',
  INTERN    = 'INTERN',
  CASUAL    = 'CASUAL',
}

export enum GenderDto {
  MALE   = 'MALE',
  FEMALE = 'FEMALE',
  OTHER  = 'OTHER',
}

export enum SkillLevelDto {
  LEVEL_1 = 'LEVEL_1',
  LEVEL_2 = 'LEVEL_2',
  LEVEL_3 = 'LEVEL_3',
  LEVEL_4 = 'LEVEL_4',
}

export class UpdateEmployeeEmsDto {
  // Identity
  @IsString() @IsOptional() employeeCode?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsEnum(GenderDto) @IsOptional() gender?: GenderDto;
  @IsDateString() @IsOptional() dateOfBirth?: string;
  @IsString() @IsOptional() nationalId?: string;
  @IsString() @IsOptional() nationality?: string;

  // Work Allocation
  @IsEnum(EmploymentStatusDto) @IsOptional() employmentStatus?: EmploymentStatusDto;
  @IsEnum(EmploymentTypeDto) @IsOptional() employmentType?: EmploymentTypeDto;
  @IsString() @IsOptional() jobTitle?: string;
  @IsDateString() @IsOptional() dateJoined?: string;
  @IsString() @IsOptional() plantBranch?: string;
  @IsString() @IsOptional() workStation?: string;
  @IsString() @IsOptional() section?: string;
  @IsString() @IsOptional() subSection?: string;
  @IsString() @IsOptional() shift?: string;
  @IsString() @IsOptional() reportingManagerId?: string;
  @IsString() @IsOptional() hrRecordOwnerId?: string;

  // Role & Responsibility
  @IsString() @IsOptional() jobDescription?: string;
  @IsString() @IsOptional() level?: string;
  @IsString() @IsOptional() grade?: string;
  @IsString() @IsOptional() jobCategory?: string;
  @IsString() @IsOptional() primaryWorkRole?: string;
  @IsString() @IsOptional() machineProcess?: string;
  @IsBoolean() @IsOptional() canBeAssignedTasks?: boolean;
  @IsBoolean() @IsOptional() canBeMember?: boolean;
  @IsBoolean() @IsOptional() canBeLeader?: boolean;

  // Contact
  @IsString() @IsOptional() whatsappNumber?: string;
  @IsString() @IsOptional() homeAddress?: string;
  @IsString() @IsOptional() emergencyContactName?: string;
  @IsString() @IsOptional() emergencyContactPhone?: string;
  @IsString() @IsOptional() emergencyContactRelationship?: string;

  // Skill
  @IsEnum(SkillLevelDto) @IsOptional() skillLevel?: SkillLevelDto;
  @IsBoolean() @IsOptional() trainingNeeded?: boolean;
}

export class QueryEmsEmployeesDto {
  @IsString() @IsOptional() departmentId?: string;
  @IsEnum(EmploymentStatusDto) @IsOptional() employmentStatus?: EmploymentStatusDto;

  @Type(() => Number) @IsNumber() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsNumber() @Min(1) @IsOptional() limit: number = 20;
}
