"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/patterns/ErrorState";
import { FormField } from "@/components/patterns/FormField";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCreateAudit, useFiveSArea, useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { CHECKSHEET_LABEL } from "@/lib/five-s/template";
import {
  AreaSelect,
  PersonSelect,
  errorMessage,
  today as localToday,
} from "@/components/five-s/ui";

function NewAuditForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: caps, isLoading: capsLoading, error: capsError, refetch: refetchCaps } = useFiveSCapabilities();
  const create = useCreateAudit();

  const [areaId, setAreaId] = useState<string | null>(params.get("areaId"));
  const { data: area } = useFiveSArea(areaId ?? undefined);
  const maxDate = caps?.today ?? localToday();
  const [draftDate, setAuditDate] = useState<string>();
  const auditDate = draftDate ?? maxDate;
  const [auditorId, setAuditorId] = useState<string | null>(null);
  const [auditeeId, setAuditeeId] = useState<string | null>(null);
  const [auditeeName, setAuditeeName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (capsLoading) return <LoadingState label="Loading audit setup…" />;
  if (capsError) return <ErrorState description={errorMessage(capsError)} onRetry={() => void refetchCaps()} />;

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
    <div className="space-y-section">
      <PageHeader
        title="Start a 5S audit"
        description={`${CHECKSHEET_LABEL}. 20 checkpoints, four under each S.`}
        breadcrumbs={[{ label: "5S audits", href: "/five-s/audits" }, { label: "Start an audit" }]}
      />

      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {(formError || create.error) && <ErrorState description={formError ?? errorMessage(create.error)} />}
            <FormField label="Workplace area" id="audit-area" required>
              <AreaSelect
                id="audit-area"
                value={areaId}
                onChange={setAreaId}
              />
            </FormField>
            {area && (
              <p className="-mt-2 text-xs text-muted-foreground">
                {area.department?.name ?? "No department"} · Owner: {area.owner?.name ?? "not set"} · Target level {area.targetLevel.toFixed(1)}
                {area.drafts.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <Link href={`/five-s/audits/${area.drafts[0].id}`} className="font-medium text-warning underline">
                      This area already has a draft ({area.drafts[0].reference}) – resume it instead?
                    </Link>
                  </>
                )}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Audit date" id="audit-date" required description="Today or earlier.">
                <Input id="audit-date" type="date" value={auditDate} max={maxDate} onChange={(e) => setAuditDate(e.target.value)} />
              </FormField>
              <FormField label="Auditor" id="audit-auditor" description="Only the area HOD or a 5S administrator can record an audit for someone else.">
                <PersonSelect id="audit-auditor" value={effectiveAuditor} onChange={setAuditorId} allowEmpty={false} />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Auditee (area representative)" id="audit-auditee" description="The person you walk the area with and discuss findings with.">
                <PersonSelect id="audit-auditee" value={auditeeId} onChange={setAuditeeId} emptyLabel="Not in the list / not recorded" />
              </FormField>
              {!auditeeId && (
                <FormField label="Auditee name" id="audit-auditee-name" description="If the auditee is not in the employee list.">
                  <Input id="audit-auditee-name" value={auditeeName} maxLength={120} onChange={(e) => setAuditeeName(e.target.value)} />
                </FormField>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Link href="/five-s/audits" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Starting…" : "Start audit (saves a draft)"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewAuditPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading audit setup…" />}>
      <NewAuditForm />
    </Suspense>
  );
}
