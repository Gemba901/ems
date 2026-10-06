import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { HomeLocationRequestStatus, WorkArrangement } from 'db';
import { CapturedLocationDto } from './attendance.dto';
import { PageQueryDto, Trim } from './common.dto';

export class UpdateLocationSettingsDto {
    @Type(() => Number)
    @IsInt()
    @Min(25)
    @Max(5000)
    homeRadiusMeters!: number;
}

export class CreateSiteDto {
    @Trim()
    @IsString()
    @Length(1, 120)
    name!: string;

    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(-90)
    @Max(90)
    latitude!: number;

    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(-180)
    @Max(180)
    longitude!: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(25)
    @Max(5000)
    radiusMeters?: number;
}

export class UpdateSiteDto {
    @IsOptional()
    @Trim()
    @IsString()
    @Length(1, 120)
    name?: string;

    @IsOptional()
    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(-90)
    @Max(90)
    latitude?: number;

    @IsOptional()
    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(-180)
    @Max(180)
    longitude?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(25)
    @Max(5000)
    radiusMeters?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class ArrangementQueryDto extends PageQueryDto {
    @IsOptional()
    @Trim()
    @IsString()
    @Length(1, 100)
    search?: string;

    @IsOptional()
    @IsEnum(WorkArrangement)
    arrangement?: WorkArrangement;
}

export class UpdateArrangementDto {
    @IsEnum(WorkArrangement)
    arrangement!: WorkArrangement;

    // Forgets the approved home; the employee then has to request one again.
    @IsOptional()
    @IsBoolean()
    clearHome?: boolean;
}

// Captured on the employee's device while at home.
export class HomeLocationRequestDto {
    @IsDefined()
    @ValidateNested()
    @Type(() => CapturedLocationDto)
    location!: CapturedLocationDto;

    @IsOptional()
    @Trim()
    @IsString()
    @Length(1, 500)
    note?: string;
}

export class HomeRequestQueryDto {
    @IsOptional()
    @IsEnum(HomeLocationRequestStatus)
    status?: HomeLocationRequestStatus;
}

export class ReviewHomeRequestDto {
    @IsIn([HomeLocationRequestStatus.APPROVED, HomeLocationRequestStatus.REJECTED])
    decision!: 'APPROVED' | 'REJECTED';

    @IsOptional()
    @Trim()
    @IsString()
    @Length(1, 500)
    note?: string;
}
