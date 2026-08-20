import {
  IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean,
  IsNumber, Min, IsArray, ArrayMinSize, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SuggestionCategory, SuggestionStatus, ImplementationStatus, DecisionType } from 'db';

/** Fields for creating the real Kaizen when decisionType === DAILY_KAIZEN */
export class KaizenDetailsDto {
  /** The employee who will own and complete the drafted kaizen; required in the service */
  @IsString()
  @IsOptional()
  kaizenOwnerId?: string;

  /** Omit to fall back to the suggestion's own title */
  @IsString()
  @IsOptional()
  conditionDescription?: string;

  /** Omit to reuse the suggestion's own imageUrl as the condition evidence photo */
  @IsString()
  @IsOptional()
  beforePhotoUrl?: string;
}

export class CreateSuggestionDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description!: string;

  @IsArray({ message: 'Categories must be an array' })
  @ArrayMinSize(1, { message: 'At least one category is required' })
  @IsEnum(SuggestionCategory, { each: true, message: 'Invalid category value' })
  categories!: SuggestionCategory[];

  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  /** HOD / MANAGEMENT / ADMIN may target a specific department. Ignored for EMPLOYEE role. */
  @IsString()
  @IsOptional()
  departmentId?: string;

  /**
   * HOD / MANAGEMENT / ADMIN may target a specific HOD directly (preferred over departmentId —
   * department names aren't plant-scoped, so a generic name like "Production" can map to several
   * HODs). When set, the suggestion's department is derived from this HOD's own department.
   */
  @IsString()
  @IsOptional()
  hodId?: string;

  /**
   * HOD / MANAGEMENT / ADMIN may route straight to a steering committee, alongside (not instead
   * of) the department/HOD target above — mirrors what normally only happens once a department
   * HOD marks a suggestion SELECTED_FOR_SGA, just done immediately at submission time.
   */
  @IsString()
  @IsOptional()
  committeeId?: string;
}

export class ReviewSuggestionDto {
  @IsEnum(SuggestionStatus, { message: 'Invalid status' })
  statusChanged!: SuggestionStatus;

  @IsString()
  @IsOptional()
  note?: string;

  @IsEnum(ImplementationStatus, { message: 'Invalid implementation status' })
  @IsOptional()
  implementationStatus?: ImplementationStatus;

  @IsString()
  @IsOptional()
  implementationNote?: string;

  /** Required when statusChanged === APPROVED_FOR_IMPLEMENTATION */
  @IsEnum(DecisionType, { message: 'Invalid decision type' })
  @IsOptional()
  decisionType?: DecisionType;

  /** Shape depends on statusChanged/decisionType — see sims-review-pipeline-timeline.md */
  @IsOptional()
  decisionDetails?: Record<string, any>;

  /** Required when statusChanged === APPROVED_FOR_IMPLEMENTATION && decisionType === DAILY_KAIZEN */
  @ValidateNested()
  @Type(() => KaizenDetailsDto)
  @IsOptional()
  kaizenDetails?: KaizenDetailsDto;
}

export class UpdateImplementationDto {
  @IsEnum(ImplementationStatus, { message: 'Invalid implementation status' })
  @IsNotEmpty({ message: 'Implementation status is required' })
  implementationStatus!: ImplementationStatus;

  @IsString()
  @IsOptional()
  implementationNote?: string;
}

export class QuerySuggestionsDto {
  @IsEnum(SuggestionStatus)
  @IsOptional()
  status?: SuggestionStatus;

  @IsEnum(SuggestionCategory)
  @IsOptional()
  category?: SuggestionCategory;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit: number = 10;
}
