import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { TaskPermissionRole, ViewLevel } from 'db';

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
}
