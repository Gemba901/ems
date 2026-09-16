import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export function companyUploadKey(
  organizationId: string,
  folder: string,
  fileName: string,
): string {
  if (!organizationId || !/^[a-zA-Z0-9-]+$/.test(organizationId))
    throw new BadRequestException('Company context is required');
  if (
    typeof folder !== 'string' ||
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(folder)
  ) {
    throw new BadRequestException('Invalid upload folder');
  }
  if (
    typeof fileName !== 'string' ||
    !fileName.trim() ||
    fileName.length > 200 ||
    /[\/\\\x00-\x1f]/.test(fileName)
  ) {
    throw new BadRequestException('Invalid file name');
  }
  return `organizations/${organizationId}/${folder}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}
