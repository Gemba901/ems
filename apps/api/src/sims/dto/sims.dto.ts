import {
  IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean,
  IsNumber, Min, IsArray, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SuggestionCategory, SuggestionStatus, ImplementationStatus } from 'db';

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
