import {
  IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean,
  IsNumber, Min, IsArray, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SuggestionCategory, SuggestionStatus } from 'db';

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
}

export class ReviewSuggestionDto {
  @IsEnum(SuggestionStatus, { message: 'Invalid status' })
  statusChanged!: SuggestionStatus;

  @IsString()
  @IsOptional()
  note?: string;
}

export class AssignCommitteeDto {
  @IsString()
  @IsNotEmpty({ message: 'committeeId is required' })
  committeeId!: string;
}

export class ClarifyDto {
  @IsString()
  @IsNotEmpty({ message: 'Clarification note is required' })
  note!: string;
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

  @IsString()
  @IsOptional()
  committeeId?: string;

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
