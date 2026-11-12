import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ApprovedStrategicDirection,
  CoreValue,
  DEFAULT_PILLAR_WEIGHTS,
  LEX_PILLARS,
  type PillarWeights,
  StrategicDirectionProvider,
  StrategicDirectionSummary,
} from '../common/contracts';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import {
  SaveDraftDto,
  TEXT_LIMITS,
  VALUE_LIMITS,
} from './dto/strategic-direction.dto';
import { randomUUID } from 'crypto';
import { Prisma, type LexStrategicDirection } from 'db';
import { DIRECTION_EDITORS } from './strategic-direction.roles';

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
type Section = 'organisation' | 'vision' | 'mission' | 'values' | 'pillars';
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

// Approvers are chosen from current management-level staff.
const CURRENT_STAFF = ['ACTIVE', 'PROBATION'] as const;
const PERSON = { id: true, jobTitle: true, ...NAME } as const;
type Person = { id: string; jobTitle: string | null } & {
  firstName: string;
  lastName: string;
};
const personOf = (e: Person) => ({
  employeeId: e.id,
  name: fullName(e)!,
  jobTitle: e.jobTitle,
});

// jsonb reorders object keys, so compare values as tuples rather than JSON.stringify of objects.
const valuesKey = (vs: CoreValue[]) =>
  JSON.stringify(vs.map((v) => [v.id, v.name, v.why]));

// Stored weights with the defaults filled in; versions approved before weights existed have none.
function weightsOf(stored: unknown): PillarWeights {
  const raw = (stored ?? {}) as Partial<Record<string, unknown>>;
  const weights = { ...DEFAULT_PILLAR_WEIGHTS };
  for (const { code } of LEX_PILLARS) {
    if (typeof raw[code] === 'number') weights[code] = raw[code];
  }
  return weights;
}
const weightsKey = (w: PillarWeights) =>
  JSON.stringify(LEX_PILLARS.map(({ code }) => w[code]));
const weightsTotal = (w: PillarWeights) =>
  LEX_PILLARS.reduce((sum, { code }) => sum + w[code], 0);

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
  // On the first approval the weights are new even when they are the defaults.
  const weightsBefore = before && weightsOf(before.pillarWeights);
  if (
    !weightsBefore ||
    weightsKey(weightsBefore) !== weightsKey(after.pillarWeights)
  )
    changes.pillarWeights = { from: weightsBefore, to: after.pillarWeights };
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

  // Same rules as validateRequired() in the prototype, plus the length and weight limits.
  private missingItems(direction: Direction) {
    const problems: { field: string; label: string }[] = [];
    const tooLong = (field: string, label: string, max: number) =>
      problems.push({ field, label: `${label}: keep it to ${max} characters` });
    for (const field of TEXT_FIELDS) {
      const text = direction[field]?.trim();
      if (!text) problems.push({ field, label: FIELD_LABELS[field] });
      else if (text.length > TEXT_LIMITS[field])
        tooLong(field, FIELD_LABELS[field], TEXT_LIMITS[field]);
    }

    const values = direction.values as unknown as CoreValue[];
    if (values.length === 0)
      problems.push({ field: 'values', label: 'At least one core value' });
    if (values.length > VALUE_LIMITS.count)
      problems.push({
        field: 'values',
        label: `No more than ${VALUE_LIMITS.count} core values`,
      });
    values.forEach((v, i) => {
      if (!v.name?.trim())
        problems.push({ field: `${v.id}-name`, label: `Value ${i + 1} name` });
      else if (v.name.length > VALUE_LIMITS.name)
        tooLong(`${v.id}-name`, `Value ${i + 1} name`, VALUE_LIMITS.name);
      if (!v.why?.trim())
        problems.push({
          field: `${v.id}-why`,
          label: `Value ${i + 1} explanation`,
        });
      else if (v.why.length > VALUE_LIMITS.why)
        tooLong(`${v.id}-why`, `Value ${i + 1} explanation`, VALUE_LIMITS.why);
    });

    const total = weightsTotal(weightsOf(direction.pillarWeights));
    if (total !== 100)
      problems.push({
        field: 'pillarWeights',
        label: `Pillar weights must add up to 100% (now ${total}%)`,
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
      pillarWeights: weightsOf(direction.pillarWeights),
    };
  }

  private requireReason(reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) throw new BadRequestException('Enter a reason.');
    return trimmed;
  }

  private async isApprover(organizationId: string, actor: Actor) {
    if (!actor) return false;
    const row = await this.prisma.lexStrategicDirectionApprover.findUnique({
      where: {
        organizationId_employeeId: { organizationId, employeeId: actor.id },
      },
      select: { id: true },
    });
    return !!row;
  }

  private async requireApprover(organizationId: string, actor: Actor) {
    if (!(await this.isApprover(organizationId, actor))) {
      throw new ForbiddenException(
        'Only the people chosen to approve the company direction can do this.',
      );
    }
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

    const snapshot = row.snapshot as unknown as DirectionContent;
    return {
      ...snapshot,
      pillarWeights: weightsOf(snapshot.pillarWeights),
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
        pillarWeights: { ...DEFAULT_PILLAR_WEIGHTS },
        sectionMeta: {},
        returnReason: null,
        revisionReason: null,
        submittedAt: null,
        submittedById: null,
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
      pillarWeights: weightsOf(rest.pillarWeights),
      submittedByName: fullName(submittedBy),
      approved: published && {
        version: published.version,
        approvedAt: published.approvedAt,
        approvedByName: fullName(published.approvedBy),
      },
    };
  }

  /** getDraft() plus the approvers and what this user may do in review. */
  async getDraftFor(user: AccessTokenPayload) {
    const [draft, approvers, actor] = await Promise.all([
      this.getDraft(user.organizationId),
      this.getApprovers(user.organizationId),
      this.findActor(user),
    ]);
    const isApprover =
      !!actor && approvers.some((a) => a.employeeId === actor.id);
    const isSubmitter = !!actor && draft.submittedById === actor.id;
    return {
      ...draft,
      approvers,
      viewer: {
        isApprover,
        isSubmitter,
        canReview: isApprover && !isSubmitter,
      },
    };
  }

  async getApprovers(organizationId: string) {
    const rows = await this.prisma.lexStrategicDirectionApprover.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: { employee: { select: PERSON } },
    });
    return rows.map((r) => personOf(r.employee));
  }

  /** Current staff whose login has a management-level role in this organisation. */
  async getApproverCandidates(organizationId: string) {
    const people = await this.prisma.employee.findMany({
      where: {
        organizationId,
        employmentStatus: { in: [...CURRENT_STAFF] },
        user: {
          organizations: {
            some: {
              organizationId,
              role: { name: { in: DIRECTION_EDITORS } },
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: PERSON,
    });
    return people.map(personOf);
  }

  async setApprovers(user: AccessTokenPayload, employeeIds: string[]) {
    const candidates = await this.getApproverCandidates(user.organizationId);
    const allowed = new Set(candidates.map((c) => c.employeeId));
    if (employeeIds.some((id) => !allowed.has(id))) {
      throw new BadRequestException(
        'Approvers must be current management, admin or super admin staff.',
      );
    }
    const actor = await this.findActor(user);

    await this.prisma.$transaction(async (tx) => {
      await tx.lexStrategicDirectionApprover.deleteMany({
        where: {
          organizationId: user.organizationId,
          employeeId: { notIn: employeeIds },
        },
      });
      await tx.lexStrategicDirectionApprover.createMany({
        data: employeeIds.map((employeeId) => ({
          organizationId: user.organizationId,
          employeeId,
          addedById: actor?.id ?? null,
        })),
        skipDuplicates: true,
      });
    });
    return this.getApprovers(user.organizationId);
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

    // Refuse a save made on an older copy, so one editor can't overwrite another.
    if (
      draft &&
      dto.expectedUpdatedAt !== undefined &&
      new Date(dto.expectedUpdatedAt).getTime() !== draft.updatedAt.getTime()
    ) {
      throw new ConflictException(
        'Someone else saved changes since you opened this page. Copy your text, reload the page, then make your changes again.',
      );
    }

    // step 3: keep only the fields that actually changed.
    const changes: FieldChanges = {};
    const data: Partial<Record<TextField, string | null>> & {
      values?: Prisma.InputJsonValue;
      pillarWeights?: Prisma.InputJsonValue;
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

    if (dto.pillarWeights) {
      const next = weightsOf(dto.pillarWeights);
      const prev = weightsOf(draft?.pillarWeights);
      if (weightsKey(next) !== weightsKey(prev)) {
        changes.pillarWeights = { from: prev, to: next };
        data.pillarWeights = next;
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
      const section: Section =
        field === 'values'
          ? 'values'
          : field === 'pillarWeights'
            ? 'pillars'
            : SECTION_OF[field as TextField];
      sectionMeta[section] = stamp;
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

    // Nobody approves their own submission, so someone else must be able to.
    const reviewers = await this.prisma.lexStrategicDirectionApprover.count({
      where: {
        organizationId: user.organizationId,
        ...(actor && { employeeId: { not: actor.id } }),
      },
    });
    if (reviewers === 0) {
      throw new BadRequestException(
        'No one else can approve this yet. Ask an admin to choose approvers for the company direction.',
      );
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
    await this.requireApprover(user.organizationId, actor);

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
   * Publishes a submission as the next version. Only a chosen approver may do it,
   * and not on their own submission.
   */
  async approve(user: AccessTokenPayload) {
    const actor = await this.findActor(user);
    const direction = await this.findDirection(user.organizationId);
    if (direction.status === 'APPROVED') {
      throw new ConflictException('This direction is already approved.');
    }
    if (direction.status !== 'IN_REVIEW') {
      throw new ConflictException('Send the direction for review first.');
    }
    await this.requireApprover(user.organizationId, actor);
    if (actor && direction.submittedById === actor.id) {
      throw new ForbiddenException(
        'You sent this for review, so another approver must approve it.',
      );
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
        pillarWeights: weightsOf(snapshot.pillarWeights),
        sectionMeta: published.sectionMeta as Prisma.InputJsonValue,
        revisionReason: text,
        returnReason: null,
      },
      text,
    );
  }
}
