"use client";

import { useParams } from "next/navigation";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SgaService } from "@/services/sga.service";
import { EmployeeService } from "@/services/employee.service";
import SgaForm from "@/components/sga/SgaForm";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function SgaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const role = user?.roleLevel as Role | undefined;

  const {
    data: sga,
    isLoading,
    error: fetchErr,
    refetch: refetchSga,
  } = useQuery({
    queryKey: ["sga-detail", id],
    queryFn: () => SgaService.getById(id!, accessToken!),
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
  const ready = Boolean(accessToken && sga && me);
  const header = {
    title: "SGA details",
    breadcrumbs: [{ label: "SGAs", href: "/sga" }, { label: "Details" }],
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
            title="Unable to load SGA"
            description={error.message}
            onRetry={() => {
              if (fetchErr) void refetchSga();
              if (employeeError) void refetchEmployee();
            }}
          />
        </DetailPageTemplate>
      ) : isLoading || !ready ? (
        <DetailPageTemplate header={header}>
          <LoadingState label="Loading SGA…" />
        </DetailPageTemplate>
      ) : accessToken && sga && me ? (
        <SgaForm
          sga={sga}
          me={me}
          role={role}
          token={accessToken!}
          onSaved={(updated) =>
            queryClient.setQueryData(["sga-detail", id], updated)
          }
        />
      ) : null}
    </ProtectedRoute>
  );
}
