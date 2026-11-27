"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService } from "@/services/kaizen.service";

// "New Kaizen" opens straight into step 1 of the draft wizard. Everything is filled in there;
// an unwanted draft can be discarded from the wizard's Review step.
function StartKaizenDraft() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const started = useRef(false);
  const creating = useRef(false);

  const { mutate, isError, error } = useMutation({
    mutationFn: (token: string) => KaizenService.create({}, token),
    onError: () => { creating.current = false; },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["kaizen-my"] });
      queryClient.setQueryData(["kaizen-detail", created.id], created);
      router.replace(`/kaizen/${created.id}?step=1`);
    },
  });

  useEffect(() => {
    if (started.current || !accessToken) return;
    const timer = setTimeout(() => {
      started.current = true;
      creating.current = true;
      mutate(accessToken);
    }, 0);
    return () => clearTimeout(timer);
  }, [accessToken, mutate]);

  function retry() {
    if (!accessToken || creating.current) return;
    creating.current = true;
    mutate(accessToken);
  }

  return (
    <div className="space-y-section">
      <PageHeader
        title="New Kaizen"
        breadcrumbs={[{ label: "Kaizens", href: "/kaizen" }, { label: "New Kaizen" }]}
      />
      {isError ? (
        <ErrorState
          title="Unable to start a new Kaizen"
          description={error?.message}
          onRetry={retry}
        />
      ) : (
        <LoadingState label="Starting your Kaizen…" />
      )}
    </div>
  );
}

export default function NewKaizenPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <StartKaizenDraft />
    </ProtectedRoute>
  );
}
