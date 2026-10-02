import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const db = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    db.$queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: db }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('reports ok when the database answers', async () => {
    db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(appController.health()).resolves.toEqual({ status: 'ok' });
  });

  it('returns 503 without error details when the database fails', async () => {
    db.$queryRaw.mockRejectedValue(new Error('connection refused to 10.0.0.5'));
    await expect(appController.health()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(appController.health()).rejects.toMatchObject({
      response: { status: 'error' },
    });
  });
});
