import { IsEnum, IsDateString, IsInt, IsIn, IsOptional, IsString, Min, Max, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveType, LeaveStatus } from 'db';

export class CreateLeaveRequestDto {
    @IsEnum(LeaveType)
    type: LeaveType;

    @IsDateString()
    startDate: string;

    @IsDateString()
    endDate: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    days?: number;

    @IsOptional()
    @IsString()
    reason?: string;

    @IsOptional()
    @IsString()
    handoverEmployeeId?: string;

    @IsOptional()
    @IsString()
    handoverNotes?: string;

    @IsOptional()
    @IsString()
    handoverEmployee2Id?: string;

    @IsOptional()
    @IsString()
    handoverNotes2?: string;
}

export class ReviewLeaveRequestDto {
    @IsIn(["APPROVED", "REJECTED"])
    status: "APPROVED" | "REJECTED";

    @IsOptional()
    @IsString()
    reviewNote?: string;
}

export class LeaveBalanceUpsertDto {
    @IsEnum(LeaveType)
    type: LeaveType;

    @IsInt()
    @Min(0)
    allocated: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    year?: number;
}

export class LeavePolicyEntryDto {
    @IsEnum(LeaveType)
    type: LeaveType;

    @IsInt()
    @Min(0)
    allocated: number;
}

export class UpsertLeavePolicyDto {
    @IsInt()
    @Min(2020)
    year: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LeavePolicyEntryDto)
    entries: LeavePolicyEntryDto[];
}

export class ApplyLeavePolicyDto {
    @IsInt()
    @Min(2020)
    year: number;
}

export class LeaveQueryDto {
    @IsOptional()
    @IsEnum(LeaveStatus)
    status?: LeaveStatus;

    @IsOptional()
    @IsString()
    employeeId?: string;

    @IsOptional()
    @IsString()
    year?: string;
}

export class UpdateLeaveSettingsDto {
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(6, { each: true })
    workingDays?: number[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    enabledTypes?: string[];
}

export class UpdateDeptMinHeadcountDto {
    @IsInt()
    @Min(0)
    minLeaveHeadcount: number;
}
