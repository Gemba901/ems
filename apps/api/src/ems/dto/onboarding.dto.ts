import { Type } from 'class-transformer';
import {
  IsArray, IsInt, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';

export class CreateOnboardingBatchDto {
  @IsString() @IsOptional() @MaxLength(200) label?: string;
  @IsString() @IsOptional() @MaxLength(255) sourceFileName?: string;
}

export class OnboardingRecordInputDto {
  @IsInt() @IsOptional() rowNumber?: number;

  // Module 1 — raw text as imported
  @IsString() @IsOptional() companyCode?: string;
  @IsString() @IsOptional() plantBranchCode?: string;
  @IsString() @IsOptional() employeeCode?: string;
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() mobileNumber?: string;
  @IsString() @IsOptional() workEmail?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() nationality?: string;
  @IsString() @IsOptional() currentDepartment?: string;
  @IsString() @IsOptional() hodName?: string;
  @IsString() @IsOptional() hodDesignation?: string;
  @IsString() @IsOptional() workArea?: string;
  @IsString() @IsOptional() subSection?: string;
  @IsString() @IsOptional() jobDesignation?: string;
  @IsString() @IsOptional() beesAccessLevel?: string;
  @IsString() @IsOptional() shift?: string;
  @IsString() @IsOptional() reportingToName?: string;
  @IsString() @IsOptional() reportingToDesignation?: string;
  @IsString() @IsOptional() employmentStatus?: string;
  @IsString() @IsOptional() employmentType?: string;
  @IsString() @IsOptional() reliever1Name?: string;
  @IsString() @IsOptional() reliever1Designation?: string;
  @IsString() @IsOptional() reliever2Name?: string;
  @IsString() @IsOptional() reliever2Designation?: string;
}

export class AddOnboardingRecordsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingRecordInputDto)
  records: OnboardingRecordInputDto[];
}