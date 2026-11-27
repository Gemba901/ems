import type { ExecutionState } from '../execution/execution.types';
import type { ProgrammeActionProgress } from './planning.types';

/** Read-only compatibility projection; execution remains the owner of updates. */
export function executionActionProgress(
  value: unknown,
): ProgrammeActionProgress[] {
  const state = value as Partial<ExecutionState> | null;
  return (state?.actionUpdates || []).flatMap((update) => {
    const [documentId, actionId] = update.actionKey.split('/action/');
    if (!documentId || !actionId) return [];
    return [
      {
        id: `execution:${update.actionKey}`,
        documentId,
        actionId,
        status:
          update.status === 'COMPLETED'
            ? ('COMPLETED' as const)
            : update.status === 'NOT_STARTED'
              ? ('PLANNED' as const)
              : ('IN_PROGRESS' as const),
        evidence: update.evidence,
        note: update.note,
        updatedBy: update.updatedBy,
        updatedAt: update.updatedAt,
      },
    ];
  });
}

export function actionHasExecutionRecords(
  value: unknown,
  actionKey: string,
): boolean {
  const state = value as Partial<ExecutionState> | null;
  return (
    !!state?.actionUpdates?.some((update) => update.actionKey === actionKey) ||
    !!state?.supportRequests?.some((request) => request.actionKey === actionKey)
  );
}
