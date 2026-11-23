import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  ApprovedGoal,
  ApprovedKpiAssignment,
  ExecutionProvider,
  PerformancePlanningProvider,
  PendingActionCheck,
  PeriodTarget,
  SubmittedResult,
  TrackedAction,
} from '../common/contracts';

// Area 05 reads 03 and 04 only through these tokens, never through their tables.
// Both will be bound to Area 04's execution module (/leadership-excellence/execution/*)
// when that branch merges; the stand-ins below keep screens empty until then.
export const MONITORING_PLANNING_SOURCE = Symbol('MONITORING_PLANNING_SOURCE');
export const MONITORING_EXECUTION_SOURCE = Symbol(
  'MONITORING_EXECUTION_SOURCE',
);

/**
 * TEMPORARY until Area 03 exports PerformancePlanningProvider.
 * No approved plans yet, so every screen is empty (never fake data).
 */
@Injectable()
export class UnavailablePlanningSource implements PerformancePlanningProvider {
  listApprovedAssignments(): Promise<ApprovedKpiAssignment[]> {
    return Promise.resolve([]);
  }
  getPeriodTargets(): Promise<PeriodTarget[]> {
    return Promise.resolve([]);
  }
  listGoals(): Promise<ApprovedGoal[]> {
    return Promise.resolve([]);
  }
}

const unavailable = () =>
  Promise.reject(
    new ServiceUnavailableException(
      'Delivery tracking (Area 04) is not available yet',
    ),
  );

/** TEMPORARY until Area 04 exports ExecutionProvider. */
@Injectable()
export class UnavailableExecutionSource implements ExecutionProvider {
  listSubmitted(): Promise<SubmittedResult[]> {
    return Promise.resolve([]);
  }
  listActions(): Promise<TrackedAction[]> {
    return Promise.resolve([]);
  }
  getAction(): Promise<TrackedAction | null> {
    return Promise.resolve(null);
  }
  listActionsPendingCheck(): Promise<PendingActionCheck[]> {
    return Promise.resolve([]);
  }
  checkActionCompletion(): Promise<TrackedAction> {
    return unavailable();
  }
  createFollowUpAction(): Promise<TrackedAction> {
    return unavailable();
  }
  markVerified(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Result submission (Area 04) is not available yet',
      ),
    );
  }
  markReturned(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Result submission (Area 04) is not available yet',
      ),
    );
  }
}
