import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ASSIGNABLE_ROLES } from '../onboarding-access';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

/** Change access for one person (profile) or several (Employees list). */
export class ChangeAccessDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(100, { each: true }) employeeIds!: string[];
  @IsIn(ASSIGNABLE_ROLES) role!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  /** employeeId → the access revision the Admin saw; a person changed since is skipped. */
  @IsOptional() @IsObject() expectedRevisions?: Record<string, number>;
}

/** Approve or decline the access an import suggested. */
export class DecideAccessSuggestionsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(100, { each: true }) employeeIds!: string[];
  @IsIn(['APPROVE', 'DECLINE']) decision!: 'APPROVE' | 'DECLINE';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsObject() expectedRevisions?: Record<string, number>;
}

export class AccessSuggestionsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) batchId?: string;
}
