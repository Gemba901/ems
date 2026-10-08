import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Length,
    Matches,
    Max,
    Min,
    ValidateIf,
} from 'class-validator';
import { IsDateOnly, Trim } from './common.dto';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = '$property must be a time in HH:mm (24-hour) format';

// Every field is optional; the service merges with the current settings and then checks
// the combined result (start before end, lunch inside working hours).
export class UpdateWorkSettingsDto {
    @IsOptional()
    @Matches(TIME, { message: TIME_MESSAGE })
    workStartTime?: string;

    @IsOptional()
    @Matches(TIME, { message: TIME_MESSAGE })
    workEndTime?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(240)
    lateGraceMinutes?: number;

    @IsOptional()
    @IsBoolean()
    lunchBreakEnabled?: boolean;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @Matches(TIME, { message: TIME_MESSAGE })
    lunchStartTime?: string | null;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @Matches(TIME, { message: TIME_MESSAGE })
    lunchEndTime?: string | null;

    // 0 = Sunday … 6 = Saturday. Shared with Leave.
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(7)
    @ArrayUnique()
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(6, { each: true })
    workingDays?: number[];

    // ISO 3166-1 alpha-2 (e.g. KE); null stops following a public holiday calendar.
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @Matches(/^[A-Z]{2}$/, { message: 'holidayCountry must be a two-letter country code' })
    holidayCountry?: string | null;

    @IsOptional()
    @IsBoolean()
    observeOnNextWorkingDay?: boolean;
}

export class HolidayQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    year?: number;
}

export class CreateHolidayDto {
    @IsDateOnly()
    date!: string;

    @Trim()
    @IsString()
    @Length(1, 120)
    name!: string;
}

// Public holidays can be renamed or switched off; only company holidays can change date.
export class UpdateHolidayDto {
    @IsOptional()
    @IsDateOnly()
    date?: string;

    @IsOptional()
    @Trim()
    @IsString()
    @Length(1, 120)
    name?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class ImportHolidaysDto {
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    year!: number;
}
