"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
  StrategicDirectionApiError,
  StrategicDirectionService,
  type SaveDraftPayload,
} from "@/services/leadership-excellence/strategic-direction.service";

// Keys start with the org and user so cached drafts never cross sessions in one tab.
function useScope() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const scope = ["lex-strategic-direction", user?.organizationId ?? "", user?.userId ?? ""] as const;
  return { token: accessToken ?? "", enabled: !!accessToken && !!user, scope };
}

// 4xx answers won't change on retry.
function retryTransient(failureCount: number, error: unknown) {
  if (error instanceof StrategicDirectionApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function useDirectionDraft(options: { enabled?: boolean } = {}) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "draft"],
    queryFn: () => StrategicDirectionService.getDraft(token),
    enabled: enabled && (options.enabled ?? true),
    retry: retryTransient,
  });
}

export function useApprovedDirection(options: { enabled?: boolean } = {}) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "approved"],
    queryFn: () => StrategicDirectionService.getApproved(token),
    enabled: enabled && (options.enabled ?? true),
    retry: retryTransient,
  });
}

export function useDirectionHistory(options: { enabled?: boolean } = {}) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "history"],
    queryFn: () => StrategicDirectionService.getHistory(token),
    enabled: enabled && (options.enabled ?? true),
    retry: retryTransient,
  });
}

/** Every workflow action changes the draft, the approved version or the history, so refresh all three. */
function useDirectionMutation<TArg>(fn: (token: string, arg: TArg) => Promise<unknown>) {
  const qc = useQueryClient();
  const { token, scope } = useScope();
  return useMutation({
    mutationFn: (arg: TArg) => fn(token, arg),
    onSuccess: () => qc.invalidateQueries({ queryKey: scope }),
  });
}

export function useDirectionActions() {
  return {
    save: useDirectionMutation((token, payload: SaveDraftPayload) => StrategicDirectionService.saveDraft(token, payload)),
    submit: useDirectionMutation<void>((token) => StrategicDirectionService.submit(token)),
    withdraw: useDirectionMutation<void>((token) => StrategicDirectionService.withdraw(token)),
    returnForChanges: useDirectionMutation((token, reason: string) =>
      StrategicDirectionService.returnForChanges(token, reason),
    ),
    approve: useDirectionMutation<void>((token) => StrategicDirectionService.approve(token)),
    startRevision: useDirectionMutation((token, reason: string) => StrategicDirectionService.startRevision(token, reason)),
  };
}
