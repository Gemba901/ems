import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppService database health deadline', () => {
  const originalTimeout = process.env.DB_HEALTH_TIMEOUT_MS;
  const db = { $queryRaw: jest.fn() };

  const service = () => new AppService(db as unknown as PrismaService);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    db.$queryRaw.mockReset();
    delete process.env.DB_HEALTH_TIMEOUT_MS;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalTimeout === undefined) {
      delete process.env.DB_HEALTH_TIMEOUT_MS;
    } else {
      process.env.DB_HEALTH_TIMEOUT_MS = originalTimeout;
    }
  });

  it('accepts a healthy remote database taking longer than three seconds with a configured deadline', async () => {
    // Configuration is supplied after module import, as with ConfigModule.
    process.env.DB_HEALTH_TIMEOUT_MS = '15000';
    db.$queryRaw.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([{ value: 1 }]), 5000),
        ),
    );
    const result = service()
      .health()
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );

    await jest.advanceTimersByTimeAsync(5000);

    await expect(result).resolves.toEqual({ value: { status: 'ok' } });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns a generic 503 at the configured deadline when the database never answers', async () => {
    process.env.DB_HEALTH_TIMEOUT_MS = '15000';
    db.$queryRaw.mockReturnValue(new Promise(() => undefined));
    let settled = false;
    const result = service()
      .health()
      .catch((error: unknown) => {
        settled = true;
        return error;
      });

    await jest.advanceTimersByTimeAsync(14999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    const error = await result;
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps database error details out of the public response and clears the timer', async () => {
    process.env.DB_HEALTH_TIMEOUT_MS = '15000';
    db.$queryRaw.mockRejectedValue(
      new Error('database connection failed with private details'),
    );

    const error = await service()
      .health()
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    undefined,
    '',
    'not-a-number',
    '0',
    '-1',
    '1.5',
    '60001',
    'Infinity',
  ])(
    'falls back to three seconds for an absent or invalid deadline (%p)',
    async (configuredTimeout) => {
      if (configuredTimeout !== undefined) {
        process.env.DB_HEALTH_TIMEOUT_MS = configuredTimeout;
      }
      db.$queryRaw.mockReturnValue(new Promise(() => undefined));
      let settled = false;
      const result = service()
        .health()
        .catch((error: unknown) => {
          settled = true;
          return error;
        });

      await jest.advanceTimersByTimeAsync(2999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);

      expect(await result).toBeInstanceOf(ServiceUnavailableException);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
