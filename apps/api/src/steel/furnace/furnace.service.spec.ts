import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { FurnaceService } from './furnace.service';
import { PrismaService } from 'src/prisma/prisma.service';

interface PrismaMock {
  furnace: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  furnaceLining: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

function createPrismaMock(): PrismaMock {
  const prisma = {
    furnace: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    furnaceLining: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as PrismaMock;
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function')
      return (arg as (tx: unknown) => unknown)(prisma);
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma;
}

const ORG_ID = 'org-1';

describe('FurnaceService', () => {
  let service: FurnaceService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FurnaceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<FurnaceService>(FurnaceService);
  });

  describe('create', () => {
    it('creates a furnace scoped to the organization', async () => {
      prisma.furnace.create.mockResolvedValue({ id: 'furnace-1', code: 'F1' });
      const result = await service.create(
        { code: 'F1', name: 'Furnace 1' },
        ORG_ID,
      );
      expect(prisma.furnace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ organizationId: ORG_ID, code: 'F1' }),
        }),
      );
      expect(result).toMatchObject({ id: 'furnace-1' });
    });

    it('rejects a duplicate furnace code within the organization', async () => {
      prisma.furnace.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['organizationId', 'code'] },
        }),
      );
      await expect(
        service.create({ code: 'F1', name: 'Furnace 1' }, ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addLining', () => {
    it('retires the current active lining before creating a new one', async () => {
      prisma.furnace.findFirst.mockResolvedValue({
        id: 'furnace-1',
        linings: [],
      });
      prisma.furnaceLining.create.mockResolvedValue({ id: 'lining-2' });

      await service.addLining('furnace-1', {}, ORG_ID);

      expect(prisma.furnaceLining.updateMany).toHaveBeenCalledWith({
        where: { furnaceId: 'furnace-1', status: 'ACTIVE' },
        data: { status: 'RETIRED', retiredAt: expect.any(Date) as Date },
      });
      expect(prisma.furnaceLining.create).toHaveBeenCalled();
    });

    it('rejects when the furnace does not exist in this org', async () => {
      prisma.furnace.findFirst.mockResolvedValue(null);
      await expect(service.addLining('furnace-x', {}, ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('retireLining', () => {
    it('rejects retiring an already-retired lining', async () => {
      prisma.furnaceLining.findFirst.mockResolvedValue({
        id: 'lining-1',
        status: 'RETIRED',
      });
      await expect(
        service.retireLining('lining-1', {}, ORG_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('retires an active lining', async () => {
      prisma.furnaceLining.findFirst.mockResolvedValue({
        id: 'lining-1',
        status: 'ACTIVE',
        inspectionNotes: null,
      });
      prisma.furnaceLining.update.mockResolvedValue({
        id: 'lining-1',
        status: 'RETIRED',
      });
      await service.retireLining('lining-1', { notes: 'Worn out' }, ORG_ID);
      expect(prisma.furnaceLining.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'RETIRED' }),
        }),
      );
    });
  });
});
