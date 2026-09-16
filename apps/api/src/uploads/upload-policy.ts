import { BadRequestException } from '@nestjs/common';
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const SAFE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const ALLOWED = new Set([
  ...SAFE_IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
export function validateUpload(type: unknown, size: unknown) {
  if (typeof type !== 'string' || !ALLOWED.has(type))
    throw new BadRequestException('Unsupported file type');
  if (
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_UPLOAD_BYTES
  )
    throw new BadRequestException('Files must be between 1 byte and 20 MiB');
}
export function managedFileIds(
  value: unknown,
  ids = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 30) throw new BadRequestException('Request nesting is too deep');
  if (typeof value === 'string' && value.startsWith('/api/uploads/files/')) {
    const id = value.slice('/api/uploads/files/'.length);
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new BadRequestException('Invalid file reference');
    ids.add(id);
  } else if (Array.isArray(value)) {
    for (const item of value) managedFileIds(item, ids, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value))
      managedFileIds(item, ids, depth + 1);
  }
  return ids;
}
