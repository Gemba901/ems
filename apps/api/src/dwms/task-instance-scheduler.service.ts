import { ScheduledJobsService } from '../operations/scheduled-jobs.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DwmsService } from './dwms.service';
import { TASK_INSTANCE_GENERATION_DAYS } from './services/task.service';

@Injectable()
export class DwmsTaskInstanceSchedulerService {
  private readonly logger = new Logger(DwmsTaskInstanceSchedulerService.name);

  constructor(private readonly dwmsService: DwmsService, private readonly jobs: ScheduledJobsService) {}

  @Cron('0 12 * * *', { timeZone: 'GMT' })
  async generateUpcomingInstances() {
    return this.jobs.run('dwms-instances', new Date().toISOString().slice(0, 10), async () => {
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
    });
  }
}
