"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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

const MAX_STEPS = 20;

type StepDraft = { key: number; description: string; ownerId: string | null; dueDate: string };

let stepKey = 0;
const emptyStep = (): StepDraft => ({ key: ++stepKey, description: "", ownerId: null, dueDate: "" });

function NewAction() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const create = useCreateAction();
  const [areaId, setAreaId] = useState<string | null>(params.get("areaId"));
  const [practice, setPractice] = useState<Practice>("SORT");
  const [finding, setFinding] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function updateStep(key: number, patch: Partial<StepDraft>) {
    setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!areaId) return setFormError("Choose the area.");
    if (!finding.trim()) return setFormError("Describe the finding.");
    const filled = steps.filter((s) => s.description.trim());
    if (filled.some((s) => s.description.trim().length < 3)) return setFormError("Each corrective action needs at least 3 characters.");
    setFormError(null);
    create.mutate(
      {
        areaId,
        practice,
        finding: finding.trim(),
        correctiveActions: filled.map((s) => ({ description: s.description.trim(), ownerId: s.ownerId, dueDate: s.dueDate || null })),
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
    <div className="space-y-6">
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
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-700">Corrective actions</legend>
            <p className="text-xs text-slate-500">
              The steps that fix the finding. Each step can have its own owner and due date; blank owners fall to the action owner. The action can only be
              sent for verification once every step is ticked done.
            </p>
            {steps.map((step, i) => (
              <div key={step.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 lg:grid-cols-[minmax(0,1fr)_14rem_10rem_auto] lg:items-end">
                <Field label={`Step ${i + 1}`} htmlFor={`step-${step.key}-description`}>
                  <input
                    id={`step-${step.key}-description`}
                    className={inputClass}
                    value={step.description}
                    maxLength={2000}
                    placeholder="What will be done"
                    onChange={(e) => updateStep(step.key, { description: e.target.value })}
                  />
                </Field>
                <Field label="Owner" htmlFor={`step-${step.key}-owner`}>
                  <PersonSelect
                    id={`step-${step.key}-owner`}
                    value={step.ownerId}
                    onChange={(ownerId) => updateStep(step.key, { ownerId })}
                    emptyLabel="Action owner"
                  />
                </Field>
                <Field label="Due date" htmlFor={`step-${step.key}-due`}>
                  <input
                    id={`step-${step.key}-due`}
                    type="date"
                    className={inputClass}
                    value={step.dueDate}
                    onChange={(e) => updateStep(step.key, { dueDate: e.target.value })}
                  />
                </Field>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setSteps((all) => (all.length === 1 ? [emptyStep()] : all.filter((s) => s.key !== step.key)))}
                  aria-label={`Remove step ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            {steps.length < MAX_STEPS && (
              <button type="button" className={secondaryButton} onClick={() => setSteps((all) => [...all, emptyStep()])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add corrective action
              </button>
            )}
          </fieldset>
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
