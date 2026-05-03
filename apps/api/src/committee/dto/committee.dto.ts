import { IsString, IsNotEmpty, IsEnum, IsUUID } from 'class-validator';
import { CommitteeType } from 'db';

export class CreateCommitteeDto {
  @IsString()
  @IsNotEmpty({ message: 'Committee name is required' })
  name!: string;

  @IsEnum(CommitteeType, { message: 'Invalid committee type' })
  type!: CommitteeType;
}

export class AddMemberDto {
  @IsUUID('4', { message: 'Invalid employee ID' })
  employeeId!: string;
}
