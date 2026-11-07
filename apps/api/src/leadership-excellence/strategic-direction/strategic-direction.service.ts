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
import { Prisma, type LexStrategicDirection } from 'db';

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
// Labels match the prototype form, so validation problems read like the page.
const FIELD_LABELS: Record<TextField, string> = {
  company: 'Organisation name',
  business: 'Nature of business',
  purpose: 'Purpose',
  vision: 'Vision statement',
  visionWhy: 'Why this vision?',
  mission: 'Mission statement',
  missionWhy: 'Why this mission?',
};

// The form's four sections; each shows "Last updated <date> · <name>".
type Section = 'organisation' | 'vision' | 'mission' | 'values';
const SECTION_OF: Record<TextField, Section> = {
  company: 'organisation',
  business: 'organisation',
  purpose: 'organisation',
  vision: 'vision',
  visionWhy: 'vision',
  mission: 'mission',
  missionWhy: 'mission',
};

type SectionStamp = { at: string; byId: string | null; byName: string | null };
type Actor = { id: string; name: string } | null;
type FieldChanges = Record<string, { from: unknown; to: unknown }>;
type Direction = LexStrategicDirection;

const NAME = { firstName: true, lastName: true } as const;
const fullName = (e: { firstName: string; lastName: string } | null) =>
  e ? `${e.firstName} ${e.lastName}` : null;

// jsonb reorders object keys, so compare values as tuples rather than JSON.stringify of objects.
const valuesKey = (vs: CoreValue[]) =>
  JSON.stringify(vs.map((v) => [v.id, v.name, v.why]));

// Field-by-field difference between two versions, in the same shape as DRAFT_SAVED events.
function changesBetween(
  before: DirectionContent | null,
  after: DirectionContent,
): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of TEXT_FIELDS) {
    const from = before?.[field] ?? null;
    if (from !== after[field]) changes[field] = { from, to: after[field] };
  }
  const from = before?.values ?? [];
  if (valuesKey(from) !== valuesKey(after.values))
    changes.values = { from, to: after.values };
  return changes;
}

@Injectable()
export class StrategicDirectionService implements StrategicDirectionProvider {
  constructor(private readonly prisma: PrismaService) {}

  // SUPER_ADMIN often has no Employee row, so this can be null.
  private async findActor(user: AccessTokenPayload): Promise<Actor> {
    const actor = await this.prisma.employee.findFirst({
      where: { userId: user.userId, organizationId: user.organizationId },
      select: { id: true, ...NAME },
    });
    return actor && { id: actor.id, name: fullName(actor)! };
  }

  private async findDirection(organizationId: string): Promise<Direction> {
    const direction = await this.prisma.lexStrategicDirection.findUnique({
      where: { organizationId },
    });
    if (!direction) throw new BadRequestException('Save a draft first.');
    return direction;
  }

  // Same rules as validateRequired() in the prototype.
  private missingItems(direction: Direction) {
    const problems: { field: string; label: string }[] = [];
    for (const field of TEXT_FIELDS) {
      if (!direction[field]?.trim())
        problems.push({ field, label: FIELD_LABELS[field] });
    }

    const values = direction.values as unknown as CoreValue[];
    if (values.length === 0)
      problems.push({ field: 'values', label: 'At least one core value' });
    values.forEach((v, i) => {
      if (!v.name?.trim())
        problems.push({ field: `${v.id}-name`, label: `Value ${i + 1} name` });
      if (!v.why?.trim())
        problems.push({
          field: `${v.id}-why`,
          label: `Value ${i + 1} explanation`,
        });
    });
    return problems;
  }

  private contentOf(direction: Direction): DirectionContent {
    return {
      company: direction.company ?? '',
      business: direction.business ?? '',
      purpose: direction.purpose ?? '',
      vision: direction.vision ?? '',
      visionWhy: direction.visionWhy ?? '',
      mission: direction.mission ?? '',
      missionWhy: direction.missionWhy ?? '',
      values: direction.values as unknown as CoreValue[],
    };
  }

  private requireReason(reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) throw new BadRequestException('Enter a reason.');
    return trimmed;
  }

  // Moves the direction to a new status and records the event in one transaction.
  private transition(
    direction: Direction,
    actor: Actor,
    action: 'WITHDRAWN' | 'RETURNED' | 'REVISION_STARTED',
    data: Prisma.LexStrategicDirectionUncheckedUpdateInput,
    reason: string | null = null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.lexStrategicDirection.update({
        where: { id: direction.id },
        data,
      });
      await tx.lexStrategicDirectionEvent.create({
        data: {
          directionId: direction.id,
          organizationId: direction.organizationId,
          action,
          changes: {},
          reason,
          version: direction.currentVersion,
          actorId: actor?.id ?? null,
        },
      });
      return saved;
    });
  }

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
      include: { submittedBy: { select: NAME } },
    });

    if (!draft) {
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
        submittedByName: null,
        currentVersion: null,
        approved: null,
      };
    }

    // The published version stays live while a revision is drafted, so the page shows both.
    const published = draft.currentVersion
      ? await this.prisma.lexStrategicDirectionVersion.findUnique({
          where: {
            directionId_version: {
              directionId: draft.id,
              version: draft.currentVersion,
            },
          },
          select: {
            version: true,
            approvedAt: true,
            approvedBy: { select: NAME },
          },
        })
      : null;

    const { submittedBy, ...rest } = draft;
    return {
      ...rest,
      submittedByName: fullName(submittedBy),
      approved: published && {
        version: published.version,
        approvedAt: published.approvedAt,
        approvedByName: fullName(published.approvedBy),
      },
    };
  }

  /** getApproved() plus the approver's name, for the employee view. */
  async getPublished(organizationId: string) {
    const approved = await this.getApproved(organizationId);
    if (!approved) return null;

    const approver = approved.approvedById
      ? await this.prisma.employee.findUnique({
          where: { id: approved.approvedById },
          select: NAME,
        })
      : null;
    return { ...approved, approvedByName: fullName(approver) };
  }

  async getHistory(organizationId: string) {
    const events = await this.prisma.lexStrategicDirectionEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: NAME } },
    });
    return events.map(({ actor, ...event }) => ({
      ...event,
      actorName: fullName(actor),
    }));
  }

  async saveDraft(user: AccessTokenPayload, dto: SaveDraftDto) {
    const actor = await this.findActor(user);
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
    const changes: FieldChanges = {};
    const data: Partial<Record<TextField, string | null>> & {
      values?: Prisma.InputJsonValue;
      sectionMeta?: Prisma.InputJsonValue;
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

      if (valuesKey(values) !== valuesKey(prev)) {
        changes.values = { from: prev, to: values };
        data.values = values;
      }
    }

    if (Object.keys(changes).length === 0)
      return draft ?? this.getDraft(user.organizationId);

    // Stamp each section that changed, for its "Last updated" line.
    const sectionMeta = {
      ...((draft?.sectionMeta ?? {}) as unknown as Record<
        string,
        SectionStamp
      >),
    };
    const stamp: SectionStamp = {
      at: new Date().toISOString(),
      byId: actorId,
      byName: actor?.name ?? null,
    };
    for (const field of Object.keys(changes)) {
      sectionMeta[
        field === 'values' ? 'values' : SECTION_OF[field as TextField]
      ] = stamp;
    }
    data.sectionMeta = sectionMeta;

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

  async submit(user: AccessTokenPayload) {
    const actor = await this.findActor(user);
    const draft = await this.findDirection(user.organizationId);
    if (draft.status !== 'DRAFT') {
      throw new ConflictException('Only a draft can be submitted for review.');
    }

    const problems = this.missingItems(draft);
    if (problems.length > 0) {
      throw new BadRequestException({
        message: 'Complete these fields before sending for review.',
        problems,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.lexStrategicDirection.update({
        where: { id: draft.id },
        data: {
          status: 'IN_REVIEW',
          submittedAt: new Date(),
          submittedById: actor?.id ?? null,
          returnReason: null,
        },
      });

      await tx.lexStrategicDirectionEvent.create({
        data: {
          directionId: saved.id,
          organizationId: user.organizationId,
          action: 'SUBMITTED',
          changes: {},
          version: draft.currentVersion,
          actorId: actor?.id ?? null,
        },
      });

      return saved;
    });
  }

  /** The submitter takes a pending review back to keep editing. */
  async withdraw(user: AccessTokenPayload) {
    const actor = await this.findActor(user);
    const direction = await this.findDirection(user.organizationId);
    if (direction.status !== 'IN_REVIEW') {
      throw new ConflictException(
        'Only a submission under review can be withdrawn.',
      );
    }

    return this.transition(direction, actor, 'WITHDRAWN', {
      status: 'DRAFT',
      submittedAt: null,
      submittedById: null,
    });
  }

  /** An approver sends the submission back with what to correct. */
  async returnForChanges(user: AccessTokenPayload, reason: string) {
    const text = this.requireReason(reason);
    const actor = await this.findActor(user);
    const direction = await this.findDirection(user.organizationId);
    if (direction.status !== 'IN_REVIEW') {
      throw new ConflictException(
        'Only a submission under review can be returned.',
      );
    }

    return this.transition(
      direction,
      actor,
      'RETURNED',
      {
        status: 'DRAFT',
        returnReason: text,
        submittedAt: null,
        submittedById: null,
      },
      text,
    );
  }

  /**
   * Publishes the direction as the next version. Approvers may finalise a draft
   * directly or approve a submission, as in the prototype's "Finalise & lock".
   */
  async approve(user: AccessTokenPayload) {
    const actor = await this.findActor(user);
    const direction = await this.findDirection(user.organizationId);
    if (direction.status === 'APPROVED') {
      throw new ConflictException('This direction is already approved.');
    }

    const problems = this.missingItems(direction);
    if (problems.length > 0) {
      throw new BadRequestException({
        message: 'Complete these fields before approving.',
        problems,
      });
    }

    const content = this.contentOf(direction);
    const previous = await this.getApproved(user.organizationId);
    const version = (direction.currentVersion ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      // @@unique([directionId, version]) rejects a second concurrent approval.
      await tx.lexStrategicDirectionVersion.create({
        data: {
          directionId: direction.id,
          organizationId: direction.organizationId,
          version,
          snapshot: content as unknown as Prisma.InputJsonObject,
          sectionMeta: direction.sectionMeta as Prisma.InputJsonValue,
          approvedById: actor?.id ?? null,
        },
      });

      const saved = await tx.lexStrategicDirection.update({
        where: { id: direction.id },
        data: {
          status: 'APPROVED',
          currentVersion: version,
          returnReason: null,
          revisionReason: null,
          submittedAt: null,
          submittedById: null,
        },
      });

      await tx.lexStrategicDirectionEvent.create({
        data: {
          directionId: direction.id,
          organizationId: direction.organizationId,
          action: 'APPROVED',
          // What this version changed compared with the one it replaces.
          changes: changesBetween(previous, content) as Prisma.InputJsonObject,
          reason: direction.revisionReason,
          version,
          actorId: actor?.id ?? null,
        },
      });

      return saved;
    });
  }

  /**
   * Opens an editable draft from the approved wording. Employees keep seeing the
   * approved version until its replacement is approved.
   */
  async startRevision(user: AccessTokenPayload, reason: string) {
    const text = this.requireReason(reason);
    const actor = await this.findActor(user);
    const direction = await this.findDirection(user.organizationId);
    if (direction.status !== 'APPROVED' || !direction.currentVersion) {
      throw new ConflictException('Only an approved direction can be revised.');
    }

    const published = await this.prisma.lexStrategicDirectionVersion.findUnique(
      {
        where: {
          directionId_version: {
            directionId: direction.id,
            version: direction.currentVersion,
          },
        },
      },
    );
    if (!published)
      throw new ConflictException('The approved version is missing.');
    const snapshot = published.snapshot as unknown as DirectionContent;

    return this.transition(
      direction,
      actor,
      'REVISION_STARTED',
      {
        status: 'DRAFT',
        ...snapshot,
        values: snapshot.values as unknown as Prisma.InputJsonArray,
        sectionMeta: published.sectionMeta as Prisma.InputJsonValue,
        revisionReason: text,
        returnReason: null,
      },
      text,
    );
  }
}
