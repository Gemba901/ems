import {
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
import {
  ActivityStatus,
  EmployeeActivityStatus,
  TaskFrequency,
  TaskStatus,
  Priority,
  Severity,
  OverdueAlertTo,
} from 'db';

export class CreateAssignedTaskDto {
  @IsOptional()
  @IsString()
  activityId?: string;

  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  assignedToId!: string;

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
  @IsEnum(OverdueAlertTo)
  overdueAlertTo?: OverdueAlertTo;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  overdueAlertToEmployeeIds?: string[];

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

  @IsOptional()
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

  @IsOptional()
  @IsInt()
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
  @IsInt()
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

export enum ActivityIngestionAssignmentMode {
  INDIVIDUAL = 'Individual',
  ALL_USERS = 'All Users',
  ALL_MANAGEMENT = 'All Management',
  ALL_HOD = 'All HOD',
}

export class IngestActivityRowDto {
  activity!: CreateActivityDto;

  @IsOptional()
  @IsEnum(ActivityIngestionAssignmentMode)
  assignmentMode?: ActivityIngestionAssignmentMode;

  @IsOptional()
  @IsString()
  responsibleEmployeeCode?: string;

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
  @IsNumber()
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
export class LogCorrectiveActionDto {
  @IsNotEmpty()
  @IsString()
  correctiveAction!: string;
}

export class CloseAlertDto {
  @IsNotEmpty()
  @IsString()
  closureNote!: string;
}

export class ReassignEscalatedTaskDto {
  @IsNotEmpty()
  @IsString()
  newOwnerId!: string;
}
