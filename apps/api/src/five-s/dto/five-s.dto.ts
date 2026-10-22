import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import {
    FiveSActionStatus,
    FiveSAuditFrequency,
    FiveSAuditStatus,
    FiveSPractice,
    FiveSRedTagDecision,
    FiveSRedTagReason,
    FiveSRedTagStatus,
    FiveSResponsibility,
    FiveSRoutineCategory,
    FiveSRoutineFrequency,
    FiveSRoutineOutcome,
    FiveSStandardStatus,
} from 'db';
import { IsDateOnly, Trim } from 'src/work/dto/common.dto';

// Evidence must be a file uploaded through this app, never an arbitrary link.
const UPLOADED_FILE = /^\/api\/uploads\/files\/[0-9a-f-]{36}$/;
const MAX_FILES = 10;

// 1.0, 1.1 … 3.5: the same scale the audit formula produces.
export const TARGET_LEVELS = Array.from({ length: 26 }, (_, i) => (10 + i) / 10);

class EvidenceFields {
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_FILES)
    @Matches(UPLOADED_FILE, { each: true, message: 'Attach files using the upload button' })
    photoUrls?: string[];
}

// ---------- Common filters ----------

export class FiveSFilterDto {
    @IsOptional() @IsUUID() areaId?: string;
    @IsOptional() @IsUUID() departmentId?: string;
    @IsOptional() @IsUUID() ownerId?: string;
    @IsOptional() @IsDateOnly() from?: string;
    @IsOptional() @IsDateOnly() to?: string;
}

// ---------- Workplace areas ----------

// Name, department and active state come from employee profiles and cannot be edited here.
export class UpdateAreaDto {
    @IsOptional() @IsUUID() ownerId?: string | null;
    @IsOptional() @Trim() @IsString() @MaxLength(2000) description?: string | null;
    @IsOptional() @IsEnum(FiveSAuditFrequency) auditFrequency?: FiveSAuditFrequency;
    @IsOptional()
    @Type(() => Number)
    @IsIn(TARGET_LEVELS, { message: 'Target level must be between 1.0 and 3.5, in steps of 0.1' })
    targetLevel?: number;
}

export class AreaListQueryDto {
    @IsOptional() @IsUUID() departmentId?: string;
    @IsOptional() @IsUUID() ownerId?: string;
    @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: 'active' | 'inactive' | 'all';
}

// ---------- Audits ----------

export class CreateAuditDto {
    @IsUUID() areaId!: string;
    @IsDateOnly() auditDate!: string;
    @IsOptional() @IsUUID() auditorId?: string;
    @IsOptional() @IsUUID() auditeeId?: string | null;
    @IsOptional() @Trim() @IsString() @MaxLength(120) auditeeName?: string | null;
}

export class UpdateAuditDto extends EvidenceFields {
    @IsOptional() @IsDateOnly() auditDate?: string;
    @IsOptional() @IsUUID() auditorId?: string;
    @IsOptional() @IsUUID() auditeeId?: string | null;
    @IsOptional() @Trim() @IsString() @MaxLength(120) auditeeName?: string | null;
    @IsOptional() @Trim() @IsString() @MaxLength(4000) remarks?: string | null;
}

export class AuditResponseDto extends EvidenceFields {
    @Type(() => Number) @IsInt() @Min(1) @Max(20) checkpointNo!: number;

    // null clears the selection (the checkpoint goes back to unanswered). 5 means "5 or more".
    @IsOptional()
    @ValidateIf((o) => o.locationCount !== null)
    @Type(() => Number)
    @IsIn([0, 1, 2, 3, 4, 5], { message: 'Choose 0, 1, 2, 3, 4 or 5+ problem locations' })
    locationCount?: number | null;

    @IsOptional() @Trim() @IsString() @MaxLength(1000) affectedLocations?: string | null;
    @IsOptional() @Trim() @IsString() @MaxLength(2000) remark?: string | null;
}

export class SaveAuditResponsesDto {
    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => AuditResponseDto)
    responses!: AuditResponseDto[];
}

export class AuditListQueryDto extends FiveSFilterDto {
    @IsOptional() @IsEnum(FiveSAuditStatus) status?: FiveSAuditStatus;
    @IsOptional() @IsUUID() auditorId?: string;
}

// ---------- Improvement actions ----------

// One step of an action plan.
export class CorrectiveActionInputDto {
    @Trim() @IsString() @Length(3, 2000, { message: 'Describe the corrective action (at least 3 characters)' }) description!: string;
    @IsOptional() @ValidateIf((o) => o.ownerId !== null) @IsUUID() ownerId?: string | null;
    @IsOptional() @ValidateIf((o) => o.dueDate !== null) @IsDateOnly() dueDate?: string | null;
}

export class CreateActionDto {
    @IsUUID() areaId!: string;
    @IsEnum(FiveSPractice) practice!: FiveSPractice;
    @Trim() @IsString() @Length(3, 2000) finding!: string;
    @IsOptional() @IsUUID() ownerId?: string | null;
    @IsOptional() @IsDateOnly() dueDate?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => CorrectiveActionInputDto)
    correctiveActions?: CorrectiveActionInputDto[];
}

export class UpdateActionDto {
    @IsOptional() @Trim() @IsString() @Length(3, 2000) finding?: string;
    @IsOptional() @ValidateIf((o) => o.ownerId !== null) @IsUUID() ownerId?: string | null;
    @IsOptional() @ValidateIf((o) => o.dueDate !== null) @IsDateOnly() dueDate?: string | null;
    @IsOptional() @Trim() @IsString() @MaxLength(500) note?: string;
}

export class UpdateCorrectiveActionDto {
    @IsOptional() @Trim() @IsString() @Length(3, 2000, { message: 'Describe the corrective action (at least 3 characters)' }) description?: string;
    @IsOptional() @ValidateIf((o) => o.ownerId !== null) @IsUUID() ownerId?: string | null;
    @IsOptional() @ValidateIf((o) => o.dueDate !== null) @IsDateOnly() dueDate?: string | null;
    @IsOptional() @IsBoolean() done?: boolean;
}

export class SubmitActionDto {
    @Trim() @IsString() @Length(5, 4000, { message: 'Describe the work completed (at least 5 characters)' })
    completionDescription!: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_FILES)
    @Matches(UPLOADED_FILE, { each: true, message: 'Attach files using the upload button' })
    completionEvidenceUrls?: string[];
}

// Join 7: hand a finding that needs more than the plan's steps to a Daily Gemba Kaizen.
export class RaiseKaizenDto {
    // Defaults to the action owner.
    @IsOptional() @IsUUID() kaizenOwnerId?: string;
}

export class RaiseSgaDto {
    // Defaults to the area owner, then the action owner.
    @IsOptional() @IsUUID() ownerId?: string;
}

export class VerifyActionDto {
    @IsIn(['VERIFIED', 'REWORK']) outcome!: 'VERIFIED' | 'REWORK';

    @ValidateIf((o) => o.outcome === 'REWORK' || o.remarks !== undefined)
    @Trim()
    @IsString()
    @Length(3, 2000, { message: 'Give a reason so the owner knows what to rework' })
    remarks?: string;
}

export class ActionListQueryDto extends FiveSFilterDto {
    @IsOptional() @IsEnum(FiveSActionStatus) status?: FiveSActionStatus;
    @IsOptional() @IsIn(['overdue', 'no_due_date', 'mine', 'to_verify']) view?: 'overdue' | 'no_due_date' | 'mine' | 'to_verify';
    @IsOptional() @IsUUID() auditId?: string;
    @IsOptional() @IsEnum(FiveSPractice) practice?: FiveSPractice;
}

// ---------- Red tags ----------

export class CreateRedTagDto extends EvidenceFields {
    @IsUUID() areaId!: string;
    @Trim() @IsString() @Length(2, 200) itemName!: string;
    @Trim() @IsString() @Length(2, 300) location!: string;
    @IsOptional() @Trim() @IsString() @MaxLength(60) quantity?: string | null;
    @IsEnum(FiveSRedTagReason) reason!: FiveSRedTagReason;
    @IsOptional() @Trim() @IsString() @MaxLength(1000) reasonDetails?: string | null;
    @IsOptional() @IsUUID() ownerId?: string | null;
    @IsDateOnly() raisedOn!: string;
    @IsOptional() @IsDateOnly() reviewDueDate?: string | null;
}

export class UpdateRedTagDto extends EvidenceFields {
    @IsOptional() @Trim() @IsString() @Length(2, 200) itemName?: string;
    @IsOptional() @Trim() @IsString() @Length(2, 300) location?: string;
    @IsOptional() @Trim() @IsString() @MaxLength(60) quantity?: string | null;
    @IsOptional() @IsEnum(FiveSRedTagReason) reason?: FiveSRedTagReason;
    @IsOptional() @Trim() @IsString() @MaxLength(1000) reasonDetails?: string | null;
    @IsOptional() @ValidateIf((o) => o.ownerId !== null) @IsUUID() ownerId?: string | null;
    @IsOptional() @ValidateIf((o) => o.reviewDueDate !== null) @IsDateOnly() reviewDueDate?: string | null;
}

export class RedTagDecisionDto {
    @IsEnum(FiveSRedTagDecision) decision!: FiveSRedTagDecision;
    @IsOptional() @Trim() @IsString() @MaxLength(2000) decisionNotes?: string | null;
    @IsOptional() @Trim() @IsString() @MaxLength(200) approvalReference?: string | null;
}

export class ResolveRedTagDto {
    @Trim() @IsString() @Length(3, 2000, { message: 'Describe what was done with the item' }) resolutionDetails!: string;
    @IsDateOnly() resolvedOn!: string;
}

export class RedTagListQueryDto extends FiveSFilterDto {
    @IsOptional() @IsEnum(FiveSRedTagStatus) status?: FiveSRedTagStatus;
    @IsOptional() @IsIn(['pending', 'review_overdue']) view?: 'pending' | 'review_overdue';
}

// ---------- Standards and routines ----------

export class CreateStandardDto {
    @IsUUID() areaId!: string;
    @Trim() @IsString() @Length(3, 200) title!: string;
    @Trim() @IsString() @Length(3, 8000) instructions!: string;
    @IsOptional() @IsUUID() ownerId?: string | null;
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_FILES)
    @Matches(UPLOADED_FILE, { each: true, message: 'Attach files using the upload button' })
    referenceUrls?: string[];
    @IsOptional() @Trim() @IsString() @MaxLength(500) changeNote?: string | null;
    // Join 12: the closed Kaizen or SGA being standardised (at most one)
    @IsOptional() @IsUUID() sourceKaizenId?: string;
    @IsOptional() @IsUUID() sourceSgaId?: string;
}

// Join 12: prefill for a standard written from a closed Kaizen or SGA
export class StandardSourceQueryDto {
    @IsOptional() @IsUUID() kaizenId?: string;
    @IsOptional() @IsUUID() sgaId?: string;
}

export class UpdateStandardDto {
    @IsOptional() @Trim() @IsString() @Length(3, 200) title?: string;
    @IsOptional() @Trim() @IsString() @Length(3, 8000) instructions?: string;
    @IsOptional() @ValidateIf((o) => o.ownerId !== null) @IsUUID() ownerId?: string | null;
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_FILES)
    @Matches(UPLOADED_FILE, { each: true, message: 'Attach files using the upload button' })
    referenceUrls?: string[];
    @IsOptional() @Trim() @IsString() @MaxLength(500) changeNote?: string | null;
}

export class StandardListQueryDto {
    @IsOptional() @IsUUID() areaId?: string;
    @IsOptional() @IsEnum(FiveSStandardStatus) status?: FiveSStandardStatus;
    @IsOptional() @IsIn(['current', 'all']) view?: 'current' | 'all';
}

export class CreateRoutineDto {
    @IsUUID() areaId!: string;
    @Trim() @IsString() @Length(3, 200) title!: string;
    @Trim() @IsString() @Length(2, 300) checkLocation!: string;
    @IsOptional() @Trim() @IsString() @MaxLength(2000) instructions?: string | null;
    @IsEnum(FiveSRoutineCategory) category!: FiveSRoutineCategory;
    @IsEnum(FiveSRoutineFrequency) frequency!: FiveSRoutineFrequency;
    @IsOptional() @IsUUID() responsibleId?: string | null;
    @IsDateOnly() startDate!: string;
}

export class UpdateRoutineDto {
    @IsOptional() @Trim() @IsString() @Length(3, 200) title?: string;
    @IsOptional() @Trim() @IsString() @Length(2, 300) checkLocation?: string;
    @IsOptional() @Trim() @IsString() @MaxLength(2000) instructions?: string | null;
    @IsOptional() @IsEnum(FiveSRoutineCategory) category?: FiveSRoutineCategory;
    @IsOptional() @IsEnum(FiveSRoutineFrequency) frequency?: FiveSRoutineFrequency;
    @IsOptional() @ValidateIf((o) => o.responsibleId !== null) @IsUUID() responsibleId?: string | null;
    @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RoutineListQueryDto {
    @IsOptional() @IsUUID() areaId?: string;
    @IsOptional() @IsUUID() responsibleId?: string;
    @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: 'active' | 'inactive' | 'all';
}

export class RecordRoutineCompletionDto {
    @IsDateOnly() scheduledDate!: string;
    @IsEnum(FiveSRoutineOutcome) outcome!: FiveSRoutineOutcome;

    @ValidateIf((o) => o.outcome !== FiveSRoutineOutcome.DONE || o.exception !== undefined)
    @Trim()
    @IsString()
    @Length(3, 1000, { message: 'Describe the exception or why it was not done' })
    exception?: string;
}

export class RoutineScheduleQueryDto {
    @IsOptional() @IsDateOnly() from?: string;
    @IsOptional() @IsDateOnly() to?: string;
}

// ---------- Settings ----------

export class AssignResponsibilityDto {
    @IsUUID() employeeId!: string;
    @IsEnum(FiveSResponsibility) responsibility!: FiveSResponsibility;
}

export class ChangeLogQueryDto {
    @IsOptional() @IsString() @MaxLength(40) entityType?: string;
    @IsOptional() @IsUUID() entityId?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class OverviewQueryDto extends FiveSFilterDto {
    @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: 'active' | 'inactive' | 'all';
}

export class DirectoryQueryDto {
    @IsOptional() @Trim() @IsString() @MaxLength(80) search?: string;
}
