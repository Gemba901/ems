import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const NOTE_MAX = 1500;

export class VerifyResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  submissionIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string;
}

export class ReturnResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  submissionIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_MAX)
  reason!: string; // "Explain what must be corrected."
}

export class MonitoringQueryDto {
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  assignmentId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month?: string;
}

export class AlertQueryDto {
  @IsOptional()
  @IsIn([
    'OPEN',
    'ACKNOWLEDGED',
    'ESCALATED',
    'FOLLOW_UP_LINKED',
    'CLOSED',
    'ACTIVE',
  ])
  status?: string;
}

export class AlertNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_MAX)
  note!: string;
}

export class LinkFollowUpDto extends AlertNoteDto {
  @IsUUID()
  actionId!: string;
}
