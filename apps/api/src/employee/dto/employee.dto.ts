import { IsString, IsNotEmpty, IsEmail, IsOptional, IsNumber, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';

// DTO for creating a new employee
export class CreateEmployeeDto {
  @Expose()
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @Expose()
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @Expose()
  @IsEmail({}, { message: 'Valid email is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  departmentId?: string;

  @Expose()
  @Type(() => Number)
  @IsNumber({}, { message: 'Role ID must be a number' })
  @IsNotEmpty({ message: 'Role is required' })
  roleId!: number;
}

// DTO for updating an employee
export class UpdateEmployeeDto {
  @Expose()
  @IsString()
  @IsOptional()
  firstName?: string;

  @Expose()
  @IsString()
  @IsOptional()
  lastName?: string;

  @Expose()
  @IsEmail({}, { message: 'Valid email is required' })
  @IsOptional()
  email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  departmentId?: string;
}

// DTO for changing an employee's role
export class UpdateEmployeeRoleDto {
  @Expose()
  @Type(() => Number)
  @IsNumber({}, { message: 'Role ID must be a number' })
  @IsNotEmpty({ message: 'Role ID is required' })
  roleId!: number;
}

// DTO for admin password reset
export class ResetPasswordDto {
  @Expose()
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  newPassword!: string;
}

// DTO for updating avatar
export class UpdateAvatarDto {
  @Expose()
  @IsString()
  @IsNotEmpty({ message: 'Avatar URL is required' })
  avatarUrl!: string;
}

// DTO for pagination query parameters
export class PaginationDto {
  @Expose()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Page must be at least 1' })
  @IsOptional()
  page: number = 1;

  @Expose()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Limit must be at least 1' })
  @IsOptional()
  limit: number = 10;
}
