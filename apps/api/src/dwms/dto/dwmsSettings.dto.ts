import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EscalationContactRule, TaskPermissionRole, ViewLevel } from 'db';

const MAX_CUSTOM_TASK_PEOPLE = 3;

export const TASK_ROLE_VALUES = [
  TaskPermissionRole.ADMIN,
  TaskPermissionRole.MANAGEMENT,
  TaskPermissionRole.HOD,
  TaskPermissionRole.DIRECT_MANAGER,
  TaskPermissionRole.HIGHER_LEVEL_MANAGERS,
  TaskPermissionRole.OWNER,
  TaskPermissionRole.ANYONE,
  TaskPermissionRole.CUSTOM,
] as const;

export class UpdateDwmsPermissionConfigDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(TaskPermissionRole, { each: true })
  approverRoles?: TaskPermissionRole[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_CUSTOM_TASK_PEOPLE)
  @IsString({ each: true })
  approverCustomEmployeeIds?: string[];

  @IsOptional()
  @IsEnum(ViewLevel)
  alertViewLevel?: ViewLevel;

  @IsOptional()
  @IsEnum(ViewLevel)
  analyticsViewLevel?: ViewLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  escalateUnacknowledgedMins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  escalateUnacknowledgedMediumMins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  escalateUnacknowledgedHighMins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  escalateUnacknowledgedCriticalMins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  abnormalityMediumMins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  abnormalityHighMins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  abnormalityCriticalMins?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(EscalationContactRule, { each: true })
  escalationContactRules?: EscalationContactRule[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_CUSTOM_TASK_PEOPLE)
  @IsString({ each: true })
  customEscalationContactIds?: string[];
}


