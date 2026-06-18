import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString,
  IsInt, Min, Max, IsBoolean, IsArray,
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

// ── Holistic Calendar DTOs ────────────────────────────────────────────────────

export enum CalendarEventTypeDto {
  PERSONAL_EVENT    = 'PERSONAL_EVENT',
  PERSONAL_REMINDER = 'PERSONAL_REMINDER',
  BIRTHDAY          = 'BIRTHDAY',
  PERSONAL_TRAINING = 'PERSONAL_TRAINING',
  COMPANY_TRAINING  = 'COMPANY_TRAINING',
  COMPANY_EVENT     = 'COMPANY_EVENT',
  COMPANY_HOLIDAY   = 'COMPANY_HOLIDAY',
  MEETING           = 'MEETING',
  AUDIT             = 'AUDIT',
  TRAINING_SESSION  = 'TRAINING_SESSION',
}

export enum EventRecurrencePatternDto {
  DAILY   = 'DAILY',
  WEEKLY  = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum InvitationStatusDto {
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

export enum DeleteModeDto {
  THIS_ONLY     = 'THIS_ONLY',
  ALL_IN_SERIES = 'ALL_IN_SERIES',
}

export class CreateCalendarEventDto {
  @IsString() @IsNotEmpty()
  title!: string;

  @IsString() @IsOptional()
  description?: string;

  @IsEnum(CalendarEventTypeDto)
  type!: CalendarEventTypeDto;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsBoolean() @IsOptional()
  allDay?: boolean;

  @IsBoolean() @IsOptional()
  isRecurring?: boolean;

  @IsEnum(EventRecurrencePatternDto) @IsOptional()
  recurrencePattern?: EventRecurrencePatternDto;

  @IsDateString() @IsOptional()
  recurrenceEndAt?: string;

  @IsArray() @IsString({ each: true }) @IsOptional()
  inviteeIds?: string[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  participantIds?: string[];
}

export class UpdateCalendarEventDto {
  @IsString() @IsOptional()
  title?: string;

  @IsString() @IsOptional()
  description?: string;

  @IsDateString() @IsOptional()
  startAt?: string;

  @IsDateString() @IsOptional()
  endAt?: string;

  @IsBoolean() @IsOptional()
  allDay?: boolean;

  @IsEnum(DeleteModeDto) @IsOptional()
  updateMode?: DeleteModeDto;
}

export class RespondToInvitationDto {
  @IsEnum(InvitationStatusDto)
  status!: InvitationStatusDto;
}

export class GetEventsQueryDto {
  @IsInt() @Min(2020) @Max(2100) @Type(() => Number)
  year!: number;

  @IsInt() @Min(1) @Max(12) @Type(() => Number)
  month!: number;
}

export class CheckAvailabilityQueryDto {
  @IsString() @IsNotEmpty()
  employeeId!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;
}

export class DeleteEventQueryDto {
  @IsEnum(DeleteModeDto) @IsOptional() @Type(() => String)
  deleteMode?: DeleteModeDto;
}

export class InvitationLogQueryDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number)
  limit?: number;
}
