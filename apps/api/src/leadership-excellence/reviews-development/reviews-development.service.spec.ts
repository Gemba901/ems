/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Role } from 'src/common/enum/role.enum';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { ReviewsDevelopmentSources } from './reviews-development.sources';
import { ReviewsDevelopmentService } from './reviews-development.service';
import { action, actor, user } from './development.fixtures.spec-helper';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

function setup() {
  const review = {
    id: 'rev-1',
    code: 'REV-0001',
    type: 'PERSONAL',
    status: 'APPROVED',
    planDocumentId: 'doc-ind',
    departmentId: 'dept-1',
    periodStart: day('2026-09-01'),
    periodEnd: day('2026-09-30'),
    subjectId: 'emp-1',
    reviewerId: 'mgr-1',
    meetingDate: day('2026-10-05'),
    versions: [
      {
        version: 1,
        approvedById: 'mgr-1',
        approvedAt: new Date('2026-10-06T09:00:00Z'),
        data: {
          meetingDate: '2026-10-05',
          findings: 'Private findings',
          decisions: 'Private decisions',
          snapshot: { planVersion: 2 },
        },
      },
    ],
    acknowledgement: [
      {
        version: 1,
        employeeId: 'emp-1',
        comment: 'Private comment',
        concern: true,
        createdAt: new Date('2026-10-07T09:00:00Z'),
      },
    ],
    actionLinks: [{ actionId: 'act-1' }],
  };
  const coaching = {
    id: 'c-1',
    code: 'COACH-0001',
    kind: 'COACHING',
    planDocumentId: 'doc-ind',
    departmentId: 'dept-1',
    subjectId: 'emp-1',
    reviewerId: 'mgr-1',
    date: day('2026-10-01'),
    topic: 'Confidential topic',
    relatesTo: 'role',
    notes: 'Confidential notes',
    support: 'Confidential support',
    response: 'Reply',
    createdAt: new Date(),
    updatedAt: new Date(),
    actionLinks: [],
  };
  const prisma = {
    lexReview: { findMany: jest.fn().mockResolvedValue([review]) },
    lexCoachingRecord: { findMany: jest.fn().mockResolvedValue([coaching]) },
    lexActionEffectiveness: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'e-1',
          actionId: 'act-1',
          status: 'PARTLY_EFFECTIVE',
          note: 'n',
          evidence: 'ev',
          assessedById: 'mgr-1',
          assessedAt: new Date('2026-10-10T00:00:00Z'),
        },
      ]),
    },
    lexDevelopmentEvent: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ entityId: 'e-1', _count: { _all: 2 } }]),
    },
  };
  const sources = {
    actor: jest.fn().mockResolvedValue(actor('mgr-1')),
    actions: jest.fn().mockResolvedValue([action()]),
  };
  const service = new ReviewsDevelopmentService(
    prisma as unknown as PrismaService,
    sources as unknown as ReviewsDevelopmentSources,
  );
  return { service, prisma, sources };
}

describe('ReviewsDevelopmentService (Area 07 reads)', () => {
  it('returns approved content with stable ids and versions to participants', async () => {
    const { service } = setup();
    const [r] = await service.listApprovedReviews(user());
    expect(r).toMatchObject({
      id: 'rev-1',
      version: 1,
      planVersion: 2,
      restricted: false,
      revisionInProgress: false,
      linkedActionIds: ['act-1'],
      acknowledgement: {
        version: 1,
        concern: true,
        comment: 'Private comment',
      },
    });
    expect(r.content?.findings).toBe('Private findings');
  });

  it('gives others in scope metadata only for personal reviews', async () => {
    const { service, sources } = setup();
    sources.actor.mockResolvedValue(actor(null, { role: Role.MANAGEMENT }));
    const [r] = await service.listApprovedReviews(user(Role.MANAGEMENT));
    expect(r.restricted).toBe(true);
    expect(r.content).toBeNull();
    expect(r.acknowledgement?.comment).toBeNull();
    expect(JSON.stringify(r)).not.toContain('Private');
  });

  it('omits reviews outside the caller’s scope', async () => {
    const { service, sources } = setup();
    sources.actor.mockResolvedValue(actor('other'));
    await expect(service.listApprovedReviews(user())).resolves.toEqual([]);
  });

  it('applies period, department and employee filters in the query', async () => {
    const { service, prisma } = setup();
    await service.listApprovedReviews(user(), {
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      departmentId: 'dept-1',
      employeeId: 'emp-1',
    });
    expect(prisma.lexReview.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      versions: { some: {} },
      periodEnd: { gte: day('2026-09-01') },
      periodStart: { lte: day('2026-09-30') },
      departmentId: 'dept-1',
      OR: [{ subjectId: 'emp-1' }, { reviewerId: 'emp-1' }],
    });
  });

  it('never sends coaching topic, notes, support or response', async () => {
    const { service } = setup();
    const [c] = await service.listCoachingMetadata(user());
    expect(c).toMatchObject({ id: 'c-1', kind: 'COACHING', hasResponse: true });
    expect(JSON.stringify(c)).not.toMatch(/Confidential|Reply/);
  });

  it('lists effectiveness assessments with a version', async () => {
    const { service } = setup();
    const [e] = await service.listEffectiveness(user());
    expect(e).toMatchObject({
      actionId: 'act-1',
      actionDocumentId: 'doc-ind',
      status: 'PARTLY_EFFECTIVE',
      version: 2,
    });
  });
});
