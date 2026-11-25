import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type { IntelligenceFilters } from '../intelligence.types';

export class IntelligenceQueryDto implements IntelligenceFilters {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cycle?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  departmentId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  personId?: string;
  @IsOptional()
  @IsIn(['LEX', 'PEX', 'OPX', 'CMX', 'SGEX', 'FPEX'])
  pillar?: IntelligenceFilters['pillar'];
  @IsOptional()
  @IsIn(['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'])
  alignment?: IntelligenceFilters['alignment'];
  @IsOptional()
  @IsIn(['MY', 'DEPARTMENT', 'ORGANIZATION'])
  scope?: IntelligenceFilters['scope'];
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
