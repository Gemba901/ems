import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmsDirectoryModule } from './ems-directory.module';
import { EmsDirectoryService } from './ems-directory.service';

@Injectable()
class Consumer {
  constructor(readonly directory: EmsDirectoryService) {}
}
@Module({ imports: [EmsDirectoryModule], providers: [Consumer] })
class ConsumerModule {}

it('another BEES module can import the directory without importing EMS onboarding or LEX', async () => {
  const tx = {
    $executeRaw: jest.fn(),
    organization: {
      findUnique: async () => ({ id: 'company', name: 'Company' }),
    },
    department: { findMany: async () => [] },
    employee: { findMany: async () => [] },
  };
  const module = await Test.createTestingModule({ imports: [ConsumerModule] })
    .overrideProvider(PrismaService)
    .useValue({ $transaction: async (fn) => fn(tx) })
    .compile();
  try {
    const result = await module.get(Consumer).directory.getDirectory('company');
    expect(result).toMatchObject({
      company: { id: 'company' },
      people: [],
      capabilities: { recordedPositions: false },
    });
  } finally {
    await module.close();
  }
});
