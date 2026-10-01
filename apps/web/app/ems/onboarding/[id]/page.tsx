"use client";

import { use } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, OnboardingRecord, OnboardingRecordStatus, RECORD_STATUS_LABELS,
  BATCH_STATUS_LABELS,
} from "@/services/ems.service";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

function RecordStatusPill({ status }: { status: OnboardingRecordStatus }) {
  const colour =
    status === "REGISTERED"   ? "bg-emerald-100 text-emerald-700" :
    status === "READY"        ? "bg-blue-100 text-blue-700" :
    status === "NEEDS_FIXING" ? "bg-red-100 text-red-700" :
    status === "EXCLUDED"     ? "bg-slate-100 text-slate-400" :
                                "bg-slate-100 text-slate-500";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colour}`}>
      {RECORD_STATUS_LABELS[status]}
    </span>
  );
}

export default function EmsOnboardingBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken } = useAuthStore();

  const { data: batch, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["ems-onboarding-batch", id],
    queryFn: () => EmsService.getOnboardingBatch(id, accessToken!),
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as any).message : null;
  const records: OnboardingRecord[] = batch?.records ?? [];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/ems/onboarding" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {batch?.label ?? "Import"}
            </h1>
            <p className="text-sm text-slate-500">
              {batch ? `${records.length} records · ${BATCH_STATUS_LABELS[batch.status]}` : "Loading…"}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide">Row</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Code</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Department</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Designation</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors align-top">
                      <td className="px-5 py-3 text-xs text-slate-400">{rec.rowNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{rec.employeeCode ?? "—"}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {[rec.firstName, rec.middleName, rec.lastName].filter(Boolean).join(" ") || "—"}
                        </p>
                        {rec.validationErrors && rec.validationErrors.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {rec.validationErrors.map((err, i) => (
                              <li key={i} className="flex items-center gap-1 text-xs text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                {err.field}: {err.message}
                              </li>
                            ))}
                          </ul>
                        )}
                        {rec.exclusionReason && (
                          <p className="mt-1 text-xs text-slate-400 italic">{rec.exclusionReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{rec.currentDepartment ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{rec.jobDesignation ?? "—"}</td>
                      <td className="px-4 py-3"><RecordStatusPill status={rec.status} /></td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                        No records in this import.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}