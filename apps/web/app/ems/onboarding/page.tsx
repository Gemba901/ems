"use client";

import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, OnboardingBatchSummary, OnboardingBatchStatus, BATCH_STATUS_LABELS,
} from "@/services/ems.service";
import { ArrowLeft, Loader2, FileSpreadsheet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

function BatchStatusPill({ status }: { status: OnboardingBatchStatus }) {
  const colour =
    status === "REGISTERED"           ? "bg-emerald-100 text-emerald-700" :
    status === "PARTIALLY_REGISTERED" ? "bg-amber-100 text-amber-700" :
    status === "READY"                ? "bg-blue-100 text-blue-700" :
    status === "CANCELLED"            ? "bg-red-100 text-red-700" :
                                        "bg-slate-100 text-slate-500";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colour}`}>
      {BATCH_STATUS_LABELS[status]}
    </span>
  );
}

export default function EmsOnboardingPage() {
  const { accessToken } = useAuthStore();

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["ems-onboarding-batches"],
    queryFn: () => EmsService.listOnboardingBatches(accessToken!),
    enabled: !!accessToken,
  });

  const batches: OnboardingBatchSummary[] = data ?? [];
  const error = queryError ? (queryError as any).message : null;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/ems" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Onboarding imports</h1>
            <p className="text-sm text-slate-500">Employee data uploaded for registration</p>
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
                    <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide">Batch</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Records</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Uploaded by</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-slate-300" />
                          <div>
                            <p className="font-medium text-slate-800">{batch.label ?? "Untitled import"}</p>
                            {batch.sourceFileName && (
                              <p className="text-xs text-slate-400">{batch.sourceFileName}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{batch._count.records}</td>
                      <td className="px-4 py-3"><BatchStatusPill status={batch.status} /></td>
                      <td className="px-4 py-3 text-slate-500">{batch.uploadedBy?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(batch.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/ems/onboarding/${batch.id}`}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                        No imports yet.
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