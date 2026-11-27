import { Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

const logger = new Logger('EMSOnboardingPerformance');

/** Development-only phase measurements; no person data, tokens or query text. */
export function onboardingPerformance(operation: 'detail' | 'validation', organizationId: string, batchId: string) {
  const enabled = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
  const started = performance.now();
  let previous = started;
  const phases: Record<string, number> = {};
  return {
    mark(name: string) {
      if (!enabled) return;
      const now = performance.now();
      phases[name] = Math.round((now - previous) * 10) / 10;
      previous = now;
    },
    finish(rowCount: number, changedRows?: number) {
      if (!enabled) return;
      logger.log(JSON.stringify({ event: 'ems_onboarding_performance', operation,
        organizationId, batchId, rowCount, ...(changedRows === undefined ? {} : { changedRows }),
        phasesMs: phases, totalMs: Math.round((performance.now() - started) * 10) / 10 }));
    },
  };
}
