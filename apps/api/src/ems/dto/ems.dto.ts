import {
  IsString, IsOptional, IsIn, IsEnum, IsBoolean, IsDateString, IsNumber, Min, IsInt, Max, IsUUID, MinLength, MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { optionalProfileDate } from '../employee-profile-dates';
import { FIVE_S_LOCATION_LABELS, FIVE_S_LOCATION_ERROR, fiveSProfileValue, type FiveSLocationCategory } from '../five-s-location';

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
  @Transform(({ value }: {value: unknown}) => optionalProfileDate(value))
  @IsDateString({strict: true}, {message: 'Date of birth must be a valid calendar date.'}) @IsOptional() dateOfBirth?: string;
  @IsString() @IsOptional() nationalId?: string;
  @IsString() @IsOptional() nationality?: string;

  // Work Allocation
  @IsEnum(EmploymentStatusDto) @IsOptional() employmentStatus?: EmploymentStatusDto;
  @IsEnum(EmploymentTypeDto) @IsOptional() employmentType?: EmploymentTypeDto;
  @IsString() @IsOptional() jobTitle?: string;
  @Transform(({ value }: {value: unknown}) => optionalProfileDate(value))
  @IsDateString({strict: true}, {message: 'Date joined must be a valid calendar date.'}) @IsOptional() dateJoined?: string;
  @IsString() @IsOptional() plantBranch?: string;
  @IsString() @IsOptional() workStation?: string;
  @Transform(({ value }: {value: unknown}) => fiveSProfileValue(value))
  @IsOptional() @IsIn(Object.keys(FIVE_S_LOCATION_LABELS), {message: FIVE_S_LOCATION_ERROR})
  fiveSLocationCategory?: FiveSLocationCategory | null;
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

export enum EmployeeActivityStateDto { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }

export class ChangeEmploymentStatusDto {
  @IsEnum(EmploymentStatusDto) status!: EmploymentStatusDto;
  @Transform(({ value }: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsInt() @Min(0) expectedRevision!: number;
  @IsDateString() expectedUpdatedAt!: string;
  // Retain the same key when retrying an uncertain response.
  @IsUUID('4') requestId!: string;
}

export enum EmployeeSourceFilterDto { IMPORTED = 'IMPORTED', UNLINKED = 'UNLINKED' }
export enum EmployeeListSortDto { BEST_MATCH = 'BEST_MATCH', NAME_ASC = 'NAME_ASC', NAME_DESC = 'NAME_DESC', IMPORT_NEWEST = 'IMPORT_NEWEST', IMPORT_OLDEST = 'IMPORT_OLDEST' }

export class QueryEmsEmployeesDto {
  @IsEnum(EmployeeActivityStateDto) @IsOptional() activityState?: EmployeeActivityStateDto;
  @IsString() @IsOptional() departmentId?: string;
  @IsEnum(EmploymentStatusDto) @IsOptional() employmentStatus?: EmploymentStatusDto;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(200) @IsOptional() search?: string;
  @IsEnum(EmployeeSourceFilterDto) @IsOptional() source?: EmployeeSourceFilterDto;
  @IsString() @MinLength(1) @MaxLength(128) @IsOptional() importBatchId?: string;
  @IsEnum(EmployeeListSortDto) @IsOptional() sort?: EmployeeListSortDto;

  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit: number = 20;
}
