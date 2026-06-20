import {
    IsDateString, IsInt, IsIn, IsOptional, IsString, IsNotEmpty,
    Min, Max, ValidateNested, IsArray, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveStatus } from 'db';

export class CreateLeaveRequestDto {
    @IsString()
    @IsNotEmpty()
    type: string;

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
    @IsString()
    @IsNotEmpty()
    type: string;

    @IsInt()
    @Min(0)
    allocated: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    year?: number;
}

export class LeavePolicyEntryDto {
    @IsString()
    @IsNotEmpty()
    type: string;

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
    @IsIn(["PENDING", "APPROVED", "REJECTED", "CANCELLED"])
    status?: string;

    @IsOptional()
    @IsString()
    employeeId?: string;

    @IsOptional()
    @IsString()
    year?: string;
}

export class CustomLeaveTypeDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsNotEmpty()
    name: string;
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

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CustomLeaveTypeDto)
    customLeaveTypes?: CustomLeaveTypeDto[];
}

export class UpdateDeptMinHeadcountDto {
    @IsInt()
    @Min(0)
    minLeaveHeadcount: number;
}
