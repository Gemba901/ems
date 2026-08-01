import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DwmsService } from './dwms.service';
import { TASK_INSTANCE_GENERATION_DAYS } from './services/task.service';

@Injectable()
export class DwmsTaskInstanceSchedulerService {
  private readonly logger = new Logger(DwmsTaskInstanceSchedulerService.name);

  constructor(private readonly dwmsService: DwmsService) {}

  @Cron('0 12 * * *', { timeZone: 'GMT' })
  async generateUpcomingInstances() {
    try {
      const result = await this.dwmsService.generateUpcomingTaskInstances(
        TASK_INSTANCE_GENERATION_DAYS,
      );
      this.logger.debug(
        'Ensured ' +
          result.instances +
          ' DWMS task instances for ' +
          result.tasks +
          ' tasks',
      );
    } catch (error) {
      this.logger.warn(
        'Failed to generate upcoming DWMS task instances: ' +
          ((error as Error)?.message ?? error),
      );
    }
  }
}
