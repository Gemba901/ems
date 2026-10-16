"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCreateAction } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import type { Practice } from "@/services/five-s.service";
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
  selectClass,
} from "@/components/five-s/ui";

function NewAction() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const create = useCreateAction();
  const [areaId, setAreaId] = useState<string | null>(params.get("areaId"));
  const [practice, setPractice] = useState<Practice>("SORT");
  const [finding, setFinding] = useState("");
  const [affected, setAffected] = useState("");
  const [corrective, setCorrective] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!areaId) return setFormError("Choose the area.");
    if (!finding.trim()) return setFormError("Describe the finding.");
    setFormError(null);
    create.mutate(
      {
        areaId,
        practice,
        finding: finding.trim(),
        affectedLocations: affected.trim() || null,
        correctiveAction: corrective.trim() || null,
        ownerId,
        dueDate: dueDate || null,
      },
      {
        onSuccess: (a) => {
          toast(`Action ${a.reference} raised`, "success");
          router.push(`/five-s/actions/${a.id}`);
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/five-s/actions" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Improvement actions
      </Link>
      <PageHeader title="New improvement action" description="For problems found outside an audit. Manual actions do not affect any audit score." />
      <Surface className="p-5">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {(formError || create.error) && <ErrorNote>{formError ?? errorMessage(create.error)}</ErrorNote>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workplace area" htmlFor="action-area">
              <AreaSelect id="action-area" value={areaId} onChange={setAreaId} />
            </Field>
            <Field label="S" htmlFor="action-practice">
              <select id="action-practice" className={selectClass} value={practice} onChange={(e) => setPractice(e.target.value as Practice)}>
                {PRACTICE_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRACTICE_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Finding" htmlFor="action-finding">
            <textarea id="action-finding" rows={3} className={inputClass} value={finding} maxLength={2000} onChange={(e) => setFinding(e.target.value)} />
          </Field>
          <Field label="Affected locations" htmlFor="action-affected">
            <input id="action-affected" className={inputClass} value={affected} maxLength={2000} onChange={(e) => setAffected(e.target.value)} />
          </Field>
          <Field label="Corrective action" htmlFor="action-corrective" hint="What will be done to fix it.">
            <textarea id="action-corrective" rows={2} className={inputClass} value={corrective} maxLength={2000} onChange={(e) => setCorrective(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Action owner" htmlFor="action-owner" hint="Defaults to the area owner.">
              <PersonSelect id="action-owner" value={ownerId} onChange={setOwnerId} emptyLabel="Area owner" />
            </Field>
            <Field label="Due date" htmlFor="action-due" hint="Optional. Without one the action shows Due date not set and is never overdue.">
              <input id="action-due" type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Link href="/five-s/actions" className={secondaryButton}>
              Cancel
            </Link>
            <button type="submit" className={primaryButton} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Raise action"}
            </button>
          </div>
        </form>
      </Surface>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewActionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewAction />
    </Suspense>
  );
}
