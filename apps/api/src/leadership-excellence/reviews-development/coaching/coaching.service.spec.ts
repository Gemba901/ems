/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { ReviewsDevelopmentSources } from '../reviews-development.sources';
import { CoachingService } from './coaching.service';
import {
  PEOPLE,
  action,
  actor,
  plan,
  user,
} from '../development.fixtures.spec-helper';

function setup() {
  const record = {
    id: 'c-1',
    organizationId: 'org-1',
    code: 'COACH-0001',
    kind: 'FEEDBACK',
    planDocumentId: 'doc-ind',
    departmentId: 'dept-1',
    subjectId: 'emp-1',
    reviewerId: 'mgr-1',
    date: new Date('2026-10-01T00:00:00Z'),
    topic: 'Handover',
    relatesTo: 'role',
    notes: 'Manager notes',
    support: '',
    response: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    actionLinks: [],
  };
  const tx = {
    $executeRaw: jest.fn(),
    lexCoachingRecord: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'c-1' }),
      update: jest.fn(),
    },
    lexDevelopmentActionLink: { create: jest.fn(), deleteMany: jest.fn() },
    lexDevelopmentEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    lexCoachingRecord: {
      findFirst: jest.fn().mockResolvedValue(record),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const sources = {
    actor: jest.fn().mockResolvedValue(actor('mgr-1')),
    people: jest.fn().mockResolvedValue(PEOPLE),
    plans: jest.fn().mockResolvedValue([plan()]),
    actions: jest.fn().mockResolvedValue([]),
  };
  const service = new CoachingService(
    prisma as unknown as PrismaService,
    sources as unknown as ReviewsDevelopmentSources,
  );
  return { service, prisma, sources, tx };
}

const dto = {
  planDocumentId: 'doc-ind',
  kind: 'COACHING' as const,
  date: '2026-10-01',
  topic: 'Shift handover',
  relatesTo: 'goal:g1',
  notes: 'Discussed the checklist',
  support: 'Pair with lead',
};

describe('CoachingService', () => {
  it('lists only records the caller takes part in', async () => {
    const { service, prisma } = setup();
    await service.list(user());
    expect(prisma.lexCoachingRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          OR: [{ subjectId: 'mgr-1' }, { reviewerId: 'mgr-1' }],
        },
      }),
    );
  });

  it('stores the manager’s notes as notes and the employee’s as response', async () => {
    const { service, sources, tx } = setup();
    await service.create(user(), dto);
    expect(tx.lexCoachingRecord.create.mock.calls[0][0].data).toMatchObject({
      notes: 'Discussed the checklist',
      support: 'Pair with lead',
      response: '',
      subjectId: 'emp-1',
      reviewerId: 'mgr-1',
    });
    sources.actor.mockResolvedValue(actor('emp-1'));
    await service.create(user(), dto);
    expect(tx.lexCoachingRecord.create.mock.calls[1][0].data).toMatchObject({
      notes: '',
      response: 'Discussed the checklist\nRequested support: Pair with lead',
    });
  });

  it('refuses future dates, unknown links and outsiders', async () => {
    const { service, sources } = setup();
    await expect(
      service.create(user(), { ...dto, date: '2999-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(user(), { ...dto, relatesTo: 'goal:nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    sources.actor.mockResolvedValue(actor('hod-1'));
    await expect(service.create(user(), dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets each participant change only their own words', async () => {
    const { service, sources, tx } = setup();
    sources.actor.mockResolvedValue(actor('emp-1'));
    await expect(
      service.update(user(), 'c-1', { notes: 'rewrite manager notes' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.update(user(), 'c-1', {
      response: 'Agreed',
      notes: 'ignored',
    });
    expect(tx.lexCoachingRecord.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { response: 'Agreed' },
    });
  });

  it('refuses to link a same-department action the caller cannot otherwise see', async () => {
    const { service, sources, tx } = setup();
    // The employee tries to link a colleague's action in their department.
    sources.actor.mockResolvedValue(actor('emp-1'));
    sources.actions.mockResolvedValue([
      action({
        id: 'act-x',
        ownerId: 'other',
        goalOwnerId: 'other',
        checkedById: 'hod-1',
      }),
    ]);
    await expect(
      service.linkAction(user(), 'c-1', 'act-x'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The manager without a reporting line to the owner is refused too.
    sources.actor.mockResolvedValue(actor('mgr-1'));
    await expect(
      service.linkAction(user(), 'c-1', 'act-x'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.lexDevelopmentActionLink.create).not.toHaveBeenCalled();
  });

  it('links an action the caller can see on their own', async () => {
    const { service, sources, tx } = setup();
    sources.actor.mockResolvedValue(
      actor('mgr-1', { reportIds: new Set(['emp-1']) }),
    );
    sources.actions.mockResolvedValue([action({ id: 'act-1' })]);
    await service.linkAction(user(), 'c-1', 'act-1');
    expect(tx.lexDevelopmentActionLink.create).toHaveBeenCalledWith({
      data: { coachingId: 'c-1', actionId: 'act-1' },
    });
  });
});
