import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CoreValueDto {
  @IsOptional() @IsUUID() id?: string; // the client sends it for existing values
  @IsString() @MaxLength(50) name!: string;
  @IsString() @MaxLength(600) why!: string;
}

export class SaveDraftDto {
  @IsOptional() @IsString() @MaxLength(150) company?: string;
  @IsOptional() @IsString() @MaxLength(150) business?: string;
  @IsOptional() @IsString() @MaxLength(500) purpose?: string;
  @IsOptional() @IsString() @MaxLength(250) vision?: string;
  @IsOptional() @IsString() @MaxLength(1000) visionWhy?: string;
  @IsOptional() @IsString() @MaxLength(350) mission?: string;
  @IsOptional() @IsString() @MaxLength(1000) missionWhy?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
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
