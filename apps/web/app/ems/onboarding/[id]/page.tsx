"use client";

import { use, useState, Fragment } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, OnboardingRecord, OnboardingRecordStatus, RECORD_STATUS_LABELS,
  BATCH_STATUS_LABELS, UpdateOnboardingRecordPayload,
} from "@/services/ems.service";
import {
  ArrowLeft, Loader2, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, Ban, Undo2, UserPlus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCountries } from "libphonenumber-js";

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const PHONE_COUNTRIES = getCountries().map((code) => ({ code, name: countryNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));

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
  record, onSave, onExclude, onInclude, saving, exclusionError,
}: {
  record: OnboardingRecord;
  onSave: (data: UpdateOnboardingRecordPayload) => void;
  onExclude: (reason: string) => void;
  onInclude: () => void;
  saving: boolean;
  exclusionError?: string;
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
              <div className="w-56">
                <input
                  type="text"
                  aria-label="Reason for excluding"
                  aria-invalid={!!exclusionError}
                  aria-describedby={
                    exclusionError ? `exclude-error-${record.id}` : undefined
                  }
                  placeholder="Reason for excluding…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                    exclusionError ? "border-red-300" : "border-slate-200"
                  }`}
                />
                {exclusionError && (
                  <p
                    id={`exclude-error-${record.id}`}
                    role="alert"
                    className="mt-1 text-xs text-red-600"
                  >
                    {exclusionError}
                  </p>
                )}
              </div>
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

  const [countryDraft, setCountryDraft] = useState<string | null>(null);

  const queryKey = ["ems-onboarding-batch", id];

  const { data: batch, isLoading: loading, error: queryError } = useQuery({
    queryKey,
    queryFn: () => EmsService.getOnboardingBatch(id, accessToken!),
    enabled: !!accessToken,
  });

  const updateCountry = useMutation({
    mutationFn: (country: string) => EmsService.updateOnboardingBatchCountry(id, country, accessToken!),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
      setCountryDraft(null);
    },
  });

  const validate = useMutation({
    mutationFn: () => EmsService.validateOnboardingBatch(id, accessToken!),
    onSuccess: (updated) => queryClient.setQueryData(queryKey, updated),
  });

  const save = useMutation({
    mutationFn: (vars: { recordId: string; data: UpdateOnboardingRecordPayload }) =>
      EmsService.updateOnboardingRecord(vars.recordId, vars.data, accessToken!),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      setOpenRow(null);
    }, 
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

  const register = useMutation({
    mutationFn: () => EmsService.registerOnboardingBatch(id, accessToken!),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result.batch),
  });

  const error = queryError ? (queryError as any).message : null;
  const records: OnboardingRecord[] = batch?.records ?? [];
  const busy = save.isPending || exclude.isPending || include.isPending ||
    updateCountry.isPending || validate.isPending || register.isPending;
  const country = countryDraft ?? batch?.defaultPhoneCountry ?? "";
  const countryUnsaved = country !== (batch?.defaultPhoneCountry ?? "");
  const closed = batch?.status === "CANCELLED" || batch?.status === "REGISTERED";
  const mutationError = updateCountry.error ?? validate.error ?? register.error ?? save.error ?? include.error;

  const readyCount = records.filter((r) => r.status === "READY").length;
  const problemCount = records.filter((r) => r.status === "NEEDS_FIXING").length;
  const registeredCount = records.filter((r) => r.status === "REGISTERED").length;

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
                ? `${records.length} records · ${readyCount} ready · ${problemCount} need fixing · ${registeredCount} registered · ${BATCH_STATUS_LABELS[batch.status]}`
                : "Loading…"}
            </p>
            {register.isSuccess && (
              <p className="text-xs text-emerald-700">
                {register.data.registered} registered
                {register.data.failed > 0 && `, ${register.data.failed} failed`}
              </p>
          )}
          </div>
          <button
            onClick={() => validate.mutate()}
            disabled={busy || !batch || closed || countryUnsaved}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {validate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Validate all
          </button>

          <button
            onClick={() => register.mutate()}
            disabled={busy || readyCount === 0 || closed || countryUnsaved}
            title={readyCount === 0 ? "No records are ready to register" : undefined}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {register.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Register {readyCount}
          </button>

          {/*<button
            disabled
            title="Not implemented yet"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Register {readyCount}
          </button>*/}
        </div>

        {batch && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <label htmlFor="batch-phone-country" className="block text-sm font-semibold text-slate-700">
              Default country for phone numbers
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select id="batch-phone-country" value={country}
                onChange={(event) => { setCountryDraft(event.target.value); updateCountry.reset(); }}
                disabled={busy || closed || (!!batch.defaultPhoneCountry && registeredCount > 0)}
                aria-describedby="batch-phone-country-help"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Choose a country</option>
                {PHONE_COUNTRIES.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
              </select>
              <button type="button" onClick={() => updateCountry.mutate(country)}
                disabled={busy || closed || !country || !countryUnsaved}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {updateCountry.isPending ? "Saving…" : "Save country & revalidate"}
              </button>
            </div>
            <p id="batch-phone-country-help" className="text-xs text-slate-500">
              Used for local phone numbers in this import. Numbers beginning with + keep their country code.
              For people in other countries, enter + and their country code. Saving checks pending records again;
              it does not change registered employees or existing logins.
            </p>
            {!batch.defaultPhoneCountry && <p className="text-xs text-amber-700">This older import has no default country. Choose one for local numbers, or enter every number with + and its country code.</p>}
            {countryUnsaved && <p className="text-xs text-amber-700">Save the country before validating or registering records.</p>}
            {!!batch.defaultPhoneCountry && registeredCount > 0 && <p className="text-xs text-slate-500">The country is fixed because registration has started.</p>}
          </div>
        )}
        {mutationError && <p role="alert" className="text-sm text-red-600">{mutationError.message}</p>}

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
                    <Fragment key={rec.id}>
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
                              saving={busy || countryUnsaved || closed}
                              exclusionError={
                                exclude.isError && exclude.variables?.recordId === rec.id
                                  ? exclude.error.message || "Could not exclude this record."
                                  : undefined
                              }
                              onSave={(data) => save.mutate({ recordId: rec.id, data })}
                              onExclude={(reason) => exclude.mutate({ recordId: rec.id, reason })}
                              onInclude={() => include.mutate(rec.id)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
