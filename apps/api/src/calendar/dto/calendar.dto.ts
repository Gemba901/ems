import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString,
} from 'class-validator';

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

export class CreateVisitDto {
  @IsString() @IsNotEmpty()
  title!: string;

  @IsString() @IsNotEmpty()
  clientOrgId!: string;

  @IsDateString()
  date!: string;

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
}

export class UpdateVisitDto {
  @IsString() @IsOptional()
  title?: string;

  @IsString() @IsOptional()
  clientOrgId?: string;

  @IsDateString() @IsOptional()
  date?: string;

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
