export type RegistrationBatchTotals = { total: number; registered: number; excluded: number };
export type RegistrationProgress = {
  batchTotals?: RegistrationBatchTotals;
  id: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
  total: number; processed: number; registered: number; failed: number; awaitingAdmin: number;
  skipped: number; recoveries: number; message: string | null; startedAt: string; updatedAt: string;
};
export const registrationActive = (run?: RegistrationProgress | null) => !!run && ['QUEUED', 'RUNNING'].includes(run.status);
export function registrationProgressText(run: RegistrationProgress, disconnected: boolean) {
  if (disconnected) return 'Connection interrupted — checking saved progress. Registration may still be running; do not start another import.';
  if (run.status === 'QUEUED') return run.processed ? 'Registration is continuing in groups. Completed employees are saved; no further clicks are needed.' : 'Registration queued. You can leave this page and return to check progress.';
  if (run.status === 'RUNNING' && Date.now() - Date.parse(run.updatedAt) > 120000) return 'Registration is taking longer than expected. Showing the last saved progress; you can pause it or wait for recovery.';
  if (run.status === 'RUNNING') return `${run.recoveries ? 'Registration recovered after an interruption.' : 'Registration in progress.'} You can leave this page; completed employees are saved.`;
  return run.message ?? 'Registration has ended.';
}

/** Nest/Express sends an empty 200 body when the status controller returns null. */
export function decodeRegistrationProgress(body: string): RegistrationProgress | null {
  if (!body.trim()) return null;
  const value: unknown = JSON.parse(body);
  if (value === null) return null;
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string'
    || !('status' in value) || !['QUEUED','RUNNING','COMPLETED','FAILED','STOPPED'].includes(String(value.status))) {
    throw new Error('The server returned an unrecognised registration status.');
  }
  return value as RegistrationProgress;
}

export function registrationControls(input: {run?: RegistrationProgress | null; checking: boolean; disconnected: boolean; starting: boolean; uncertain: boolean}) {
  const active = registrationActive(input.run);
  const editingBlocked = active || input.starting || input.uncertain;
  return { active, editingBlocked,
    startBlocked: editingBlocked || input.checking || input.disconnected,
    label: input.starting ? 'Starting…' : input.uncertain ? 'Checking request…'
      : active ? input.disconnected ? 'Reconnecting…' : input.run?.status === 'QUEUED' ? 'Queued…' : 'Registering…'
      : input.checking ? 'Checking…' : input.disconnected ? 'Status unavailable' : null,
  };
}
