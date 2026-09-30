import {
  Matches,
  IsDateString,
  Max,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  Min,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  NotEquals,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ActivityStatus,
  ActivityScope,
  EmployeeActivityStatus,
  TaskFrequency,
  TaskStatus,
  Priority,
  Severity,
} from 'db';

export class CreateAssignedTaskDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/\S/, { message: 'Task title must not be blank' })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  assignedToId!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dueDate?: string;

  @IsOptional()
  @IsEnum(Priority)
  @NotEquals(Priority.LOW)
  priority?: Priority;

  @IsOptional()
  @IsEnum(TaskFrequency)
  frequency?: TaskFrequency;

  @IsOptional()
  @IsString()
  approvedById?: string;

  @IsOptional()
  @IsString()
  backupOwnerId?: string;

  @IsOptional()
  @IsBoolean()
  requiresCompletionDocument?: boolean;

  @IsOptional()
  @IsString()
  completionDocumentName?: string;

  @IsOptional()
  @IsBoolean()
  isAdhoc?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeOnCreate?: boolean;
}

export class CreateTaskFromActivityDto {
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(Priority)
  @NotEquals(Priority.LOW)
  priority?: Priority;

  @IsOptional()
  @IsEnum(TaskFrequency)
  frequency?: TaskFrequency;

  @IsOptional()
  @IsString()
  approvedById?: string;

  @IsOptional()
  @IsString()
  backupOwnerId?: string;

  @IsOptional()
  @IsBoolean()
  isAdhoc?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeOnCreate?: boolean;
}

export class UpdateEmployeeActivityAssignmentDto {
  @IsNotEmpty()
  @IsEnum(EmployeeActivityStatus)
  status!: EmployeeActivityStatus;
}

export class SearchDwmsEmployeesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;
}

export class CreateActivityDto {
  @IsOptional()
  @IsString()
  companyUnitName?: string;

  @IsOptional()
  @IsString()
  mainDepartmentId?: string;

  @IsOptional()
  @IsString()
  subDepartment?: string;

  @IsOptional()
  @IsString()
  gembaSection?: string;

  @IsOptional()
  @IsString()
  processArea?: string;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  workMethod!: string;

  @IsNotEmpty()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsNotEmpty()
  @IsEnum(TaskFrequency)
  frequency!: TaskFrequency;

  @IsOptional()
  @IsString()
  startTrigger?: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  completionDeadline?: number;

  @IsNotEmpty()
  @IsString()
  completionOutput?: string;

  @IsNotEmpty()
  @IsEnum(ActivityScope)
  scope!: ActivityScope;

  @IsOptional()
  @IsString()
  scopeTarget?: string;

  @IsOptional()
  @IsString()
  primaryResponsibleDesignation?: string;

  @IsOptional()
  @IsString()
  primaryResponsibleEmployeeId?: string;

  @IsOptional()
  @IsString()
  evidenceRequired?: string;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @IsNotEmpty()
  @IsString()
  remarks?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1)
  @IsString({ each: true })
  parentActivityIds?: string[];

  @IsOptional()
  @IsString()
  parentActivityId?: string;
}

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  companyUnitName?: string;

  @IsOptional()
  @IsString()
  mainDepartmentId?: string;

  @IsOptional()
  @IsString()
  subDepartment?: string;

  @IsOptional()
  @IsString()
  gembaSection?: string;

  @IsOptional()
  @IsString()
  processArea?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  workMethod?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(TaskFrequency)
  frequency?: TaskFrequency;

  @IsOptional()
  @IsString()
  startTrigger?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  completionDeadline?: number;

  @IsOptional()
  @IsString()
  completionOutput?: string;

  @IsOptional()
  @IsString()
  primaryResponsibleDesignation?: string;

  @IsOptional()
  @IsString()
  primaryResponsibleEmployeeId?: string;

  @IsOptional()
  @IsString()
  evidenceRequired?: string;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1)
  @IsString({ each: true })
  parentActivityIds?: string[];

  @IsOptional()
  @IsString()
  parentActivityId?: string;
}

export class IngestActivityRowDto {
  activity!: CreateActivityDto;

  @IsOptional()
  @IsString()
  parentActivityCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rowNumber?: number;
}

export class IngestActivitiesDto {
  @IsOptional()
  @IsString()
  fileName?: string;

  @IsArray()
  @ArrayMaxSize(500)
  rows!: IngestActivityRowDto[];
}

export class UpdateProgressDto {
  @IsNotEmpty()
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @IsOptional()
  @IsString()
  completionNote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent?: number;

  @IsOptional()
  @IsString()
  completionAttachmentUrl?: string;

  @IsOptional()
  @IsString()
  completionAttachmentName?: string;
}

export class CompleteAssignedTaskDto {
  @IsOptional()
  @IsString()
  completionNote?: string;

  @IsOptional()
  @IsString()
  completionAttachmentUrl?: string;

  @IsOptional()
  @IsString()
  completionAttachmentName?: string;
}

export class CreateTaskInstanceCommentDto {
  @IsNotEmpty()
  @IsString()
  comment!: string;
}

export class TaskApprovalActionDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateAlertDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsNotEmpty()
  @IsEnum(Severity)
  @NotEquals(Severity.LOW)
  severity!: Severity;

  @IsOptional()
  @IsString()
  targetType?: 'GENERAL' | 'TASK' | 'PERSON' | 'DEPARTMENT';

  @IsOptional()
  @IsString()
  taskInstanceId?: string;

  @IsOptional()
  @IsString()
  againstUserId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class CreateAlertCommentDto {
  @IsNotEmpty()
  @IsString()
  comment!: string;
}
export class AcknowledgeAlertOccurrenceDto {
  @IsNotEmpty()
  @IsString()
  note!: string;
}
