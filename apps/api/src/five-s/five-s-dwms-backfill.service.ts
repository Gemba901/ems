import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ScheduledJobsService } from 'src/operations/scheduled-jobs.service';
import { FiveSDwmsSyncService } from './five-s-dwms-sync.service';

// Runs the 5S -> DWMS catch-up once per database, on the first start of an API instance with business
// jobs enabled. The job lease records completion; bump the window to run it again.
const BACKFILL_JOB = 'five-s-dwms-backfill';
const BACKFILL_WINDOW = 'v1';

@Injectable()
export class FiveSDwmsBackfillService implements OnApplicationBootstrap {
    private readonly logger = new Logger(FiveSDwmsBackfillService.name);

    constructor(
        private sync: FiveSDwmsSyncService,
        private jobs: ScheduledJobsService,
    ) {}

    onApplicationBootstrap() {
        // In the background, so a large backfill doesn't hold up startup.
        void this.run();
    }

    run() {
        return this.jobs.run(BACKFILL_JOB, BACKFILL_WINDOW, async () => {
            const result = await this.sync.backfill();
            this.logger.log(`Synced ${result.routines} 5S routines and ${result.actions} open 5S actions to DWMS`);
        });
    }
}
