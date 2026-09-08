import { ConflictException } from '@nestjs/common';

export function rethrowTaskConflict(error: unknown): never {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2025'
  ) {
    throw new ConflictException(
      'This task changed while you were editing it. Refresh and try again.',
    );
  }
  throw error;
}
