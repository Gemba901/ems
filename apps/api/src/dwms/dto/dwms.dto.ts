import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  NotEquals,
} from 'class-validator';
import {
  TaskFrequency,
  TaskStatus,
  Priority,
  Severity,
  OverdueAlertTo,
} from 'db';

export class CreateAssignedTaskDto {
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

export class ExtendEscalatedTaskDueDateDto {
  @IsNotEmpty()
  @IsString()
  newDueDate!: string;
}
