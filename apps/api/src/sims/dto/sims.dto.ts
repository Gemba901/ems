import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SuggestionCategory, SuggestionPriority, SuggestionStatus } from 'db';

export class CreateSuggestionDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description!: string;

  @IsEnum(SuggestionCategory, { message: 'Invalid category' })
  category!: SuggestionCategory;

  @IsEnum(SuggestionPriority, { message: 'Invalid priority' })
  @IsOptional()
  priority?: SuggestionPriority;

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

export class QuerySuggestionsDto {
  @IsEnum(SuggestionStatus)
  @IsOptional()
  status?: SuggestionStatus;

  @IsEnum(SuggestionCategory)
  @IsOptional()
  category?: SuggestionCategory;

  @IsEnum(SuggestionPriority)
  @IsOptional()
  priority?: SuggestionPriority;

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
