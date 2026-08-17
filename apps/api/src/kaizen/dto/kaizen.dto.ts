import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator"
import { Type } from "class-transformer"
import {
  KaizenQcdsmtCategory,
  KaizenTrigger,
  KaizenUnit,
  KaizenVerificationStage,
  KaizenWaste,
} from "db"

// Part 1: select reason
export class CreateKaizenReasonDto {
  @IsOptional()
  @IsEnum(KaizenTrigger)
  trigger?: KaizenTrigger;

  @ValidateIf((o) => o.trigger === KaizenTrigger.OTHER)
  @IsString()
  triggerOther?: string;
}

// Part 1: update reason on an existing draft
export class UpdateKaizenReasonDto {
  @IsEnum(KaizenTrigger)
  trigger!: KaizenTrigger;

  @ValidateIf((o) => o.trigger === KaizenTrigger.OTHER)
  @IsString()
  triggerOther?: string;
}

// Part 2: related reference
export class UpdateKaizenReferenceDto {
  @IsOptional()
  @IsString()
  referenceValue?: string;

  @IsOptional()
  @IsIn(["APPLICABLE", "NOT_APPLICABLE", "REFERENCE_NOT_FOUND"])
  referenceApplicability?: "APPLICABLE" | "NOT_APPLICABLE" | "REFERENCE_NOT_FOUND";
}

// Part 3: condition or opportunity
export class UpdateKaizenConditionDto {
  @IsString()
  conditionDescription!: string;

  @IsArray()
  @IsString({ each: true })
  conditionEvidenceUrls!: string[];
}

// Part 4: basic daily kaizen information
export class UpdateKaizenBasicInfoDto {
  @IsString()
  @MinLength(5, { message: "Title must be at least 5 characters" })
  title!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  targetCompletionDate!: string;

  @IsString()
  kaizenOwnerId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: "You can select up to 3 team members" })
  @IsString({ each: true })
  teamMemberIds?: string[];
}

// Part 5: QCDSMT impact and result
export class KaizenQcdsmtImpactItemDto {
  @IsEnum(KaizenQcdsmtCategory)
  category!: KaizenQcdsmtCategory;

  @IsString()
  whatIsMeasured!: string;

  @IsOptional()
  @IsString()
  beforeValue?: string;

  @IsOptional()
  @IsString()
  afterValue?: string;

  @IsEnum(KaizenUnit)
  unit!: KaizenUnit;

  @ValidateIf((o) => o.unit === "OTHER")
  @IsString()
  otherUnitLabel?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateKaizenQcdsmtImpactDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KaizenQcdsmtImpactItemDto)
  impacts!: KaizenQcdsmtImpactItemDto[];
}

// Part 6: waste being reduced
export class KaizenWasteImpactItemDto {
  @IsEnum(KaizenWaste)
  waste!: KaizenWaste;

  @IsString()
  whatIsMeasured!: string;

  @IsOptional()
  @IsString()
  beforeValue?: string;

  @IsOptional()
  @IsString()
  afterValue?: string;

  @IsEnum(KaizenUnit)
  unit!: KaizenUnit;

  @ValidateIf((o) => o.unit === "OTHER")
  @IsString()
  otherUnitLabel?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateKaizenWasteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KaizenWasteImpactItemDto)
  impacts!: KaizenWasteImpactItemDto[];
}

// Part 7: required materials and estimated cost
export class UpdateKaizenImplementationPlanDto {
  @IsString()
  requiredMaterials!: string;

  @IsOptional()
  @IsNumberString()
  estimatedCost?: string;

  @IsOptional()
  @IsString()
  estimatedCostCurrency?: string;
}

// Part 8: HOD review before implementation
export class SubmitHodPreReviewDto {
  @IsIn(["APPROVE", "RETURN", "REJECT", "MOVE_TO_SGA"])
  decision!: "APPROVE" | "RETURN" | "REJECT" | "MOVE_TO_SGA";

  @IsOptional()
  @IsString()
  remarks?: string;
}

// Part 9: implementation and evidence
export class UpdateKaizenImplementationDto {
  @IsString()
  actionTaken!: string;

  @IsArray()
  @ArrayMaxSize(5, { message: "You can attach up to 5 after photos" })
  @IsString({ each: true })
  afterPhotoUrls!: string[];

  @IsOptional()
  @IsString()
  resultSaving?: string;
}

// Part 10: verification and closure
export class SubmitVerificationStageDto {
  @IsEnum(KaizenVerificationStage)
  stage!: KaizenVerificationStage;

  @IsIn(["VERIFIED", "RETURN"])
  decision!: "VERIFIED" | "RETURN";

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsNumberString()
  verifiedBenefitAmount?: string;

  @IsOptional()
  @IsString()
  verifiedBenefitCurrency?: string;
}
