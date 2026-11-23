import { IsIn, IsInt, IsObject, Min } from 'class-validator';
import type { ExecutionCommand } from '../execution.types';

export class ExecutionCommandDto implements ExecutionCommand {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsIn([
    'SAVE_RESULTS',
    'SUBMIT_RESULTS',
    'UPDATE_ACTION',
    'CHECK_ACTION',
    'CREATE_SUPPORT',
    'ACKNOWLEDGE_SUPPORT',
    'UPDATE_SUPPORT',
  ])
  action!: ExecutionCommand['action'];

  @IsObject()
  payload!: Record<string, unknown>;
}
