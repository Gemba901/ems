"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService } from "@/services/kaizen.service";
import { EmployeeService } from "@/services/employee.service";
import KaizenForm from "@/components/kaizen/KaizenForm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

export default function KaizenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const role = user?.roleLevel as Role | undefined;

  const { data: kaizen, isLoading, error: fetchErr } = useQuery({
    queryKey: ["kaizen-detail", id],
    queryFn: () => KaizenService.getById(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });

  const error = fetchErr ? (fetchErr as any).message : null;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 mx-auto">
        <Link href="/kaizen" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Kaizens
        </Link>

        {(isLoading || !me) && <p className="text-sm text-slate-400">Loading...</p>}
        {!isLoading && error && (
          <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-lg border border-red-100">{error}</p>
        )}

        {!isLoading && !error && kaizen && me && (
          <KaizenForm
            kaizen={kaizen}
            me={me}
            role={role}
            token={accessToken!}
            onSaved={(updated) => queryClient.setQueryData(["kaizen-detail", id], updated)}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
