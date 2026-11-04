import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
}
