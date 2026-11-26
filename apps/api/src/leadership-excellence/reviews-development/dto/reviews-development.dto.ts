import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'must be a date (YYYY-MM-DD)';
const TEXT_MAX = 2500;
const REASON_MAX = 1000;

export class CreateReviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  planDocumentId!: string;

  @Matches(DATE, { message: `periodStart ${DATE_MSG}` })
  periodStart!: string;

  @Matches(DATE, { message: `periodEnd ${DATE_MSG}` })
  periodEnd!: string;

  /** Planned or held discussion date. */
  @Matches(DATE, { message: `meetingDate ${DATE_MSG}` })
  meetingDate!: string;
}

/** The subject's own reflection. */
export class UpdateReflectionDto {
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) achievements?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) challenges?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) learning?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) supportNeeded?: string;
}

/** The reviewer's section. */
export class UpdateReviewDiscussionDto {
  @Matches(DATE, { message: `meetingDate ${DATE_MSG}` })
  meetingDate!: string;

  @IsOptional() @IsString() @MaxLength(TEXT_MAX) recognition?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) findings?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) decisions?: string;
  /** Why the employee's reflection is unavailable (personal reviews). */
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) noInputReason?: string;
  /** Why the review proceeds with incomplete verified data. */
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) dataLimitReason?: string;

  @IsOptional()
  @Matches(DATE, { message: `nextReviewDate ${DATE_MSG}` })
  nextReviewDate?: string;
}

export class ReviewReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(REASON_MAX)
  reason!: string;
}

export class AcknowledgeReviewDto {
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) comment?: string;
  /** Raise a concern; a comment is then required. */
  @IsOptional() @IsBoolean() concern?: boolean;
}

export class CreateCoachingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  planDocumentId!: string;

  @IsIn(['RECOGNITION', 'FEEDBACK', 'COACHING'])
  kind!: 'RECOGNITION' | 'FEEDBACK' | 'COACHING';

  @Matches(DATE, { message: `date ${DATE_MSG}` })
  date!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  topic!: string;

  /** "role" | "goal:<id>" | "kpi:<id>" */
  @IsOptional()
  @Matches(/^(role|(goal|kpi|kra):[\w-]{1,120})$/, {
    message: 'relatesTo must be role, goal:<id>, kpi:<id> or kra:<id>',
  })
  relatesTo?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(TEXT_MAX)
  notes!: string;

  @IsOptional() @IsString() @MaxLength(2000) support?: string;
}

/** Each participant may change only their own part. */
export class UpdateCoachingDto {
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) notes?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) support?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) response?: string;
}

export class LinkActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  actionId!: string;
}

export class RecordEffectivenessDto {
  @IsIn(['EFFECTIVE', 'PARTLY_EFFECTIVE', 'NOT_EFFECTIVE'])
  status!: 'EFFECTIVE' | 'PARTLY_EFFECTIVE' | 'NOT_EFFECTIVE';

  @IsString()
  @IsNotEmpty()
  @MaxLength(TEXT_MAX)
  note!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1500)
  evidence!: string;
}

/** Area 07 read filters. */
export class DevelopmentReadQueryDto {
  @IsOptional()
  @Matches(DATE, { message: `periodStart ${DATE_MSG}` })
  periodStart?: string;

  @IsOptional()
  @Matches(DATE, { message: `periodEnd ${DATE_MSG}` })
  periodEnd?: string;

  @IsOptional() @IsString() @MaxLength(200) departmentId?: string;
  @IsOptional() @IsString() @MaxLength(200) employeeId?: string;
}
