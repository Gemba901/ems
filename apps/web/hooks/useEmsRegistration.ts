'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmsService } from '@/services/ems.service';
import { registrationActive, registrationControls } from '@/components/ems/registration-progress';

export function useEmsRegistration(batchId: string, token: string | null | undefined, enabled: boolean) {
  const client = useQueryClient();
  const key = ['ems-registration', batchId];
  const [uncertain, setUncertain] = useState(false);
  const seen = useRef('');
  const status = useQuery({
    queryKey: key,
    queryFn: () => EmsService.getRegistrationProgress(batchId, token!),
    enabled: !!token && enabled,
    refetchInterval: q => registrationActive(q.state.data) || uncertain || q.state.error ? 3000 : 10000,
    refetchIntervalInBackground: true,
    retry: 1,
  });
  useEffect(() => { setUncertain(false); seen.current = ''; }, [batchId]);
  useEffect(() => {
    if (status.isSuccess && !status.isFetching) setUncertain(false);
  }, [status.dataUpdatedAt, status.isSuccess, status.isFetching]);
  useEffect(() => {
    const run = status.data;
    if (!run || registrationActive(run) || seen.current === `${run.id}:${run.status}`) return;
    seen.current = `${run.id}:${run.status}`;
    void client.invalidateQueries({ queryKey: ['ems-onboarding-batch', batchId] });
    void client.invalidateQueries({ queryKey: ['ems-employees'] });
    void client.invalidateQueries({ queryKey: ['ems-employee-import-batches'] });
  }, [status.data, batchId, client]);
  const start = useMutation({
    mutationFn: () => EmsService.registerOnboardingBatch(batchId, token!),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: async run => { await client.cancelQueries({ queryKey: key }); setUncertain(false); client.setQueryData(key, run); },
    onError: () => { setUncertain(true); void status.refetch(); },
  });
  const stop = useMutation({
    mutationFn: () => EmsService.stopRegistration(batchId, token!),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: async run => { await client.cancelQueries({ queryKey: key }); client.setQueryData(key, run); },
    onError: () => { void status.refetch(); },
  });
  const controls = registrationControls({run: status.data, checking: enabled && status.isLoading,
    disconnected: enabled && status.isError, starting: start.isPending, uncertain});
  return { run: status.data, start, stop, disconnected: enabled && status.isError,
    checking: enabled && status.isLoading || uncertain,
    busy: enabled && controls.editingBlocked,
    startBlocked: !token || enabled && controls.startBlocked,
    buttonLabel: controls.label,
    refresh: () => { void status.refetch(); },
  };
}
