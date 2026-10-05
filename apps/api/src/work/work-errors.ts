import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "db";

export enum WorkErrorCode {
    ATTENDANCE_ALREADY_OPEN = 'ATTENDANCE_ALREADY_OPEN',
    ATTENDANCE_DAY_COMPLETED = 'ATTENDANCE_DAY_COMPLETED',
    ATTENDANCE_NOT_OPEN = 'ATTENDANCE_NOT_OPEN',
    ATTENDANCE_OVERLAP = 'ATTENDANCE_OVERLAP',
    ATTENDANCE_CORRECTION_INVALID = 'ATTENDANCE_CORRECTION_INVALID',
    VERSION_CONFLICT = 'VERSION_CONFLICT',
    SPRINT_ALREADY_ACTIVE = 'SPRINT_ALREADY_ACTIVE',
    SPRINT_NOT_PLANNED = 'SPRINT_NOT_PLANNED',
    SPRINT_NOT_ACTIVE = 'SPRINT_NOT_ACTIVE',
    SPRINT_NOT_ASSIGNABLE = 'SPRINT_NOT_ASSIGNABLE',
    SPRINT_DATES_INVALID = 'SPRINT_DATES_INVALID',
    ASSIGNEE_NOT_MEMBER = 'ASSIGNEE_NOT_MEMBER',
    EMPLOYEE_NOT_IN_COMPANY = 'EMPLOYEE_NOT_IN_COMPANY',
    MEMBER_HAS_ASSIGNED_TASKS = 'MEMBER_HAS_ASSIGNED_TASKS',
    PROJECT_NEEDS_MANAGER = 'PROJECT_NEEDS_MANAGER',
    DATE_RANGE_INVALID = 'DATE_RANGE_INVALID'
}

// Postgres unique violations (including the partial unique indexes) surface as P2002.
export function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// Details go first so they can never overwrite statusCode, code or message.
// Never put coordinates or other employees' data in details.
export function workConflict(code: WorkErrorCode, message: string, details?: Record<string, unknown>): ConflictException {
    return new ConflictException({ ...details, statusCode: 409, error: 'Conflict', code, message });
}

export function workBadRequest(code: WorkErrorCode, message: string, details?: Record<string, unknown>): BadRequestException {
    return new BadRequestException({ ...details, statusCode: 400, error: 'Bad Request', code, message });
}
