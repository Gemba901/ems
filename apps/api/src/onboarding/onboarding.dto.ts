import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class SignupDto {
  // A random client-generated key makes network retries idempotent.
  @Matches(/^[a-f0-9]{64}$/) requestKey!: string;
  @IsString() @Length(3, 40) slug!: string;
  @IsString() @Length(2, 120) companyName!: string;
  // Optional for compatibility with signups from the previous web deployment.
  @IsOptional() @IsString() @Length(1, 20) @Matches(/\S/) shortName?: string;
  @IsOptional() @IsString() @Length(2, 120) @Matches(/\S/) industry?: string;
  @IsOptional() @IsEmail() @Length(3, 254) companyEmail?: string;
  @IsOptional() @Matches(/^\+?[0-9]{7,15}$/) companyPhone?: string;
  @IsOptional()
  @IsString()
  @Length(2, 500)
  @Matches(/\S/)
  companyAddress?: string;
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
