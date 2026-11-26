/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { LexReview } from 'db';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { ReviewsDevelopmentSources } from '../reviews-development.sources';
import { ReviewsService } from './reviews.service';
import { buildSnapshot } from './review-facts';
import { PEOPLE, actor, plan, user } from '../development.fixtures.spec-helper';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

function setup() {
  const p = plan({ assignments: [] });
  const snapshot = buildSnapshot({
    plan: p,
    start: '2026-09-01',
    end: '2026-09-30',
    asOf: new Date().toISOString().slice(0, 10),
    subjectId: 'emp-1',
    targets: new Map(),
    official: [],
    actions: [],
  });
  const review = (over: Partial<LexReview> = {}) =>
    ({
      id: 'rev-1',
      organizationId: 'org-1',
      code: 'REV-0001',
      type: 'PERSONAL',
      status: 'SUBMITTED',
      planDocumentId: p.documentId,
      departmentId: 'dept-1',
      periodStart: day('2026-09-01'),
      periodEnd: day('2026-09-30'),
      subjectId: 'emp-1',
      reviewerId: 'mgr-1',
      meetingDate: day('2026-10-05'),
      achievements: 'Hit target',
      challenges: '',
      learning: '',
      supportNeeded: '',
      reflectionSubmittedAt: new Date('2026-10-02T00:00:00Z'),
      recognition: '',
      findings: 'Good month',
      decisions: 'Keep going',
      noInputReason: '',
      dataLimitReason: '',
      nextReviewDate: null,
      snapshot,
      version: 1,
      reason: null,
      returnReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      versions: [],
      acknowledgement: [],
      actionLinks: [],
      ...over,
    }) as LexReview & {
      versions: never[];
      acknowledgement: never[];
      actionLinks: never[];
    };
  const tx = {
    $executeRaw: jest.fn(),
    lexReview: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'rev-new' }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    lexReviewVersion: { create: jest.fn() },
    lexReviewAcknowledgement: { create: jest.fn() },
    lexDevelopmentActionLink: { create: jest.fn(), deleteMany: jest.fn() },
    lexDevelopmentEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    lexReview: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    lexDevelopmentEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const sources = {
    actor: jest.fn().mockResolvedValue(actor('mgr-1')),
    people: jest.fn().mockResolvedValue(PEOPLE),
    plans: jest.fn().mockResolvedValue([p]),
    actions: jest.fn().mockResolvedValue([]),
    official: jest.fn().mockResolvedValue([]),
    targets: jest.fn().mockResolvedValue([]),
  };
  const service = new ReviewsService(
    prisma as unknown as PrismaService,
    sources as unknown as ReviewsDevelopmentSources,
  );
  return { service, prisma, sources, tx, review, p };
}

describe('ReviewsService approval rules', () => {
  const asOf = '2026-11-10';

  it('approves a complete, current review', async () => {
    const { service, review } = setup();
    await expect(
      service.approvalProblem('org-1', review(), asOf),
    ).resolves.toBeNull();
  });

  it.each([
    [{ periodEnd: day('2026-12-31') }, 'period is still open'],
    [{ meetingDate: day('2026-12-01') }, 'after the recorded discussion'],
    [{ findings: '' }, 'Record the performance discussion'],
    [{ decisions: ' ' }, 'Record the performance discussion'],
    [{ reflectionSubmittedAt: null }, 'Obtain the employee reflection'],
    [{ nextReviewDate: day('2026-10-05') }, 'next review date must be after'],
    [{ reviewerId: 'emp-1' }, 'Self-review'],
  ])('refuses %j', async (over, message) => {
    const { service, review } = setup();
    await expect(
      service.approvalProblem(
        'org-1',
        review(over as Partial<LexReview>),
        asOf,
      ),
    ).resolves.toContain(message);
  });

  it('accepts a recorded reason instead of the reflection', async () => {
    const { service, review } = setup();
    const r = review({
      reflectionSubmittedAt: null,
      noInputReason: 'On leave',
    });
    await expect(service.approvalProblem('org-1', r, asOf)).resolves.toBeNull();
  });

  it('refuses when the facts changed since the last refresh', async () => {
    const { service, review, sources } = setup();
    sources.plans.mockResolvedValue([plan({ assignments: [], version: 3 })]);
    await expect(
      service.approvalProblem('org-1', review(), asOf),
    ).resolves.toContain('Refresh facts');
  });

  it('needs a data-limit reason when verified data is incomplete', async () => {
    const { service, review, sources } = setup();
    const withKpi = plan();
    sources.plans.mockResolvedValue([withKpi]);
    sources.targets.mockResolvedValue([
      {
        periodId: 'p9',
        start: '2026-09-01',
        end: '2026-09-30',
        scheduled: true,
        dueAt: '',
        value: 1,
      },
    ]);
    const snapshot = buildSnapshot({
      plan: withKpi,
      start: '2026-09-01',
      end: '2026-09-30',
      asOf: new Date().toISOString().slice(0, 10),
      subjectId: 'emp-1',
      targets: new Map([['kpi-1', await sources.targets()]]),
      official: [],
      actions: [],
    });
    const r = review({ snapshot: snapshot as never });
    await expect(service.approvalProblem('org-1', r, asOf)).resolves.toContain(
      'incomplete',
    );
    await expect(
      service.approvalProblem(
        'org-1',
        { ...r, dataLimitReason: 'Audit pending' },
        asOf,
      ),
    ).resolves.toBeNull();
  });

  it('only the reviewer approves, and approval freezes a version', async () => {
    const { service, prisma, sources, tx, review } = setup();
    const r = review({
      periodEnd: day('2020-01-31'),
      periodStart: day('2020-01-01'),
      meetingDate: day('2020-02-01'),
    });
    // Facts for the 2020 period.
    (r as { snapshot: unknown }).snapshot = buildSnapshot({
      plan: plan({ assignments: [] }),
      start: '2020-01-01',
      end: '2020-01-31',
      asOf: '',
      subjectId: 'emp-1',
      targets: new Map(),
      official: [],
      actions: [],
    });
    prisma.lexReview.findFirst.mockResolvedValue(r);
    sources.actor.mockResolvedValue(actor('emp-1'));
    await expect(service.approve(user(), 'rev-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    sources.actor.mockResolvedValue(actor('mgr-1'));
    await service.approve(user(), 'rev-1');
    expect(tx.lexReview.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'APPROVED', returnReason: null },
      }),
    );
    expect(tx.lexReviewVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reviewId: 'rev-1',
        version: 1,
        approvedById: 'mgr-1',
      }),
    });
  });
});

describe('ReviewsService changes', () => {
  it('hides a personal review from non-participants', async () => {
    const { service, prisma, sources, review } = setup();
    prisma.lexReview.findFirst.mockResolvedValue(review());
    sources.actor.mockResolvedValue(actor('hod-1'));
    await expect(service.get(user(), 'rev-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets only the subject write and submit the reflection', async () => {
    const { service, prisma, sources, tx, review } = setup();
    prisma.lexReview.findFirst.mockResolvedValue(review({ status: 'DRAFT' }));
    await expect(
      service.saveReflection(user(), 'rev-1', { achievements: 'x' }, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    sources.actor.mockResolvedValue(actor('emp-1'));
    await expect(
      service.saveReflection(
        user(),
        'rev-1',
        { learning: 'only learning' },
        true,
      ),
    ).rejects.toThrow('achievement or a challenge');
    await service.saveReflection(
      user(),
      'rev-1',
      { challenges: 'Late parts' },
      true,
    );
    expect(tx.lexReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUBMITTED',
          challenges: 'Late parts',
        }),
      }),
    );
  });

  it('locks an approved review until a revision is opened with a reason', async () => {
    const { service, prisma, tx, review } = setup();
    prisma.lexReview.findFirst.mockResolvedValue(
      review({ status: 'APPROVED' }),
    );
    await expect(
      service.saveDiscussion(user(), 'rev-1', { meetingDate: '2026-10-05' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.revise(user(), 'rev-1', '  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.revise(user(), 'rev-1', 'Wrong figure discussed');
    expect(tx.lexReview.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: { status: 'DRAFT', version: 2, reason: 'Wrong figure discussed' },
    });
  });

  it('requires a reason to return a submitted reflection', async () => {
    const { service, prisma, tx, review } = setup();
    prisma.lexReview.findFirst.mockResolvedValue(review());
    await expect(
      service.returnForClarification(user(), 'rev-1', ''),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.returnForClarification(
      user(),
      'rev-1',
      'Add the October figures',
    );
    expect(tx.lexReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
          reflectionSubmittedAt: null,
        }),
      }),
    );
  });

  it('acknowledges the approved version; a concern needs a comment', async () => {
    const { service, prisma, sources, tx, review } = setup();
    prisma.lexReview.findFirst.mockResolvedValue(
      review({
        status: 'APPROVED',
        versions: [
          {
            version: 1,
            approvedAt: new Date(),
            approvedById: 'mgr-1',
            data: {},
          },
        ],
      } as never),
    );
    sources.actor.mockResolvedValue(actor('emp-1'));
    await expect(
      service.acknowledge(user(), 'rev-1', { concern: true }),
    ).rejects.toThrow('Explain the concern');
    await service.acknowledge(user(), 'rev-1', {
      concern: true,
      comment: 'Target was changed',
    });
    expect(tx.lexReviewAcknowledgement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 1,
        employeeId: 'emp-1',
        concern: true,
      }),
    });
  });

  it('refuses to create a review where the employee would review themselves', async () => {
    const { service, sources } = setup();
    sources.actor.mockResolvedValue(actor('emp-1'));
    sources.people.mockResolvedValue(
      new Map(
        [...PEOPLE].map(([k, v]) => [
          k,
          k === 'emp-1' ? { ...v, managerId: 'emp-1' } : v,
        ]),
      ),
    );
    await expect(
      service.create(user(), {
        planDocumentId: 'doc-ind',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        meetingDate: '2026-10-05',
      }),
    ).rejects.toThrow('cannot be their own performance reviewer');
  });

  it('refuses a duplicate review for the same plan and period', async () => {
    const { service, prisma } = setup();
    prisma.lexReview.findFirst.mockResolvedValue({ id: 'rev-1' });
    await expect(
      service.create(user(), {
        planDocumentId: 'doc-ind',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        meetingDate: '2026-10-05',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to start a review on a plan the caller is not part of', async () => {
    const { service, sources } = setup();
    sources.actor.mockResolvedValue(actor('other'));
    await expect(
      service.create(user(), {
        planDocumentId: 'doc-ind',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        meetingDate: '2026-10-05',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
