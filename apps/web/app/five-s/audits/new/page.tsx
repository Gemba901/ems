"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCreateAudit, useFiveSArea, useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { CHECKSHEET_LABEL } from "@/lib/five-s/template";
import {
  AreaSelect,
  ErrorNote,
  Field,
  Loading,
  PageHeader,
  PersonSelect,
  Surface,
  errorMessage,
  inputClass,
  linkButton,
  primaryButton,
  secondaryButton,
  today as localToday,
} from "@/components/five-s/ui";

function NewAuditForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: caps, isLoading: capsLoading } = useFiveSCapabilities();
  const create = useCreateAudit();

  const [areaId, setAreaId] = useState<string | null>(params.get("areaId"));
  const { data: area } = useFiveSArea(areaId ?? undefined);
  const maxDate = caps?.today ?? localToday();
  const [auditDate, setAuditDate] = useState(maxDate);
  const [auditorId, setAuditorId] = useState<string | null>(null);
  const [auditeeId, setAuditeeId] = useState<string | null>(null);
  const [auditeeName, setAuditeeName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (capsLoading) return <Loading />;

  const effectiveAuditor = auditorId ?? caps?.employeeId ?? null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!areaId) return setFormError("Choose the area you are auditing.");
    if (!auditDate) return setFormError("Enter the audit date.");
    if (auditDate > maxDate) return setFormError("The audit date cannot be in the future.");
    setFormError(null);
    create.mutate(
      {
        areaId,
        auditDate,
        ...(effectiveAuditor && effectiveAuditor !== caps?.employeeId ? { auditorId: effectiveAuditor } : {}),
        auditeeId,
        auditeeName: auditeeId ? null : auditeeName.trim() || null,
      },
      {
        onSuccess: (audit) => {
          toast(`Draft ${audit.reference} started`, "success");
          router.push(`/five-s/audits/${audit.id}`);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/five-s/audits" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 5S audits
      </Link>
      <PageHeader title="Start a 5S audit" description={`${CHECKSHEET_LABEL}. 20 checkpoints, four under each S.`} />

      <ol className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
        {["1. Area and date", "2. Walk the area with the auditee", "3. Record all 20 checkpoints", "4. Review and submit"].map((s, i) => (
          <li key={s} className={i === 0 ? "rounded-lg bg-blue-600 px-3 py-2 font-medium text-white" : "rounded-lg bg-slate-100 px-3 py-2"}>
            {s}
          </li>
        ))}
      </ol>

      <Surface className="p-5">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {(formError || create.error) && <ErrorNote>{formError ?? errorMessage(create.error)}</ErrorNote>}
          <Field label="Workplace area" htmlFor="audit-area">
            <AreaSelect
              id="audit-area"
              value={areaId}
              onChange={setAreaId}
            />
          </Field>
          {area && (
            <p className="-mt-2 text-xs text-slate-500">
              {area.department?.name ?? "No department"} · Owner: {area.owner?.name ?? "not set"} · Target level {area.targetLevel.toFixed(1)}
              {area.drafts.length > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/five-s/audits/${area.drafts[0].id}`} className="font-medium text-amber-800 underline">
                    This area already has a draft ({area.drafts[0].reference}) – resume it instead?
                  </Link>
                </>
              )}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audit date" htmlFor="audit-date" hint="Today or earlier.">
              <input id="audit-date" type="date" className={inputClass} value={auditDate} max={maxDate} onChange={(e) => setAuditDate(e.target.value)} />
            </Field>
            <Field label="Auditor" htmlFor="audit-auditor" hint="Only the area HOD or a 5S administrator can record an audit for someone else.">
              <PersonSelect id="audit-auditor" value={effectiveAuditor} onChange={setAuditorId} allowEmpty={false} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Auditee (area representative)" htmlFor="audit-auditee" hint="The person you walk the area with and discuss findings with.">
              <PersonSelect id="audit-auditee" value={auditeeId} onChange={setAuditeeId} emptyLabel="Not in the list / not recorded" />
            </Field>
            {!auditeeId && (
              <Field label="Auditee name" htmlFor="audit-auditee-name" hint="If the auditee is not in the employee list.">
                <input id="audit-auditee-name" className={inputClass} value={auditeeName} maxLength={120} onChange={(e) => setAuditeeName(e.target.value)} />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Link href="/five-s/audits" className={secondaryButton}>
              Cancel
            </Link>
            <button type="submit" className={primaryButton} disabled={create.isPending}>
              {create.isPending ? "Starting…" : "Start audit (saves a draft)"}
            </button>
          </div>
        </form>
      </Surface>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewAuditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewAuditForm />
    </Suspense>
  );
}
