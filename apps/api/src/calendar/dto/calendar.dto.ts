import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString,
  IsInt, Min, Max, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CalendarBlockTypeDto {
  HOLIDAY = 'HOLIDAY',
  BUSY_DAY = 'BUSY_DAY',
}

export class CreateCalendarBlockDto {
  @IsDateString()
  date!: string;

  @IsEnum(CalendarBlockTypeDto)
  type!: CalendarBlockTypeDto;

  @IsString() @IsOptional()
  label?: string;
}

export enum VisitStatusDto {
  TENTATIVE  = 'TENTATIVE',
  CONFIRMED  = 'CONFIRMED',
  CANCELLED  = 'CANCELLED',
  COMPLETED  = 'COMPLETED',
}

export enum VisitRequestStatusDto {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum RecurrencePatternDto {
  WEEKLY   = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY  = 'MONTHLY',
}

export class CreateVisitDto {
  @IsString() @IsNotEmpty()
  title!: string;

  @IsString() @IsNotEmpty()
  clientOrgId!: string;

  @IsDateString()
  date!: string;

  @IsDateString() @IsOptional()
  endDate?: string;

  @IsString() @IsOptional()
  startTime?: string;

  @IsString() @IsOptional()
  endTime?: string;

  @IsEnum(VisitStatusDto) @IsOptional()
  status?: VisitStatusDto;

  @IsString() @IsOptional()
  notes?: string;

  @IsString() @IsOptional()
  internalNotes?: string;

  @IsString() @IsOptional()
  completionNote?: string;

  @IsEnum(RecurrencePatternDto) @IsOptional()
  recurrencePattern?: RecurrencePatternDto;

  @IsDateString() @IsOptional()
  recurrenceEndDate?: string;
}

export class UpdateVisitDto {
  @IsString() @IsOptional()
  title?: string;

  @IsString() @IsOptional()
  clientOrgId?: string;

  @IsDateString() @IsOptional()
  date?: string;

  @IsDateString() @IsOptional()
  endDate?: string;

  @IsString() @IsOptional()
  startTime?: string;

  @IsString() @IsOptional()
  endTime?: string;

  @IsEnum(VisitStatusDto) @IsOptional()
  status?: VisitStatusDto;

  @IsString() @IsOptional()
  notes?: string;

  @IsString() @IsOptional()
  internalNotes?: string;

  @IsString() @IsOptional()
  completionNote?: string;
}

export class CreateVisitRequestDto {
  @IsDateString()
  requestedDate!: string;

  @IsString() @IsOptional()
  preferredTime?: string;

  @IsString() @IsOptional()
  message?: string;
}

export class RespondToRequestDto {
  @IsEnum(VisitRequestStatusDto)
  status!: VisitRequestStatusDto;

  @IsString() @IsOptional()
  responseNote?: string;
}

export class AddVisitAttendeeDto {
  @IsString() @IsNotEmpty()
  employeeId!: string;

  @IsString() @IsOptional()
  role?: string;
}

export class UpcomingVisitsQueryDto {
  @IsOptional() @IsInt() @Min(1) @Max(20) @Type(() => Number)
  limit?: number;
}

export class AnalyticsQueryDto {
  @IsOptional() @IsInt() @Min(2020) @Max(2100) @Type(() => Number)
  year?: number;
}

export class IcalQueryDto {
  @IsOptional() @IsInt() @Min(2020) @Max(2100) @Type(() => Number)
  year?: number;

  @IsOptional() @IsInt() @Min(1) @Max(12) @Type(() => Number)
  month?: number;
}
