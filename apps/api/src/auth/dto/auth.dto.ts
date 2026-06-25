import { IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

// define expected payload and its validation rules
export class VerifyFirstTimeDto{
    @Expose()
    @IsOptional()
    @IsString()
    phoneOrEmail?: string;

    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'Employee code cannot be blank' })
    employeeCode?: string;
}

export class CreatePasswordDto {
    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'Setup token is required' })
    setupToken!: string;

    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'New password is required' })
    @MinLength(6, { message: 'Password must be at least 6 characters' })
    newPassword!: string;
}

export class LoginDto {
    @Expose()
    @IsOptional()
    @IsString()
    phoneOrEmail?: string;

    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'Employee code cannot be blank' })
    employeeCode?: string;

    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(6, { message: 'Password must be at least 6 characters' })
    password!: string;
}

export class SelectOrgDto {
    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'Selection token is required' })
    selectionToken!: string;

    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'Organization ID is required' })
    organizationId!: string;
}
