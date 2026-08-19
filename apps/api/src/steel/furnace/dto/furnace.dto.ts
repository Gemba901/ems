import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FurnaceStatus } from 'db';

export class CreateFurnaceDto {
  @IsString()
  @IsNotEmpty({ message: 'Furnace code is required' })
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'Furnace name is required' })
  name!: string;

  @IsEnum(FurnaceStatus)
  @IsOptional()
  status?: FurnaceStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateFurnaceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(FurnaceStatus)
  @IsOptional()
  status?: FurnaceStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryFurnacesDto {
  @IsEnum(FurnaceStatus)
  @IsOptional()
  status?: FurnaceStatus;

  @IsString()
  @IsOptional()
  search?: string;
}

// A new lining campaign for a furnace. Only one ACTIVE lining per furnace is
// allowed — starting a new campaign implicitly retires the previous one.
export class CreateFurnaceLiningDto {
  @IsDateString()
  @IsOptional()
  installedAt?: string;

  @IsString()
  @IsOptional()
  material?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  thicknessRemainingMm?: number;

  @IsString()
  @IsOptional()
  inspectionNotes?: string;
}

// Records an inspection/condition update against the furnace's current
// active lining. Does not compute a "lining efficiency" score — the business
// has not defined a formula for one; raw condition/thickness readings are
// stored so one can be derived later.
export class UpdateFurnaceLiningConditionDto {
  @IsString()
  @IsOptional()
  condition?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  thicknessRemainingMm?: number;

  @IsString()
  @IsOptional()
  inspectionNotes?: string;
}

export class RetireFurnaceLiningDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
