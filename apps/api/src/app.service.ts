import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

const DEFAULT_DB_CHECK_TIMEOUT_MS = 3000;
const MAX_DB_CHECK_TIMEOUT_MS = 60000;

@Injectable()
export class AppService {
  private readonly logger = new Logger('Health');
  private readonly databaseCheckTimeoutMs: number;

  constructor(private readonly db: PrismaService) {
    // Read after ConfigModule has loaded .env, when Nest creates the service.
    const configuredTimeout = Number(process.env.DB_HEALTH_TIMEOUT_MS);
    this.databaseCheckTimeoutMs =
      Number.isInteger(configuredTimeout) &&
      configuredTimeout > 0 &&
      configuredTimeout <= MAX_DB_CHECK_TIMEOUT_MS
        ? configuredTimeout
        : DEFAULT_DB_CHECK_TIMEOUT_MS;
  }

  // public and unauthenticated: the response never carries error details
  async health(): Promise<{ status: 'ok' }> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('database check timed out')),
            this.databaseCheckTimeoutMs,
          );
        }),
      ]);
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'health_check_failed',
          reason: error instanceof Error ? error.message : 'unknown',
        }),
      );
      throw new ServiceUnavailableException({ status: 'error' });
    } finally {
      clearTimeout(timer);
    }
  }
}
