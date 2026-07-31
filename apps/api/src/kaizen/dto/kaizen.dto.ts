import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator"
import { KaizenStatus } from "db"

export class CreateKaizenDto {
  @IsString()
  problem!: string;

  @IsString()
  beforePhotoUrl!: string;

  @IsString()
  @IsOptional()
  teamMembers?: string;

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


