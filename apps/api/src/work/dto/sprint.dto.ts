import { IsEnum, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { WorkSprintStatus } from 'db';
import { IsDateOnly, PageQueryDto, Trim } from './common.dto';

export class CreateSprintDto {
    @Trim()
    @IsString()
    @Length(1, 120)
    name!: string;

    @IsOptional()
    @Trim()
    @IsString()
    @MaxLength(500)
    goal?: string;

    @IsDateOnly()
    startDate!: string;

    @IsDateOnly()
    endDate!: string;
}

// Only PLANNED sprints can be edited; the service enforces that.
export class UpdateSprintDto {
    @ValidateIf((_, value) => value !== undefined)
    @Trim()
    @IsString()
    @Length(1, 120)
    name?: string;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @Trim()
    @IsString()
    @MaxLength(500)
    goal?: string | null;

    @ValidateIf((_, value) => value !== undefined)
    @IsDateOnly()
    startDate?: string;

    @ValidateIf((_, value) => value !== undefined)
    @IsDateOnly()
    endDate?: string;
}

export class SprintQueryDto extends PageQueryDto {
    @IsOptional()
    @IsEnum(WorkSprintStatus)
    status?: WorkSprintStatus;
}
