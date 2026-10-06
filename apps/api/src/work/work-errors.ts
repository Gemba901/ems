import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "db";

export enum WorkErrorCode {
    ATTENDANCE_ALREADY_OPEN = 'ATTENDANCE_ALREADY_OPEN',
    ATTENDANCE_DAY_COMPLETED = 'ATTENDANCE_DAY_COMPLETED',
    ATTENDANCE_NOT_OPEN = 'ATTENDANCE_NOT_OPEN',
    ATTENDANCE_OVERLAP = 'ATTENDANCE_OVERLAP',
    ATTENDANCE_CORRECTION_INVALID = 'ATTENDANCE_CORRECTION_INVALID',
    VERSION_CONFLICT = 'VERSION_CONFLICT',
    SPRINT_NOT_PLANNED = 'SPRINT_NOT_PLANNED',
    SPRINT_NOT_ACTIVE = 'SPRINT_NOT_ACTIVE',
    SPRINT_NOT_ASSIGNABLE = 'SPRINT_NOT_ASSIGNABLE',
    SPRINT_DATES_INVALID = 'SPRINT_DATES_INVALID',
    ASSIGNEE_NOT_MEMBER = 'ASSIGNEE_NOT_MEMBER',
    EMPLOYEE_NOT_IN_COMPANY = 'EMPLOYEE_NOT_IN_COMPANY',
    MEMBER_HAS_ASSIGNED_TASKS = 'MEMBER_HAS_ASSIGNED_TASKS',
    PROJECT_NEEDS_MANAGER = 'PROJECT_NEEDS_MANAGER',
    DATE_RANGE_INVALID = 'DATE_RANGE_INVALID',
    DATE_RANGE_TOO_LONG = 'DATE_RANGE_TOO_LONG',
    SETTINGS_INVALID = 'SETTINGS_INVALID',
    HOLIDAY_EXISTS = 'HOLIDAY_EXISTS',
    HOLIDAY_COUNTRY_MISSING = 'HOLIDAY_COUNTRY_MISSING',
    HOLIDAY_COUNTRY_UNSUPPORTED = 'HOLIDAY_COUNTRY_UNSUPPORTED',
    PUBLIC_HOLIDAY_LOCKED = 'PUBLIC_HOLIDAY_LOCKED',
    SPRINT_MEMBER_NOT_IN_PROJECT = 'SPRINT_MEMBER_NOT_IN_PROJECT',
    DEPARTMENT_REQUIRED = 'DEPARTMENT_REQUIRED',
    SITE_EXISTS = 'SITE_EXISTS',
    HOME_NOT_ALLOWED = 'HOME_NOT_ALLOWED',
    LOCATION_TOO_VAGUE = 'LOCATION_TOO_VAGUE',
    HOME_REQUEST_NOT_PENDING = 'HOME_REQUEST_NOT_PENDING',
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
