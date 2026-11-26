"use client";

import { useParams } from "next/navigation";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService } from "@/services/kaizen.service";
import { EmployeeService } from "@/services/employee.service";
import KaizenForm from "@/components/kaizen/KaizenForm";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function KaizenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const role = user?.roleLevel as Role | undefined;

  const {
    data: kaizen,
    isLoading,
    error: fetchErr,
    refetch: refetchKaizen,
  } = useQuery({
    queryKey: ["kaizen-detail", id],
    queryFn: () => KaizenService.getById(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const {
    data: me,
    error: employeeError,
    refetch: refetchEmployee,
  } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });

  const error = fetchErr ?? employeeError;
  const header = {
    title: "Kaizen details",
    breadcrumbs: [{ label: "Kaizens", href: "/kaizen" }, { label: "Details" }],
  };

  return (
    <ProtectedRoute
      allowedRoles={[
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.MANAGEMENT,
        Role.HOD,
        Role.HR,
        Role.EMPLOYEE,
      ]}
    >
      {error ? (
        <DetailPageTemplate header={header}>
          <ErrorState
            title="Unable to load kaizen"
            description={error.message}
            onRetry={() => {
              if (fetchErr) void refetchKaizen();
              if (employeeError) void refetchEmployee();
            }}
          />
        </DetailPageTemplate>
      ) : isLoading || !kaizen || !me || !accessToken ? (
        <DetailPageTemplate header={header}>
          <LoadingState label="Loading kaizen…" />
        </DetailPageTemplate>
      ) : (
        <KaizenForm
          kaizen={kaizen}
          me={me}
          role={role}
          token={accessToken}
          onSaved={(updated) =>
            queryClient.setQueryData(["kaizen-detail", id], updated)
          }
        />
      )}
    </ProtectedRoute>
  );
}
