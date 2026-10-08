import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsDateOnly } from './common.dto';

export const ANALYTICS_SCOPES = ['personal', 'department', 'organisation'] as const;
export type AnalyticsScope = (typeof ANALYTICS_SCOPES)[number];

export class AnalyticsQueryDto {
    @IsIn(ANALYTICS_SCOPES)
    scope!: AnalyticsScope;

    // Default to month to date in the organization's time zone. At most 366 days.
    @IsOptional()
    @IsDateOnly()
    from?: string;

    @IsOptional()
    @IsDateOnly()
    to?: string;

    // Department scope only; HODs default to (and are limited to) their own department.
    @IsOptional()
    @IsString()
    @Length(1, 64)
    departmentId?: string;

    // Personal scope only: yourself (default), a direct report, or anyone for attendance managers.
    @IsOptional()
    @IsString()
    @Length(1, 64)
    employeeId?: string;
}
