import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
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

/** 05.01 completion check of a delivery action the owner marked done. */
export class ActionCheckDto {
  @IsIn(['COMPLETE', 'RETURN'])
  decision!: 'COMPLETE' | 'RETURN';

  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string;
}

/** 05.02 organisation setting: the "needs attention" band as % of target. */
export class MonitoringSettingsDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  warningTolerancePct!: number;
}
