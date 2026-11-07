import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PlanningReferencesService } from './planning-references.service';
import { isManager } from './planning.rules';
import type { PlanningState } from './planning.types';
import type { PlanningFile } from './planning-evidence.service';

@Injectable()
export class PlanningBackupService {
  constructor(
    private readonly db: PrismaService,
    private readonly refs: PlanningReferencesService,
  ) {}
  private signature(payload: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
      throw new BadRequestException('Backup signing is not configured.');
    return createHmac('sha256', secret)
      .update('lex-area03-backup-v1\0')
      .update(payload)
      .digest('hex');
  }
  async export(user: AccessTokenPayload) {
    const { actor } = await this.refs.get(user);
    if (!isManager(actor))
      throw new ForbiddenException(
        'Only management can export confidential planning backups.',
      );
    const [row, files] = await this.db.$transaction(
      [
        this.db.lexPlanningWorkspace.findUnique({
          where: { organizationId: user.organizationId },
        }),
        this.db.lexPlanningEvidence.findMany({
          where: { organizationId: user.organizationId },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    if (!row)
      throw new BadRequestException(
        'There is no saved planning workspace to export.',
      );
    const payload = JSON.stringify({
      format: 'gemba-area03-v1',
      organizationId: user.organizationId,
      exportedAt: new Date().toISOString(),
      state: row.state,
      evidence: files.map((f) => ({
        ...f,
        content: Buffer.from(f.content).toString('base64'),
      })),
    });
    const output = { payload, signature: this.signature(payload) };
    if (Buffer.byteLength(JSON.stringify(output)) > 16 * 1024 * 1024)
      throw new BadRequestException(
        'This workspace requires an administrator-managed database backup because its attachments exceed 16 MB.',
      );
    return output;
  }
  async restore(
    user: AccessTokenPayload,
    revision: number,
    file?: PlanningFile,
  ) {
    const { actor } = await this.refs.get(user);
    if (!isManager(actor))
      throw new ForbiddenException(
        'Only management can restore planning backups.',
      );
    if (!file || file.size > 16 * 1024 * 1024)
      throw new BadRequestException(
        'Select an original planning backup up to 16 MB.',
      );
    let envelope: { payload: string; signature: string };
    try {
      envelope = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new BadRequestException('The backup is not valid JSON.');
    }
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      Array.isArray(envelope) ||
      typeof envelope.payload !== 'string' ||
      !/^[a-f0-9]{64}$/.test(envelope.signature || '') ||
      !timingSafeEqual(
        Buffer.from(envelope.signature, 'hex'),
        Buffer.from(this.signature(envelope.payload), 'hex'),
      )
    )
      throw new BadRequestException(
        'The backup signature is invalid. Use an unmodified export from this application.',
      );
    const backup = JSON.parse(envelope.payload) as {
      format: string;
      organizationId: string;
      state: PlanningState;
      evidence: {
        id: string;
        findingId: string;
        name: string;
        mimeType: string;
        size: number;
        content: string;
        uploadedBy: string;
        createdAt: string;
      }[];
    };
    if (
      backup.format !== 'gemba-area03-v1' ||
      backup.organizationId !== user.organizationId ||
      backup.state.schema !== 1
    )
      throw new BadRequestException(
        'This backup belongs to a different organisation or format.',
      );
    await this.db.$transaction(
      async (tx) => {
        const row = await tx.lexPlanningWorkspace.findUnique({
          where: { organizationId: user.organizationId },
        });
        if ((row?.revision || 0) !== revision)
          throw new ConflictException(
            'Planning records changed. Refresh before restoring.',
          );
        const current = row?.state as unknown as PlanningState | undefined;
        // Restores may not erase an approved version, delete a record or reuse a code.
        for (const document of current?.documents || []) {
          const restored = backup.state.documents.find(
            (d) => d.id === document.id,
          );
          if (
            !restored ||
            document.versions.some(
              (version) =>
                JSON.stringify(
                  restored.versions.find((v) => v.version === version.version),
                ) !== JSON.stringify(version),
            )
          )
            throw new BadRequestException(
              'This older backup would remove a record or approved history. Restore into a separate development database instead.',
            );
          const events = new Map(
            [...restored.history, ...document.history].map((event) => [
              event.id,
              event,
            ]),
          );
          restored.history = [...events.values()].sort((a, b) =>
            a.at.localeCompare(b.at),
          );
        }
        backup.state.sequence = Math.max(
          backup.state.sequence,
          current?.sequence || 0,
        );
        for (const document of backup.state.documents)
          document.history.push({
            id: randomUUID(),
            at: new Date().toISOString(),
            actorId: user.userId,
            actorName: actor.name,
            action: 'Workspace restored from signed backup',
            detail: 'Approved versions preserved',
          });
        if (row) {
          const update = await tx.lexPlanningWorkspace.updateMany({
            where: { organizationId: user.organizationId, revision },
            data: {
              state: backup.state as unknown as Prisma.InputJsonValue,
              revision: { increment: 1 },
            },
          });
          if (!update.count)
            throw new ConflictException(
              'The workspace changed while restoring.',
            );
        } else
          await tx.lexPlanningWorkspace.create({
            data: {
              organizationId: user.organizationId,
              revision: 1,
              state: backup.state as unknown as Prisma.InputJsonValue,
            },
          });
        for (const f of backup.evidence)
          await tx.lexPlanningEvidence.upsert({
            where: { id: f.id },
            update: {},
            create: {
              id: f.id,
              organizationId: user.organizationId,
              findingId: f.findingId,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
              content: new Uint8Array(Buffer.from(f.content, 'base64')),
              uploadedBy: f.uploadedBy,
              createdAt: new Date(f.createdAt),
            },
          });
      },
      { timeout: 30000 },
    );
    return { message: 'Planning backup restored; approved history preserved.' };
  }
}
