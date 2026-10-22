import { EXTRA_PROFILE_FIELDS, ImportedExtraField } from '../onboarding-extra-fields';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, Max, Min, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { getCountries } from 'libphonenumber-js';
import { OrgCommunicationChannel } from 'db';

export class CreateOnboardingBatchDto {
  @IsString() @IsOptional() @MaxLength(200) label?: string;
  @IsString() @IsOptional() @MaxLength(255) sourceFileName?: string;
  @IsString()
  @IsIn(getCountries(), {
    message: 'Select a supported default country for phone numbers',
  })
  defaultPhoneCountry!: string;
}

export class UpdateOnboardingBatchCountryDto {
  @IsString()
  @IsIn(getCountries(), { message: 'Select a supported default country for phone numbers' })
  defaultPhoneCountry!: string;
}

export class OnboardingExtraFieldDto implements ImportedExtraField {
  @IsInt() @Min(1) @Max(16384) column!: number;
  @IsString() @MaxLength(200) heading!: string;
  @IsString() @MaxLength(4000) originalValue!: string;
  @IsString() @MaxLength(4000) value!: string;
  @IsOptional() @IsIn(EXTRA_PROFILE_FIELDS.map(f => f.key)) target!: ImportedExtraField['target'];
}

export class OnboardingRecordInputDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OnboardingExtraFieldDto)
  extraFields?: OnboardingExtraFieldDto[];

  @IsInt() @IsOptional() rowNumber?: number;

  // Module 1 — raw text as imported
  @IsString() @IsOptional() companyCode?: string;
  @IsString() @IsOptional() plantBranchCode?: string;
  @IsString() @IsOptional() employeeCode?: string;
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() mobileNumber?: string;
  @IsString() @IsOptional() whatsappNumber?: string;
  @IsString() @IsOptional() workEmail?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() nationality?: string;
  @IsString() @IsOptional() currentDepartment?: string;
  @IsString() @IsOptional() hodName?: string;
  @IsString() @IsOptional() hodDesignation?: string;
  @IsString() @IsOptional() workArea?: string;
  @IsString() @IsOptional() @MaxLength(100) fiveSLocationCategory?: string;
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
  records!: OnboardingRecordInputDto[];
}

export class UpdateOnboardingRecordDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OnboardingExtraFieldDto)
  extraFields?: OnboardingExtraFieldDto[];

  @IsString() @IsOptional() @MaxLength(100) @Matches(/^(?:NONE|(?:record|employee):[A-Za-z0-9_-]+)?$/)
  reliever1Target?: string;
  @IsString() @IsOptional() @MaxLength(100) @Matches(/^(?:NONE|(?:record|employee):[A-Za-z0-9_-]+)?$/)
  reliever2Target?: string;
  // Empty string clears the saved choice; all referenced IDs are checked by the service.
  @IsString() @IsOptional() @MaxLength(100)
  @Matches(/^(?:BOARD|COMMITTEE|MANAGEMENT_COMMITTEE|OWNER|(?:record|employee):[A-Za-z0-9_-]+)?$/)
  reportingTarget?: string;
  @IsString() @IsOptional() companyCode?: string;
  @IsString() @IsOptional() plantBranchCode?: string;
  @IsString() @IsOptional() employeeCode?: string;
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() mobileNumber?: string;
  @IsString() @IsOptional() whatsappNumber?: string;
  @IsString() @IsOptional() workEmail?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() nationality?: string;
  @IsString() @IsOptional() currentDepartment?: string;
  @IsString() @IsOptional() hodName?: string;
  @IsString() @IsOptional() hodDesignation?: string;
  @IsString() @IsOptional() workArea?: string;
  @IsString() @IsOptional() @MaxLength(100) fiveSLocationCategory?: string;
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
// TODO: replace with OmitType(OnboardingRecordInputDto, ['rowNumber'])
// once @nestjs/mapped-types is confirmed available — removes this duplication.
export class ExcludeOnboardingRecordDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/, {
    message: 'An exclusion reason is required',
  })
  @MinLength(5, {
    message: 'Exclusion reason must contain at least 5 characters',
  })
  @MaxLength(300)
  reason!: string;
}

export class UpdateCommunicationChannelDto {
  @IsEnum(OrgCommunicationChannel, { message: 'Choose WhatsApp or email' })
  communicationChannel!: OrgCommunicationChannel;
}

export class UpdateEmployeeReportingDto {
  @IsString() @MaxLength(100)
  @Matches(/^(?:BOARD|COMMITTEE|MANAGEMENT_COMMITTEE|OWNER|employee:[A-Za-z0-9_-]+)$/)
  target!: string;
}

/** The server creates the review receipt; clients can only confirm the current token. */
export class ConfirmOnboardingDuplicateDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}

export class UpdateDepartmentHodDto {
  @IsString() @MaxLength(100) recordId!: string;
  @IsString() @MaxLength(100) @Matches(/^(?:NONE|(?:record|employee):[A-Za-z0-9_-]+)$/) target!: string;
  @IsString() @MaxLength(1000) expectedVersion!: string;
}
export class UpdateEmployeeRelieversDto {
  @IsString() @MaxLength(100) @Matches(/^(?:NONE|(?:record|employee):[A-Za-z0-9_-]+)$/) first!: string;
  @IsString() @MaxLength(100) @Matches(/^(?:NONE|(?:record|employee):[A-Za-z0-9_-]+)$/) second!: string;
  @IsString() @MaxLength(1000) expectedVersion!: string;
}
export class UpdateEmployeeHodDto {
  @IsString() @MaxLength(100) @Matches(/^(?:NONE|(?:record|employee):[A-Za-z0-9_-]+)$/) target!: string;
  @IsString() @MaxLength(1000) expectedVersion!: string;
}
