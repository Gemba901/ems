"use client";

import { use, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, OnboardingRecord, OnboardingRecordStatus, RECORD_STATUS_LABELS,
  BATCH_STATUS_LABELS, UpdateOnboardingRecordPayload,
} from "@/services/ems.service";
import {
  ArrowLeft, Loader2, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, Ban, Undo2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const EDITABLE_FIELDS: { key: keyof UpdateOnboardingRecordPayload; label: string }[] = [
  { key: "employeeCode",           label: "Employee code" },
  { key: "firstName",              label: "First name" },
  { key: "middleName",             label: "Middle name" },
  { key: "lastName",               label: "Last name" },
  { key: "gender",                 label: "Gender" },
  { key: "nationality",            label: "Nationality" },
  { key: "mobileNumber",           label: "Mobile number" },
  { key: "workEmail",              label: "Work email" },
  { key: "companyCode",            label: "Company code" },
  { key: "plantBranchCode",        label: "Plant / branch" },
  { key: "currentDepartment",      label: "Department" },
  { key: "jobDesignation",         label: "Designation" },
  { key: "workArea",               label: "Work area" },
  { key: "subSection",             label: "Sub-section" },
  { key: "shift",                  label: "Shift" },
  { key: "employmentStatus",       label: "Employment status" },
  { key: "employmentType",         label: "Employment type" },
  { key: "beesAccessLevel",        label: "Access level" },
  { key: "hodName",                label: "HOD name" },
  { key: "hodDesignation",         label: "HOD designation" },
  { key: "reportingToName",        label: "Reporting to" },
  { key: "reportingToDesignation", label: "Reporting to designation" },
  { key: "reliever1Name",          label: "1st reliever" },
  { key: "reliever1Designation",   label: "1st reliever designation" },
  { key: "reliever2Name",          label: "2nd reliever" },
  { key: "reliever2Designation",   label: "2nd reliever designation" },
];

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

function RecordEditor({
  record, onSave, onExclude, onInclude, saving,
}: {
  record: OnboardingRecord;
  onSave: (data: UpdateOnboardingRecordPayload) => void;
  onExclude: (reason: string) => void;
  onInclude: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<UpdateOnboardingRecordPayload>(() => {
    const initial: UpdateOnboardingRecordPayload = {};
    for (const { key } of EDITABLE_FIELDS) {
      initial[key] = (record[key as keyof OnboardingRecord] as string | null) ?? "";
    }
    return initial;
  });
  const [reason, setReason] = useState("");

  const errorFields = new Set((record.validationErrors ?? []).map((e) => e.field));
  const locked = record.status === "REGISTERED";

  return (
    <div className="bg-slate-50 px-5 py-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {EDITABLE_FIELDS.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </span>
            <input
              type="text"
              disabled={locked}
              value={draft[key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                errorFields.has(key) ? "border-red-300" : "border-slate-200"
              }`}
            />
          </label>
        ))}
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200">
          <button
            onClick={() => onSave(draft)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save &amp; re-validate
          </button>

          {record.status === "EXCLUDED" ? (
            <button
              onClick={onInclude}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" /> Put back in
            </button>
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="text"
                placeholder="Reason for excluding…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                onClick={() => onExclude(reason)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" /> Exclude
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmsOnboardingBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [openRow, setOpenRow] = useState<string | null>(null);

  const queryKey = ["ems-onboarding-batch", id];

  const { data: batch, isLoading: loading, error: queryError } = useQuery({
    queryKey,
    queryFn: () => EmsService.getOnboardingBatch(id, accessToken!),
    enabled: !!accessToken,
  });

  const validate = useMutation({
    mutationFn: () => EmsService.validateOnboardingBatch(id, accessToken!),
    onSuccess: (updated) => queryClient.setQueryData(queryKey, updated),
  });

  const save = useMutation({
    mutationFn: (vars: { recordId: string; data: UpdateOnboardingRecordPayload }) =>
      EmsService.updateOnboardingRecord(vars.recordId, vars.data, accessToken!),
    onSuccess: (updated) => queryClient.setQueryData(queryKey, updated),
  });

  const exclude = useMutation({
    mutationFn: (vars: { recordId: string; reason: string }) =>
      EmsService.excludeOnboardingRecord(vars.recordId, vars.reason, accessToken!),
    onSuccess: (updated) => queryClient.setQueryData(queryKey, updated),
  });

  const include = useMutation({
    mutationFn: (recordId: string) => EmsService.includeOnboardingRecord(recordId, accessToken!),
    onSuccess: (updated) => queryClient.setQueryData(queryKey, updated),
  });

  const error = queryError ? (queryError as any).message : null;
  const records: OnboardingRecord[] = batch?.records ?? [];
  const busy = save.isPending || exclude.isPending || include.isPending;

  const readyCount = records.filter((r) => r.status === "READY").length;
  const problemCount = records.filter((r) => r.status === "NEEDS_FIXING").length;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/ems/onboarding" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">{batch?.label ?? "Import"}</h1>
            <p className="text-sm text-slate-500">
              {batch
                ? `${records.length} records · ${readyCount} ready · ${problemCount} need fixing · ${BATCH_STATUS_LABELS[batch.status]}`
                : "Loading…"}
            </p>
          </div>
          <button
            onClick={() => validate.mutate()}
            disabled={validate.isPending || !batch}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {validate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Validate all
          </button>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="w-10 px-3 py-3" />
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Row</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.map((rec) => {
                  const open = openRow === rec.id;
                  return (
                    <>
                      <tr
                        key={rec.id}
                        onClick={() => setOpenRow(open ? null : rec.id)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer align-top"
                      >
                        <td className="px-3 py-3 text-slate-300">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{rec.rowNumber ?? "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-400">{rec.employeeCode ?? "—"}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">
                            {[rec.firstName, rec.middleName, rec.lastName].filter(Boolean).join(" ") || "—"}
                          </p>
                          {rec.validationErrors && rec.validationErrors.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {rec.validationErrors.map((err, i) => (
                                <li key={i} className="flex items-center gap-1 text-xs text-red-600">
                                  <AlertCircle className="h-3 w-3 shrink-0" />
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
                        <td className="px-4 py-3"><RecordStatusPill status={rec.status} /></td>
                      </tr>
                      {open && (
                        <tr key={`${rec.id}-editor`}>
                          <td colSpan={6} className="p-0">
                            <RecordEditor
                              record={rec}
                              saving={busy}
                              onSave={(data) => save.mutate({ recordId: rec.id, data })}
                              onExclude={(reason) => exclude.mutate({ recordId: rec.id, reason })}
                              onInclude={() => include.mutate(rec.id)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                      No records in this import.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}