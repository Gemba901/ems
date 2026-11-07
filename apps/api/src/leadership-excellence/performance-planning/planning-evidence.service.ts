import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PlanningReferencesService } from './planning-references.service';
import { permissions } from './planning.rules';
import type { PlanningState } from './planning.types';

export interface PlanningFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
@Injectable()
export class PlanningEvidenceService {
  constructor(
    private readonly db: PrismaService,
    private readonly refs: PlanningReferencesService,
  ) {}
  private async authorize(
    user: AccessTokenPayload,
    documentId: string,
    findingId: string,
    write = false,
  ) {
    const [row, context] = await Promise.all([
      this.db.lexPlanningWorkspace.findUnique({
        where: { organizationId: user.organizationId },
      }),
      this.refs.get(user),
    ]);
    const state = row?.state as unknown as PlanningState | undefined;
    const document = state?.documents.find(
      (d) => d.id === documentId && d.kind === 'SWOT',
    );
    if (
      !row ||
      !state ||
      !document ||
      ![document.data, ...document.versions.map((v) => v.data)].some((d) =>
        d.findings.some((f) => f.id === findingId),
      )
    )
      throw new NotFoundException('SWOT finding not found.');
    const access = permissions(document, context.actor);
    if (!access.canRead || (write && !access.canEdit))
      throw new ForbiddenException('This finding is restricted or locked.');
    if (
      write &&
      document.versions.some((v) =>
        v.data.findings.some((f) => f.id === findingId),
      )
    )
      throw new BadRequestException(
        'Evidence attached to a reviewed finding is preserved. Add a new finding for new evidence.',
      );
    return { row, state, document, context };
  }
  async list(user: AccessTokenPayload, documentId: string, findingId: string) {
    await this.authorize(user, documentId, findingId);
    return this.db.lexPlanningEvidence.findMany({
      where: { organizationId: user.organizationId, findingId },
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  async upload(
    user: AccessTokenPayload,
    documentId: string,
    findingId: string,
    revision: number,
    file?: PlanningFile,
  ) {
    const { row, state, document, context } = await this.authorize(
      user,
      documentId,
      findingId,
      true,
    );
    if (row.revision !== revision)
      throw new ConflictException(
        'Planning records changed. Refresh before adding evidence.',
      );
    if (!file || !file.size || file.size > 512000)
      throw new BadRequestException('Choose one file up to 500 KB.');
    const extension = file.originalname.split('.').at(-1)?.toLowerCase();
    const allowed: Record<string, string[]> = {
      pdf: ['application/pdf'],
      png: ['image/png'],
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      txt: ['text/plain'],
      csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
      docx: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      xlsx: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    };
    if (!extension || !allowed[extension]?.includes(file.mimetype))
      throw new BadRequestException(
        'Use PDF, PNG, JPG, TXT, CSV, DOCX or XLSX.',
      );
    const name = file.originalname
      .replace(/[\\/\r\n\x00-\x1f]/g, '_')
      .slice(0, 180);
    await this.db.$transaction(async (tx) => {
      const count = await tx.lexPlanningEvidence.count({
        where: { organizationId: user.organizationId, findingId },
      });
      if (count >= 5)
        throw new BadRequestException(
          'Use at most five small supporting files per finding.',
        );
      document.history.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        actorId: user.userId,
        actorName: context.actor.name,
        action: 'Supporting evidence attached',
        detail: name,
      });
      const updated = await tx.lexPlanningWorkspace.updateMany({
        where: { organizationId: user.organizationId, revision },
        data: {
          state: state as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new ConflictException(
          'The assessment changed. Refresh and try again.',
        );
      await tx.lexPlanningEvidence.create({
        data: {
          organizationId: user.organizationId,
          findingId,
          name,
          mimeType: file.mimetype,
          size: file.size,
          content: new Uint8Array(file.buffer),
          uploadedBy: user.userId,
        },
      });
    });
    return this.list(user, documentId, findingId);
  }
  async download(
    user: AccessTokenPayload,
    documentId: string,
    findingId: string,
    id: string,
  ) {
    await this.authorize(user, documentId, findingId);
    const file = await this.db.lexPlanningEvidence.findFirst({
      where: { id, organizationId: user.organizationId, findingId },
    });
    if (!file) throw new NotFoundException('Evidence not found.');
    return file;
  }
}
