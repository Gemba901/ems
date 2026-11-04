import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ApprovedStrategicDirection,
  CoreValue,
  StrategicDirectionProvider,
  StrategicDirectionSummary,
} from '../common/contracts';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { SaveDraftDto } from './dto/strategic-direction.dto';
import { randomUUID } from 'crypto';
import { Prisma } from 'db';

// the content stored in each approved version's snapshot column.

type DirectionContent = Omit<
  ApprovedStrategicDirection,
  'version' | 'approvedAt' | 'approvedById'
>;

// Plain text columns on LexStrategicDirection that the draft form edits.
const TEXT_FIELDS = [
  'company',
  'business',
  'purpose',
  'vision',
  'visionWhy',
  'mission',
  'missionWhy',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

@Injectable()
export class StrategicDirectionService implements StrategicDirectionProvider {
  constructor(private readonly prisma: PrismaService) {}

  async getApproved(
    organizationId: string,
  ): Promise<ApprovedStrategicDirection | null> {
    const direction = await this.prisma.lexStrategicDirection.findUnique({
      where: { organizationId },
      select: { id: true, currentVersion: true },
    });

    if (!direction?.currentVersion) return null;

    const row = await this.prisma.lexStrategicDirectionVersion.findUnique({
      where: {
        directionId_version: {
          directionId: direction.id,
          version: direction.currentVersion,
        },
      },
    });
    if (!row) return null;

    return {
      ...(row.snapshot as unknown as DirectionContent),
      version: row.version,
      approvedAt: row.approvedAt,
      approvedById: row.approvedById,
    };
  }

  async getSummary(organizationId: string): Promise<StrategicDirectionSummary> {
    const approved = await this.getApproved(organizationId);
    if (approved)
      return {
        company: approved.company,
        approved: true,
        version: approved.version,
      };

    const draft = await this.prisma.lexStrategicDirection.findUnique({
      where: { organizationId },
      select: { company: true },
    });

    return { company: draft?.company ?? '', approved: false, version: null };
  }

  async getDraft(organizationId: string) {
    const draft = await this.prisma.lexStrategicDirection.findUnique({
      where: {
        organizationId,
      },
    });
    if (draft) return draft;

    return {
      id: null,
      organizationId,
      status: 'DRAFT' as const,
      company: null,
      business: null,
      purpose: null,
      vision: null,
      visionWhy: null,
      mission: null,
      missionWhy: null,
      values: [],
      sectionMeta: {},
      returnReason: null,
      revisionReason: null,
      submittedAt: null,
      currentVersion: null,
    };
  }

  async saveDraft(user: AccessTokenPayload, dto: SaveDraftDto) {
    const actor = await this.prisma.employee.findFirst({
      where: {
        userId: user.userId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
      },
    });
    const actorId = actor?.id ?? null;

    const draft = await this.prisma.lexStrategicDirection.findUnique({
      where: {
        organizationId: user.organizationId,
      },
    });

    if (draft?.status === 'IN_REVIEW') {
      throw new ConflictException('Withdraw the submission before editing.');
    } else if (draft?.status === 'APPROVED') {
      throw new ConflictException('Start a revision before editing');
    }

    // step 3: keep only the fields that actually changed.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const data: Partial<Record<TextField, string | null>> & {
      values?: Prisma.InputJsonValue;
    } = {};

    for (const field of TEXT_FIELDS) {
      if (dto[field] === undefined) continue;
      const next = dto[field]?.trim() || null;
      const prev = draft?.[field] ?? null;

      if (next !== prev) {
        changes[field] = { from: prev, to: next };
        data[field] = next;
      }
    }

    if (dto.values) {
      // step 4: stable ids, because version snapshots and  Area 03 reference values by id
      const values = dto.values.map((v) => ({
        id: v.id ?? randomUUID(),
        name: v.name.trim(),
        why: v.why.trim(),
      }));
      if (new Set(values.map((v) => v.id)).size !== values.length) {
        throw new BadRequestException('Duplicate core value id.');
      }
      const prev = (draft?.values ?? []) as unknown as CoreValue[];

      const key = (vs: CoreValue[]) =>
        JSON.stringify(vs.map((v) => [v.id, v.name, v.why]));
      if (key(values) !== key(prev)) {
        changes.values = { from: prev, to: values };
        data.values = values;
      }
    }

    if (Object.keys(changes).length === 0)
      return draft ?? this.getDraft(user.organizationId);

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.lexStrategicDirection.upsert({
        where: { organizationId: user.organizationId },
        create: { organizationId: user.organizationId, ...data },
        update: data,
      });

      await tx.lexStrategicDirectionEvent.create({
        data: {
          directionId: saved.id,
          organizationId: user.organizationId,
          action: 'DRAFT_SAVED',
          changes: changes as Prisma.InputJsonObject,
          actorId,
        },
      });

      return saved;
    });
  }
}
