import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { PlanningCommand } from '../planning.types';

export class PlanningCommandDto implements PlanningCommand {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsIn([
    'CREATE_PLAN',
    'SAVE_SETTINGS',
    'SAVE_ITEM',
    'DELETE_ITEM',
    'CONSIDER_PILLAR',
    'CONSIDER_ALL_PILLARS',
    'SUBMIT',
    'APPROVE',
    'RETURN',
    'REVISE',
    'ACKNOWLEDGE',
    'SAVE_DEFINITION',
    'LINK_ACTION',
    'UNLINK_ACTION',
  ])
  action!: PlanningCommand['action'];
  @IsOptional() @IsString() @MaxLength(100) documentId?: string;
  @IsObject() payload!: Record<string, unknown>;
}
