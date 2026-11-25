import { IsString, Matches, MaxLength } from 'class-validator';

/** Organisation → Departments → Choose HOD. Registered employees only, or NONE for "No HOD (by choice)". */
export class UpdateDepartmentBranchHodDto {
  @IsString() @MaxLength(200) branch!: string;
  @IsString() @MaxLength(100) @Matches(/^(?:NONE|employee:[A-Za-z0-9_-]+)$/) target!: string;
  @IsString() @MaxLength(1000) expectedVersion!: string;
}
