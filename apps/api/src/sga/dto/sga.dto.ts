import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator"
import { Type } from "class-transformer"
import {
  SgaStartingReason,
  SgaReferenceApplicability,
  SgaQcdsmtCategory,
  SgaUnit,
  SgaWaste,
  SgaMeetingFrequency,
  SgaWeekday,
  SgaRootCauseTool,
  SgaFishboneCategory,
  SgaImplementationStatus,
  SgaVerificationStage,
  SgaBenefitPeriod,
} from "db"

// Step 1 §1: create draft
export class CreateSgaDto {
  @IsOptional()
  @IsEnum(SgaStartingReason)
  startingReason?: SgaStartingReason;
}

// Step 1 §1: update reason on an existing draft
export class UpdateSgaReasonDto {
  @IsEnum(SgaStartingReason)
  startingReason!: SgaStartingReason;

  @IsOptional()
  @IsEnum(SgaReferenceApplicability)
  referenceApplicability?: SgaReferenceApplicability;

  @ValidateIf((o) => o.referenceApplicability === "APPLICABLE")
  @IsString()
  referenceNumber?: string;
}

// Step 1 §2: SGA information and problem
export class UpdateSgaInfoDto {
  @IsString()
  @MinLength(5, { message: "Title must be at least 5 characters" })
  title!: string;

  @IsString()
  problemDescription!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  targetCompletionDate!: string;

  @IsOptional()
  @IsString()
  mainDepartmentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  otherDepartmentIds?: string[];

  @IsOptional()
  @IsString()
  workArea?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  beforeFileUrls?: string[];
}

// Step 1 §3: expected impact (QCDSMT) + seven wastes
export class SgaQcdsmtImpactItemDto {
  @IsEnum(SgaQcdsmtCategory)
  category!: SgaQcdsmtCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  whatIsMeasured!: string;

  @IsOptional()
  @IsString()
  baselineValue?: string;

  @IsOptional()
  @IsString()
  targetValue?: string;

  @IsEnum(SgaUnit)
  unit!: SgaUnit;

  @ValidateIf((o) => o.unit === "OTHER")
  @IsString()
  otherUnitLabel?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  expectedBenefit?: string;
}

export class UpdateSgaImpactDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SgaQcdsmtImpactItemDto)
  impacts!: SgaQcdsmtImpactItemDto[];

  @IsOptional()
  @IsArray()
  @IsEnum(SgaWaste, { each: true })
  wastes?: SgaWaste[];
}

// Step 2 §4: team
export class UpdateSgaTeamDto {
  @IsString()
  ownerId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: "You can select up to 5 team members" })
  @IsString({ each: true })
  teamMemberIds?: string[];
}

// Step 2 §5: meeting plan
export class UpdateSgaMeetingPlanDto {
  @IsOptional()
  @IsEnum(SgaMeetingFrequency)
  meetingFrequency?: SgaMeetingFrequency;

  @IsOptional()
  @IsEnum(SgaWeekday)
  meetingDay?: SgaWeekday;

  @IsOptional()
  @IsString()
  meetingTime?: string;

  @IsOptional()
  @IsInt()
  meetingDurationMinutes?: number;

  @IsOptional()
  @IsString()
  meetingLocation?: string;
}

// Step 2 §6: resources, investment (not the HOD decision itself)
export class UpdateSgaResourcesDto {
  @IsOptional()
  @IsString()
  requiredResources?: string;

  @IsOptional()
  @IsString()
  expectedBenefitSummary?: string;

  @IsOptional()
  @IsNumber()
  approximateInvestmentAmount?: number;

  @IsOptional()
  @IsString()
  approximateInvestmentCurrency?: string;
}

// Step 2 §6: HOD decision
export class SubmitSgaHodApprovalDto {
  @IsIn(["APPROVED", "RETURNED", "REJECTED"])
  decision!: "APPROVED" | "RETURNED" | "REJECTED";

  @IsOptional()
  @IsString()
  remarks?: string;
}

// Step 3 §7: current condition + measures (baseline/target)
export class SgaMeasureItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  whatIsMeasured!: string;

  @IsOptional()
  @IsString()
  baselineValue?: string;

  @IsOptional()
  @IsString()
  targetValue?: string;

  @IsOptional()
  @IsString()
  finalResultValue?: string;

  @IsEnum(SgaUnit)
  unit!: SgaUnit;

  @ValidateIf((o) => o.unit === "OTHER")
  @IsString()
  otherUnitLabel?: string;

  @IsOptional()
  @IsEnum(SgaQcdsmtCategory)
  linkedQcdsmt?: SgaQcdsmtCategory;

  @IsOptional()
  @IsEnum(SgaWaste)
  linkedWaste?: SgaWaste;
}

export class UpdateSgaConditionDto {
  @IsOptional()
  @IsString()
  evidenceSource?: string;

  @IsBoolean()
  immediateControlNeeded!: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SgaMeasureItemDto)
  measures?: SgaMeasureItemDto[];
}

// Step 3 §8: root cause analysis
export class SgaFishboneCauseItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsEnum(SgaFishboneCategory)
  category!: SgaFishboneCategory;

  @IsString()
  description!: string;
}

export class UpdateSgaRootCauseDto {
  @IsOptional()
  @IsArray()
  @IsEnum(SgaRootCauseTool, { each: true })
  rootCauseTools?: SgaRootCauseTool[];

  @IsOptional()
  @IsString()
  otherAnalysisNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SgaFishboneCauseItemDto)
  fishboneCauses?: SgaFishboneCauseItemDto[];
}

// Step 3 §9: meeting reports
export class CreateSgaMeetingReportDto {
  @IsInt()
  meetingNumber!: number;

  @IsDateString()
  meetingDate!: string;

  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendeeIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSgaMeetingReportDto {
  @IsOptional()
  @IsDateString()
  meetingDate?: string;

  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendeeIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

// Step 4 §10: confirmed causes and improvement action plan
export class SgaActionItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  confirmedRootCause!: string;

  @IsString()
  improvementAction!: string;

  @IsOptional()
  @IsString()
  responsiblePersonId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateSgaActionPlanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SgaActionItemDto)
  actionItems!: SgaActionItemDto[];
}

// Step 4 §11: implementation (owner only)
export class UpdateSgaImplementationDto {
  @IsOptional()
  @IsString()
  implementationSummary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  afterFileUrls?: string[];

  @IsOptional()
  @IsNumber()
  actualImplementationCost?: number;

  @IsOptional()
  @IsString()
  actualImplementationCostCurrency?: string;

  @IsEnum(SgaImplementationStatus)
  implementationStatus!: SgaImplementationStatus;
}

// Step 5 §12: check the results (final values on existing measures, or new ones)
export class UpdateSgaResultMeasureItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  whatIsMeasured!: string;

  @IsOptional()
  @IsString()
  baselineValue?: string;

  @IsOptional()
  @IsString()
  targetValue?: string;

  @IsOptional()
  @IsString()
  finalResultValue?: string;

  @IsEnum(SgaUnit)
  unit!: SgaUnit;

  @ValidateIf((o) => o.unit === "OTHER")
  @IsString()
  otherUnitLabel?: string;

  @IsOptional()
  @IsEnum(SgaQcdsmtCategory)
  linkedQcdsmt?: SgaQcdsmtCategory;

  @IsOptional()
  @IsEnum(SgaWaste)
  linkedWaste?: SgaWaste;
}

export class UpdateSgaResultsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSgaResultMeasureItemDto)
  measures!: UpdateSgaResultMeasureItemDto[];
}

// Step 5 §13: benefits and sustainability
export class UpdateSgaBenefitsDto {
  @IsOptional()
  @IsString()
  qcdsmtBenefitAchieved?: string;

  @IsOptional()
  @IsString()
  wasteReductionAchieved?: string;

  @IsOptional()
  @IsNumber()
  financialLossBeforeImprovement?: number;

  @IsOptional()
  @IsNumber()
  verifiedGrossBenefit?: number;

  @IsOptional()
  @IsEnum(SgaBenefitPeriod)
  benefitPeriod?: SgaBenefitPeriod;

  @IsOptional()
  @IsString()
  effectivenessConfirmationPeriod?: string;

  @IsBoolean()
  sopUpdated!: boolean;

  @IsBoolean()
  employeesTrained!: boolean;

  @IsBoolean()
  followUpCheckPlanned!: boolean;

  @IsBoolean()
  appliedElsewhere!: boolean;

  @IsOptional()
  @IsString()
  lessonsLearned?: string;
}

// Step 6 §14: affected department + representative
export class UpdateSgaVerifyingDepartmentDto {
  @IsString()
  verifyingDepartmentId!: string;

  @IsOptional()
  @IsString()
  departmentRepId?: string;
}

// Step 6 §14: per-stage verification decision
export class SubmitSgaVerificationStageDto {
  @IsEnum(SgaVerificationStage)
  stage!: SgaVerificationStage;

  @IsIn(["VERIFIED", "RETURN"])
  decision!: "VERIFIED" | "RETURN";

  @IsOptional()
  @IsString()
  remarks?: string;
}
