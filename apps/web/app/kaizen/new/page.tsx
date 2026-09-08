"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService } from "@/services/kaizen.service";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

export default function NewKaizenPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const started = useRef(false);

  const createMutation = useMutation({
    mutationFn: () => KaizenService.create({}, accessToken!),
    onSuccess: (created) => router.replace(`/kaizen/${created.id}`),
  });

  useEffect(() => {
    if (started.current || !accessToken) return;
    started.current = true;
    createMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <div className="px-4 py-16 flex flex-col items-center justify-center text-center gap-3">
        {createMutation.isError ? (
          <>
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error ? createMutation.error.message : "Failed to start a new Daily Kaizen."}
            </p>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-500">Starting your Daily Kaizen...</p>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
