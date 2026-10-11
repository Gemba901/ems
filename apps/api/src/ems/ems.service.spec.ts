import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmsService } from './ems.service';
import { ExcludeOnboardingRecordDto } from './dto/onboarding.dto';

describe('EMS onboarding record exclusion', () => {
  const prisma = {
    emsOnboardingRecord: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: EmsService;
  let revalidate: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new EmsService(
      prisma as unknown as PrismaService,
    );

    prisma.emsOnboardingRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      batchId: 'batch-1',
      status: 'READY',
    });

    prisma.emsOnboardingRecord.update.mockResolvedValue({});

    // Batch validation is tested separately.
    revalidate = jest
      .spyOn(service, 'validateOnboardingBatch')
      .mockResolvedValue({ id: 'batch-1' } as never);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['spaces only', '     '],
    ['too short', 'Left'],
    ['too short after trimming', '  Left  '],
  ])('rejects a %s reason without updating the record', async (_, reason) => {
    const dto = { reason } as unknown as ExcludeOnboardingRecordDto;

    await expect(
      service.excludeOnboardingRecord('org-1', 'record-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.emsOnboardingRecord.update).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('saves a trimmed reason and revalidates the batch', async () => {
    await service.excludeOnboardingRecord('org-1', 'record-1', {
      reason: '  Duplicate record  ',
    });

    expect(prisma.emsOnboardingRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'record-1', organizationId: 'org-1' },
      select: { id: true, batchId: true, status: true },
    });

    expect(prisma.emsOnboardingRecord.update).toHaveBeenCalledWith({
      where: { id: 'record-1' },
      data: {
        status: 'EXCLUDED',
        exclusionReason: 'Duplicate record',
        validationErrors: Prisma.DbNull,
      },
    });

    expect(revalidate).toHaveBeenCalledWith('org-1', 'batch-1');
  });

  it('accepts a reason of exactly five characters', async () => {
    await service.excludeOnboardingRecord('org-1', 'record-1', {
      reason: 'Moved',
    });

    expect(prisma.emsOnboardingRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ exclusionReason: 'Moved' }),
      }),
    );
  });

  it('does not exclude a registered record', async () => {
    prisma.emsOnboardingRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      batchId: 'batch-1',
      status: 'REGISTERED',
    });

    await expect(
      service.excludeOnboardingRecord('org-1', 'record-1', {
        reason: 'Duplicate record',
      }),
    ).rejects.toThrow('This record has already been registered');

    expect(prisma.emsOnboardingRecord.update).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('does not update a record absent from the requesting organization', async () => {
    prisma.emsOnboardingRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.excludeOnboardingRecord('org-2', 'record-1', {
        reason: 'Duplicate record',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.emsOnboardingRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'record-1', organizationId: 'org-2' },
      select: { id: true, batchId: true, status: true },
    });

    expect(prisma.emsOnboardingRecord.update).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe('ExcludeOnboardingRecordDto', () => {
  it.each([
    ['missing', undefined],
    ['null', null],
    ['non-text', 12345],
    ['empty', ''],
    ['spaces only', '     '],
    ['too short after trimming', '  Left  '],
    ['over 300 characters', 'x'.repeat(301)],
  ])('rejects a %s reason', (_, reason) => {
    const dto = plainToInstance(ExcludeOnboardingRecordDto, { reason });

    expect(
      validateSync(dto).some((error) => error.property === 'reason'),
    ).toBe(true);
  });

  it.each(['Moved', 'Duplicate record', 'x'.repeat(300)])(
    'accepts a valid reason: %s',
    (reason) => {
      const dto = plainToInstance(ExcludeOnboardingRecordDto, {
        reason: `  ${reason}  `,
      });

      expect(dto.reason).toBe(reason);
      expect(validateSync(dto)).toHaveLength(0);
    },
  );
});