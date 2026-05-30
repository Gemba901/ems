import { IsEnum, IsDateString, IsInt, IsIn, IsOptional, IsString, Min } from 'class-validator';
import { LeaveType, LeaveStatus } from 'db';

export class CreateLeaveRequestDto {
    @IsEnum(LeaveType)
    type: LeaveType;

    @IsDateString()
    startDate: string;

    @IsDateString()
    endDate: string;

    @IsInt()
    @Min(1)
    days: number;

    @IsOptional()
    @IsString()
    reason?: string;
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

export class LeaveQueryDto {
    @IsOptional()
    @IsEnum(LeaveStatus)
    status?: LeaveStatus;

    @IsOptional()
    @IsString()
    employeeId?: string;
}
