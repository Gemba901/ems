import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Character limits; the service checks them again on submit and approve. */
export const TEXT_LIMITS = {
  company: 50,
  business: 150,
  purpose: 500,
  vision: 200,
  visionWhy: 500,
  mission: 200,
  missionWhy: 500,
} as const;
export const VALUE_LIMITS = { name: 50, why: 250, count: 8 } as const;

export class CoreValueDto {
  @IsOptional() @IsUUID() id?: string; // the client sends it for existing values
  @IsString() @MaxLength(VALUE_LIMITS.name) name!: string;
  @IsString() @MaxLength(VALUE_LIMITS.why) why!: string;
}

/** A whole-number percentage for each pillar. The total is checked on submit. */
export class PillarWeightsDto {
  @IsInt() @Min(0) @Max(100) LEX!: number;
  @IsInt() @Min(0) @Max(100) PEX!: number;
  @IsInt() @Min(0) @Max(100) OPX!: number;
  @IsInt() @Min(0) @Max(100) CMX!: number;
  @IsInt() @Min(0) @Max(100) SGEX!: number;
  @IsInt() @Min(0) @Max(100) FPEX!: number;
}

export class SaveDraftDto {
  @IsOptional() @IsString() @MaxLength(TEXT_LIMITS.company) company?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_LIMITS.business) business?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_LIMITS.purpose) purpose?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_LIMITS.vision) vision?: string;
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_LIMITS.visionWhy)
  visionWhy?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_LIMITS.mission) mission?: string;
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_LIMITS.missionWhy)
  missionWhy?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PillarWeightsDto)
  pillarWeights?: PillarWeightsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(VALUE_LIMITS.count)
  @ValidateNested({ each: true })
  @Type(() => CoreValueDto)
  values?: CoreValueDto[];

  /** The updatedAt the client loaded; a save made on an older copy is refused. */
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

/** Return for changes and start revision both record why. */
export class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

/** Replaces the list of people who approve the direction. */
export class SetApproversDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds!: string[];
}
