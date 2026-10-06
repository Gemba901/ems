import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
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

    // Lead and members must be project members. Members default to everyone when omitted
    // only in the UI; the API stores exactly what is sent.
    @IsOptional()
    @IsString()
    @Length(1, 64)
    leadId?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @ArrayUnique()
    @IsString({ each: true })
    @Length(1, 64, { each: true })
    memberIds?: string[];
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

// Lead and members can change while a sprint is planned or active. null clears the lead;
// memberIds replaces the whole list.
export class UpdateSprintTeamDto {
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsString()
    @Length(1, 64)
    leadId?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @ArrayUnique()
    @IsString({ each: true })
    @Length(1, 64, { each: true })
    memberIds?: string[];
}

export class SprintQueryDto extends PageQueryDto {
    @IsOptional()
    @IsEnum(WorkSprintStatus)
    status?: WorkSprintStatus;
}
