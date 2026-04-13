import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { Expose } from 'class-transformer';

// define expected payload and its validation rules
export class VerifyFirstTimeDto{
    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'Phone or Email is required' })
    phoneOrEmail!: string;
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
    @IsString()
    @IsNotEmpty({ message: 'Phone or email is required' })
    phoneOrEmail!: string;

    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(6, { message: 'Password must be at least 6 characters' })
    password!: string;
}
