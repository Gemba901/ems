"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/patterns/ErrorState";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/patterns/FormField";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/patterns/PageHeader";
import { LoadingState } from "@/components/patterns/LoadingState";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useCreateAction } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import type { Practice } from "@/services/five-s.service";
import {
  AreaSelect,
  PersonSelect,
  errorMessage,
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
    <div className="space-y-section">
      <PageHeader
        title="New improvement action"
        description="For problems found outside an audit. Manual actions do not affect audit scores."
        breadcrumbs={[{ label: "Improvement actions", href: "/five-s/actions" }, { label: "New action" }]}
      />
      <Card className="block p-5">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {(formError || !!create.error) && <ErrorState title="Unable to complete the action" description={formError ?? errorMessage(create.error)} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Workplace area" id="action-area" required>
              <AreaSelect id="action-area" value={areaId} onChange={setAreaId} />
            </FormField>
            <FormField label="S" id="action-practice">
              <NativeSelect id="action-practice" className="w-full" value={practice} onChange={(e) => setPractice(e.target.value as Practice)}>
                {PRACTICE_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRACTICE_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="Finding" id="action-finding" required>
            <Textarea id="action-finding" rows={3} value={finding} maxLength={2000} onChange={(e) => setFinding(e.target.value)} />
          </FormField>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">Corrective actions</legend>
            <p className="text-xs text-muted-foreground">
              The steps that fix the finding. Each step can have its own owner and due date; blank owners fall to the action owner. The action can only be
              sent for verification once every step is ticked done.
            </p>
            {steps.map((step, i) => (
              <div key={step.key} className="grid gap-3 rounded-lg border border-border p-3 lg:grid-cols-[minmax(0,1fr)_14rem_10rem_auto] lg:items-end">
                <FormField label={`Step ${i + 1}`} id={`step-${step.key}-description`}>
                  <Input
                    id={`step-${step.key}-description`}
                    value={step.description}
                    maxLength={2000}
                    placeholder="What will be done"
                    onChange={(e) => updateStep(step.key, { description: e.target.value })}
                  />
                </FormField>
                <FormField label="Owner" id={`step-${step.key}-owner`}>
                  <PersonSelect
                    id={`step-${step.key}-owner`}
                    value={step.ownerId}
                    onChange={(ownerId) => updateStep(step.key, { ownerId })}
                    emptyLabel="Action owner"
                  />
                </FormField>
                <FormField label="Due date" id={`step-${step.key}-due`}>
                  <Input
                    id={`step-${step.key}-due`}
                    type="date"
                    value={step.dueDate}
                    onChange={(e) => updateStep(step.key, { dueDate: e.target.value })}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSteps((all) => (all.length === 1 ? [emptyStep()] : all.filter((s) => s.key !== step.key)))}
                  aria-label={`Remove step ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {steps.length < MAX_STEPS && (
              <Button type="button" variant="outline" onClick={() => setSteps((all) => [...all, emptyStep()])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add corrective action
              </Button>
            )}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Action owner" id="action-owner" description="Defaults to the area owner.">
              <PersonSelect id="action-owner" value={ownerId} onChange={setOwnerId} emptyLabel="Area owner" />
            </FormField>
            <FormField label="Due date" id="action-due" description="Optional. Without one the action shows Due date not set and is never overdue.">
              <Input id="action-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Link href="/five-s/actions" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Raise action"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function NewActionPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewAction />
    </Suspense>
  );
}
