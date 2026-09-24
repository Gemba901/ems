"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SgaService } from "@/services/sga.service";

// "New SGA" opens straight into step 1 of the draft wizard. Everything is filled in there;
// an unwanted draft can be discarded from the wizard's Review step.
export default function NewSgaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const started = useRef(false);

  const createMutation = useMutation({
    mutationFn: () => SgaService.create({}, accessToken!),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["sga-my"] });
      queryClient.setQueryData(["sga-detail", created.id], created);
      router.replace(`/sga/${created.id}?step=1`);
    },
  });

  useEffect(() => {
    if (started.current || !accessToken) return;
    started.current = true;
    createMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        {createMutation.isError ? (
          <>
            <p className="text-sm text-rose-700">
              {createMutation.error instanceof Error ? createMutation.error.message : "Failed to start a new SGA."}
            </p>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              className="min-h-10 rounded-xl bg-[#52618a] px-4 text-sm font-medium text-white hover:bg-[#445174]"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-[#52618a]" />
            <p className="text-sm text-slate-500">Starting your SGA...</p>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
