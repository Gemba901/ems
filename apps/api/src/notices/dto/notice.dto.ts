import { IsBoolean, IsIn, IsOptional, IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateNoticeDto {
    @IsIn(['ANNOUNCEMENT', 'REMINDER', 'INFO', 'ALERT'])
    type: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    body: string;

    @IsOptional()
    @IsBoolean()
    pinned?: boolean;

    @IsOptional()
    @IsDateString()
    expiresAt?: string;
}

export class UpdateNoticeDto {
    @IsOptional()
    @IsIn(['ANNOUNCEMENT', 'REMINDER', 'INFO', 'ALERT'])
    type?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    title?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    body?: string;

    @IsOptional()
    @IsBoolean()
    pinned?: boolean;

    @IsOptional()
    @IsDateString()
    expiresAt?: string | null;
}
