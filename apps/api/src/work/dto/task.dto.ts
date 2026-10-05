import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { WorkTaskStatus } from 'db';
import { IsDateOnly, PageQueryDto, Trim } from './common.dto';

const UUID_OR_VIEW = /^(all|unscheduled|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class CreateTaskDto {
    @Trim()
    @IsString()
    @Length(1, 200)
    title!: string;

    @IsOptional()
    @Trim()
    @IsString()
    @MaxLength(10000)
    description?: string;

    @IsOptional()
    @IsString()
    @Length(1, 64)
    assigneeId?: string;

    @IsOptional()
    @IsEnum(WorkTaskStatus)
    status?: WorkTaskStatus;

    @IsOptional()
    @IsDateOnly()
    dueDate?: string;

    // Only project managers may put a task into a sprint.
    @IsOptional()
    @IsUUID()
    sprintId?: string;
}

// For nullable fields: null clears the value, undefined leaves it unchanged.
export class UpdateTaskDto {
    @ValidateIf((_, value) => value !== undefined)
    @Trim()
    @IsString()
    @Length(1, 200)
    title?: string;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @Trim()
    @IsString()
    @MaxLength(10000)
    description?: string | null;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsString()
    @Length(1, 64)
    assigneeId?: string | null;

    @ValidateIf((_, value) => value !== undefined)
    @IsEnum(WorkTaskStatus)
    status?: WorkTaskStatus;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsDateOnly()
    dueDate?: string | null;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    sprintId?: string | null;
}

export class ProjectTaskQueryDto extends PageQueryDto {
    // 'all', 'unscheduled' (no sprint) or a sprint id.
    @IsOptional()
    @Matches(UUID_OR_VIEW, { message: "view must be 'all', 'unscheduled' or a sprint id" })
    view: string = 'all';

    @IsOptional()
    @IsEnum(WorkTaskStatus)
    status?: WorkTaskStatus;
}

export class MyTasksQueryDto extends PageQueryDto {
    @IsOptional()
    @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
    @IsBoolean()
    includeDone: boolean = false;
}

export class CreateCommentDto {
    @Trim()
    @IsString()
    @Length(1, 5000)
    body!: string;
}
