import { Type } from 'class-transformer';
import {
    IsDefined,
    IsEnum,
    IsInt,
    IsISO8601,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Matches,
    Max,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { AttendanceLocationStatus } from 'db';
import { IsDateOnly, PageQueryDto, Trim } from './common.dto';

// Requires an explicit offset so a timestamp is never read in the server's zone.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_WITH_OFFSET_MESSAGE = '$property must be an ISO 8601 timestamp with a time zone offset';

export class CapturedLocationDto {
    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(-90)
    @Max(90)
    latitude!: number;

    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(-180)
    @Max(180)
    longitude!: number;

    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(0.001)
    @Max(1_000_000)
    accuracyMeters!: number;

    // When the device took the reading; the server's clock-in time is recorded separately.
    @IsISO8601({ strict: true })
    @Matches(ISO_WITH_OFFSET, { message: ISO_WITH_OFFSET_MESSAGE })
    capturedAt!: string;
}

// The employee is always the caller; this body never names whose attendance it is.
// CAPTURED needs `location`; MISSING needs `locationMissingReason`. Sending both is rejected.
export class ClockInDto {
    // Client-generated per attempt; retries reuse it and get the original record back.
    @IsUUID()
    requestId!: string;

    @IsEnum(AttendanceLocationStatus)
    locationStatus!: AttendanceLocationStatus;

    @ValidateIf((dto: ClockInDto) => dto.locationStatus === AttendanceLocationStatus.CAPTURED || dto.location !== undefined)
    @IsDefined()
    @ValidateNested()
    @Type(() => CapturedLocationDto)
    location?: CapturedLocationDto;

    @ValidateIf(
        (dto: ClockInDto) => dto.locationStatus === AttendanceLocationStatus.MISSING || dto.locationMissingReason !== undefined,
    )
    @Trim()
    @IsString()
    @Length(10, 500)
    locationMissingReason?: string;
}

export class ClockOutDto {
    @IsUUID()
    requestId!: string;
}

export class AttendanceRangeQueryDto extends PageQueryDto {
    // Both default to the current month in the organization's time zone.
    @IsOptional()
    @IsDateOnly()
    from?: string;

    @IsOptional()
    @IsDateOnly()
    to?: string;
}

export class TeamAttendanceQueryDto extends AttendanceRangeQueryDto {
    @IsOptional()
    @IsString()
    @Length(1, 64)
    employeeId?: string;
}

// Omitted times stay as they are. A clock-out can be added or moved, never removed.
export class CorrectAttendanceDto {
    @ValidateIf((_, value) => value !== undefined)
    @IsISO8601({ strict: true })
    @Matches(ISO_WITH_OFFSET, { message: ISO_WITH_OFFSET_MESSAGE })
    clockInAt?: string;

    @ValidateIf((_, value) => value !== undefined)
    @IsISO8601({ strict: true })
    @Matches(ISO_WITH_OFFSET, { message: ISO_WITH_OFFSET_MESSAGE })
    clockOutAt?: string;

    @Trim()
    @IsString()
    @Length(10, 500)
    reason!: string;

    // The version the manager was looking at; a mismatch means someone else changed it.
    @Type(() => Number)
    @IsInt()
    @Min(1)
    expectedVersion!: number;
}
