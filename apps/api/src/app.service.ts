import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

const DB_CHECK_TIMEOUT_MS = 3000;

@Injectable()
export class AppService {
  private readonly logger = new Logger('Health');

  constructor(private readonly db: PrismaService) {}

  // public and unauthenticated: the response never carries error details
  async health(): Promise<{ status: 'ok' }> {
    let timer: NodeJS.Timeout | undefined;
    try{
      await Promise.race([
        this.db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('database check timed out')), DB_CHECK_TIMEOUT_MS);
        }),
      ]);
      return { status: 'ok'}
    } catch (error){
      this.logger.error(
        JSON.stringify({
          event: 'health_check_failed',
          reason: error instanceof Error ? error.message: 'unknown',
        }),
      );
      throw new ServiceUnavailableException({ status: 'error' });
    } finally {
      clearTimeout(timer)
    }
  }
}
