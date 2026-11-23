import { IsIn } from 'class-validator';

export const PLANNING_LIBRARY_KINDS = [
  'finding',
  'objective',
  'department-goal',
] as const;

export type PlanningLibraryKind = (typeof PLANNING_LIBRARY_KINDS)[number];

export class PlanningLibraryQueryDto {
  @IsIn(PLANNING_LIBRARY_KINDS, {
    message:
      'Choose a SWOT, company objective or department goal template library.',
  })
  kind!: PlanningLibraryKind;
}
