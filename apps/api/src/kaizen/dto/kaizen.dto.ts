import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, MinLength, ValidateIf } from "class-validator"
import { KaizenStatus, KaizenTrigger } from "db"

export class CreateKaizenDto {
  @IsString()
  @MinLength(5, { message: "Title must be at least 5 characters" })
  title!: string;

  @IsString()
  problem!: string;

  @IsEnum(KaizenTrigger)
  trigger!: KaizenTrigger;

  @ValidateIf((o) => o.trigger === KaizenTrigger.OTHER)
  @IsString()
  triggerOther?: string;

  @IsDateString()
  targetCompletionDate!: string;

  @IsArray()
  @ArrayMaxSize(5, { message: "You can attach up to 5 before photos" })
  @IsString({ each: true })
  beforePhotoUrls!: string[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  teamMemberIds?: string[];

  @IsString()
  @IsOptional()
  benefitCategory?: string;

  @IsString()
  @IsOptional()
  comments?: string;

  @IsBoolean()
  @IsOptional()
  startImprovement?: boolean;
}

export class UpdateKaizenDto {
    @IsString()
    @IsOptional()
    improvementDescription?: string;

    @IsString()
    @IsOptional()
    afterPhotoUrl?: string;


    @IsString()
    @IsOptional()
    benefitAchieved?: string;

    @IsString()
    @IsOptional()
    beforeValue?: string;

    @IsString()
    @IsOptional()
    afterValue?: string;

    @IsString()
    @IsOptional()
    costSaving?: string;

    @IsString()
    @IsOptional()
    comments?: string;

    @IsBoolean()
    @IsOptional()
    submitForVerification?: boolean;
}

export class VerifyKaizenDto{
    @IsString()
    @IsOptional()
    verificationComment?: string

    @IsBoolean()
    @IsOptional()
    standardUpdated?: boolean

    @IsIn(['VERIFIED_CLOSED', 'FURTHER_IMPROVEMENT_REQUIRED', 'MOVED_TO_SGA'])
    disposition!: 'VERIFIED_CLOSED' | 'FURTHER_IMPROVEMENT_REQUIRED' | 'MOVED_TO_SGA'
}


