import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { LibraryCommand } from './library.types';

export class LibraryCommandDto implements LibraryCommand {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsIn(['SAVE_DRAFT', 'SUBMIT', 'APPROVE', 'RETURN', 'REVISE'])
  action!: LibraryCommand['action'];
  @IsOptional() @IsString() @MaxLength(100) definitionId?: string;
  @IsObject() payload!: Record<string, unknown>;
}
