import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class SignupDto {
  // A random client-generated key makes network retries idempotent.
  @Matches(/^[a-f0-9]{64}$/) requestKey!: string;
  @IsString() @Length(3, 40) slug!: string;
  @IsString() @Length(2, 120) companyName!: string;
  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;
  @IsEmail() @Length(3, 254) email!: string;
  @Matches(/^\+?[0-9]{7,15}$/) phone!: string;
  @IsString() @Length(1, 80) timeZone!: string;
}
export class OnboardingAccessDto {
  @Matches(/^[a-f0-9-]{36}$/) id!: string;
  @Matches(/^[a-f0-9]{64}$/) token!: string;
}
export class VerifySignupDto extends OnboardingAccessDto {
  // bcrypt uses at most 72 bytes; the service also checks UTF-8 byte length.
  @IsString() @Length(1, 72) password!: string;
}
