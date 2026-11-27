/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { ReviewsDevelopmentSources } from '../reviews-development.sources';
import { ImprovementService } from './improvement.service';
import {
  PEOPLE,
  action,
  actor,
  user,
} from '../development.fixtures.spec-helper';

function setup(facts = action()) {
  const tx = {
    $executeRaw: jest.fn(),
    lexActionEffectiveness: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'e-1', status: 'EFFECTIVE' }),
    },
    lexDevelopmentEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    lexActionEffectiveness: { findMany: jest.fn().mockResolvedValue([]) },
    lexDevelopmentActionLink: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const sources = {
    actor: jest.fn().mockResolvedValue(actor('mgr-1')),
    people: jest.fn().mockResolvedValue(PEOPLE),
    actions: jest.fn().mockResolvedValue([facts]),
  };
  const service = new ImprovementService(
    prisma as unknown as PrismaService,
    sources as unknown as ReviewsDevelopmentSources,
  );
  return { service, sources, tx };
}

const dto = {
  status: 'EFFECTIVE' as const,
  note: 'Scrap down 30%',
  evidence: 'Oct scrap report',
};

describe('ImprovementService effectiveness', () => {
  it('records an independent assessment of a checked action', async () => {
    const { service, tx } = setup();
    const row = await service.record(user(), 'act-1', dto);
    expect(tx.lexActionEffectiveness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          actionId: 'act-1',
          status: 'EFFECTIVE',
          assessedById: 'mgr-1',
        }),
      }),
    );
    expect(tx.lexDevelopmentEvent.create).toHaveBeenCalled();
    expect(row).toMatchObject({ id: 'act-1', canAssess: true });
  });

  it('never lets the owner assess their own action', async () => {
    const { service, sources } = setup();
    sources.actor.mockResolvedValue(actor('emp-1'));
    await expect(service.record(user(), 'act-1', dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('waits for the Area 04 completion check', async () => {
    const { service } = setup(
      action({ status: 'COMPLETED', checkedById: null }),
    );
    await expect(service.record(user(), 'act-1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('needs an explanation and evidence', async () => {
    const { service } = setup();
    await expect(
      service.record(user(), 'act-1', { ...dto, evidence: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hides actions outside the caller’s scope', async () => {
    const { service, sources } = setup();
    sources.actor.mockResolvedValue(actor('other'));
    await expect(service.list(user())).resolves.toEqual([]);
  });
});
