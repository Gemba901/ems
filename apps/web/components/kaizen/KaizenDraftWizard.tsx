"use client";

import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Compass, Loader2, Save, Send, Trash2 } from "lucide-react";
import { ModuleTour, startTour } from "@/components/onboarding/ModuleTour";
import { KAIZEN_CREATE_TOURS } from "@/components/onboarding/tours";
import { Kaizen, KaizenDraftMissingItem, KaizenIncompleteError, KaizenService } from "@/services/kaizen.service";
import {
  formatDate,
  KAIZEN_TRIGGERS,
  QCDSMT_LABELS,
  SectionNumberingContext,
  UNIT_LABELS,
  WASTE_LABELS,
} from "@/components/kaizen/kaizen-ui";
import { getDraftChecklist, KaizenGating } from "@/components/kaizen/gating";

import ReasonSection from "./sections/01-Reason";
import ReferenceSection from "./sections/02-Reference";
import ConditionSection from "./sections/03-Condition";
import BasicInfoSection from "./sections/04-BasicInfo";
import QcdsmtImpactSection from "./sections/05-QcdsmtImpact";
import WasteSection from "./sections/06-Waste";
import ImplementationPlanSection from "./sections/07-ImplementationPlan";
import { KaizenSectionHandle } from "./sections/types";

const STEPS = [
  { n: 1, label: "Problem", hint: "Why you are starting and what you saw" },
  { n: 2, label: "What will improve", hint: "How you will measure success" },
  { n: 3, label: "Owner & plan", hint: "Who does it, by when, with what" },
  { n: 4, label: "Review & submit", hint: "Check and send to your HOD" },
] as const;

const LAST_STEP = STEPS.length;

function parseStep(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= LAST_STEP ? n : 1;
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-0.5 sm:gap-3 py-2 border-b border-border last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="sm:col-span-2 text-sm text-foreground break-words">
        {value || <span className="text-muted-foreground">Not set</span>}
      </dd>
    </div>
  );
}

export default function KaizenDraftWizard({
  kaizen,
  gating,
  token,
  onSaved,
}: {
  kaizen: Kaizen;
  gating: KaizenGating;
  token: string;
  onSaved: (updated: Kaizen) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const step = parseStep(searchParams.get("step"));

  const [busy, setBusy] = useState<"save" | "nav" | "submit" | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [serverMissing, setServerMissing] = useState<KaizenDraftMissingItem[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const reasonRef = useRef<KaizenSectionHandle>(null);
  const referenceRef = useRef<KaizenSectionHandle>(null);
  const conditionRef = useRef<KaizenSectionHandle>(null);
  const qcdsmtImpactRef = useRef<KaizenSectionHandle>(null);
  const wasteRef = useRef<KaizenSectionHandle>(null);
  const basicInfoRef = useRef<KaizenSectionHandle>(null);
  const implementationPlanRef = useRef<KaizenSectionHandle>(null);

  const stepRefs: Record<number, React.RefObject<KaizenSectionHandle | null>[]> = {
    1: [reasonRef, conditionRef, referenceRef],
    2: [qcdsmtImpactRef, wasteRef],
    3: [basicInfoRef, implementationPlanRef],
    4: [],
  };

  // Only the current step is mounted, so only its sections can have unsaved edits.
  const saveCurrentStep = async (): Promise<boolean> => {
    let allOk = true;
    for (const sectionRef of stepRefs[step]) {
      if (!sectionRef.current) continue;
      if (!(await sectionRef.current.save())) allOk = false;
    }
    return allOk;
  };

  const goTo = async (target: number) => {
    if (target === step || busy) return;
    setNotice(null);
    setBusy("nav");
    try {
      if (!(await saveCurrentStep())) {
        setNotice({ tone: "error", text: "Fix the highlighted problem on this step before moving on." });
        return;
      }
      // The saved kaizen is the source of truth again; drop any stale list from a failed submit.
      setServerMissing(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", String(target));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraft = async () => {
    setNotice(null);
    setBusy("save");
    try {
      const ok = await saveCurrentStep();
      setNotice(
        ok
          ? { tone: "ok", text: "Draft saved. You can come back and finish it any time from My Kaizens." }
          : { tone: "error", text: "Could not save. Fix the highlighted problem and try again." },
      );
    } finally {
      setBusy(null);
    }
  };

  const submit = useMutation({
    mutationFn: () => KaizenService.submitForHodPreReview(kaizen.id, token),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["kaizen-my"] });
      onSaved(updated);
      router.replace(pathname, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: unknown) => {
      if (err instanceof KaizenIncompleteError) {
        setServerMissing(err.missing);
        setNotice({ tone: "error", text: err.message });
      } else {
        setNotice({ tone: "error", text: err instanceof Error ? err.message : "Failed to submit" });
      }
    },
  });

  const handleSubmit = async () => {
    setNotice(null);
    setServerMissing(null);
    setBusy("submit");
    try {
      await submit.mutateAsync();
    } catch {
      // handled by the mutation's onError
    } finally {
      setBusy(null);
    }
  };

  const remove = useMutation({
    mutationFn: () => KaizenService.delete(kaizen.id, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kaizen-my"] });
      queryClient.removeQueries({ queryKey: ["kaizen-detail", kaizen.id] });
      router.push("/kaizen");
    },
    onError: (err: unknown) => {
      setConfirmingDelete(false);
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Failed to delete the draft" });
    },
  });

  const checklist = serverMissing ?? getDraftChecklist(kaizen);
  const missingByStep = (n: number) => checklist.filter((m) => m.step === n).length;
  const disabled = busy !== null || remove.isPending;
  const sectionProps = { kaizen, token, onSaved, access: gating.initialSubmission };
  const triggerLabel = KAIZEN_TRIGGERS.find((t) => t.value === kaizen.trigger)?.label;
  const realWastes = kaizen.wasteImpacts.filter((w) => w.waste !== "NOT_APPLICABLE");

  return (
    <SectionNumberingContext.Provider value={false}>
      <div className="space-y-5">
        {/* Each step has its own short walkthrough, shown the first time the step is opened. */}
        <ModuleTour key={step} tourId={`kaizen-create-step-${step}`} steps={KAIZEN_CREATE_TOURS[step - 1]} />
        <div className="flex justify-end -mb-2">
          <Button variant="ghost"
            type="button"
            onClick={() => startTour(`kaizen-create-step-${step}`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <Compass className="h-3.5 w-3.5" /> Show me how
          </Button>
        </div>
        {/* Step header: each step is clickable so the checklist links and "Back" are never a dead end. */}
        <nav aria-label="Draft steps" data-tour="draft-steps" className="bg-background border border-border rounded-xl shadow-sm p-2">
          <ol className="grid grid-cols-4 gap-1">
            {STEPS.map((s) => {
              const isCurrent = s.n === step;
              const gaps = s.n < LAST_STEP ? missingByStep(s.n) : 0;
              const complete = s.n < LAST_STEP && gaps === 0;
              return (
                <li key={s.n}>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => goTo(s.n)}
                    disabled={disabled}
                    aria-current={isCurrent ? "step" : undefined}
                    className={`h-auto min-h-12 w-full flex flex-col whitespace-normal sm:flex-row items-center sm:items-start gap-1 sm:gap-2 rounded-lg px-1.5 sm:px-3 py-2 text-center sm:text-left transition-colors ${
                      isCurrent ? "bg-accent" : "hover:bg-muted"
                    } disabled:cursor-wait`}
                  >
                    <span
                      className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : complete
                          ? "bg-success-subtle text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {complete && !isCurrent ? <Check className="h-3.5 w-3.5" /> : s.n}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[11px] sm:text-sm font-semibold leading-tight ${isCurrent ? "text-primary" : "text-foreground"}`}>
                        {s.label}
                      </span>
                      <span className="hidden md:block text-xs text-muted-foreground leading-tight mt-0.5">{s.hint}</span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ol>
        </nav>

        {step === 1 && (
          <>
            <div data-tour="kz-reason"><ReasonSection ref={reasonRef} {...sectionProps} /></div>
            <div data-tour="kz-condition"><ConditionSection ref={conditionRef} {...sectionProps} /></div>
            <div data-tour="kz-reference"><ReferenceSection ref={referenceRef} {...sectionProps} /></div>
          </>
        )}
        {step === 2 && (
          <>
            <div data-tour="kz-impact"><QcdsmtImpactSection ref={qcdsmtImpactRef} {...sectionProps} /></div>
            <div data-tour="kz-waste"><WasteSection ref={wasteRef} {...sectionProps} /></div>
          </>
        )}
        {step === 3 && (
          <>
            <div data-tour="kz-basic-info"><BasicInfoSection ref={basicInfoRef} {...sectionProps} /></div>
            <div data-tour="kz-plan"><ImplementationPlanSection ref={implementationPlanRef} {...sectionProps} /></div>
          </>
        )}

        {step === 4 && (
          <>
            <div data-tour="draft-checklist" className="bg-background border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-primary pb-2 mb-4 border-b border-primary/25">Before you submit</h3>
              {checklist.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> Everything needed is filled in. You can submit to your HOD.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">Still needed before your HOD can review it:</p>
                  <ul className="space-y-1.5">
                    {checklist.map((m) => (
                      <li key={m.key}>
                        <Button variant="ghost"
                          type="button"
                          onClick={() => goTo(m.step)}
                          disabled={disabled}
                          className="h-auto justify-start whitespace-normal px-0 py-1 text-sm text-left text-warning hover:text-warning hover:underline"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          {m.label}
                          <span className="text-xs text-muted-foreground no-underline">
                            (step {m.step}: {STEPS[m.step - 1]?.label})
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div data-tour="draft-summary" className="bg-background border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-primary pb-2 mb-2 border-b border-primary/25">Summary</h3>
              <dl>
                <SummaryRow label="Title" value={kaizen.title} />
                <SummaryRow
                  label="Why you started"
                  value={kaizen.trigger === "OTHER" ? `Other: ${kaizen.triggerOther ?? ""}` : triggerLabel}
                />
                <SummaryRow
                  label="What you saw"
                  value={kaizen.conditionDescription && <span className="whitespace-pre-line">{kaizen.conditionDescription}</span>}
                />
                {kaizen.conditionEvidenceUrls.length > 0 && (
                  <SummaryRow label="Photos or files" value={`${kaizen.conditionEvidenceUrls.length} attached`} />
                )}
                {kaizen.referenceValue && <SummaryRow label="Reference" value={kaizen.referenceValue} />}
                <SummaryRow
                  label="What will improve"
                  value={
                    kaizen.qcdsmtImpacts.length > 0 && (
                      <ul className="space-y-1">
                        {kaizen.qcdsmtImpacts.map((i) => {
                          const unit = i.unit === "OTHER" ? i.otherUnitLabel : i.unit === "CURRENCY" ? i.currency : UNIT_LABELS[i.unit];
                          return (
                            <li key={i.category}>
                              <span className="font-medium">{QCDSMT_LABELS[i.category]}:</span> {i.whatIsMeasured}
                              {(i.beforeValue || i.afterValue) && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({i.beforeValue ?? "?"} → {i.afterValue ?? "?"} {unit?.toLowerCase()})
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )
                  }
                />
                {realWastes.length > 0 && (
                  <SummaryRow label="Waste cut" value={realWastes.map((w) => WASTE_LABELS[w.waste]).join(", ")} />
                )}
                <SummaryRow
                  label="Kaizen owner"
                  value={kaizen.kaizenOwner && `${kaizen.kaizenOwner.firstName} ${kaizen.kaizenOwner.lastName}`}
                />
                <SummaryRow
                  label="Team"
                  value={kaizen.teamMembers.length > 0 && kaizen.teamMembers.map((m) => `${m.firstName} ${m.lastName}`).join(", ")}
                />
                <SummaryRow
                  label="Dates"
                  value={
                    kaizen.startDate || kaizen.targetCompletionDate
                      ? `${kaizen.startDate ? formatDate(kaizen.startDate) : "?"} → ${
                          kaizen.targetCompletionDate ? formatDate(kaizen.targetCompletionDate) : "?"
                        }`
                      : null
                  }
                />
                <SummaryRow label="What you need" value={kaizen.requiredMaterials} />
                <SummaryRow
                  label="Estimated cost"
                  value={kaizen.estimatedCost && `${kaizen.estimatedCostCurrency ?? ""} ${kaizen.estimatedCost}`.trim()}
                />
              </dl>
            </div>
          </>
        )}

        {/* Action bar */}
        <div className="bg-background border border-border rounded-xl p-4 sm:p-6 shadow-sm space-y-3">
          {notice && (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={`text-xs rounded-lg px-3 py-2 border ${
                notice.tone === "error" ? "text-danger bg-danger-subtle border-danger/25" : "text-success bg-success-subtle border-success/25"
              }`}
            >
              {notice.text}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            {step > 1 && (
              <Button variant="ghost"
                type="button"
                onClick={() => goTo(step - 1)}
                disabled={disabled}
                className="flex items-center justify-center gap-2 text-muted-foreground hover:bg-muted disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <div className="sm:ml-auto flex flex-col-reverse sm:flex-row gap-3">
              {step < LAST_STEP && (
                <Button variant="ghost"
                  type="button"
                  data-tour="draft-save"
                  onClick={handleSaveDraft}
                  disabled={disabled}
                  className="flex items-center justify-center gap-2 border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save draft
                </Button>
              )}
              {step < LAST_STEP ? (
                <Button variant="default"
                  type="button"
                  data-tour="draft-next"
                  onClick={() => goTo(step + 1)}
                  disabled={disabled}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {busy === "nav" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Next: {STEPS[step].label} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="default"
                  type="button"
                  data-tour="draft-submit"
                  onClick={handleSubmit}
                  disabled={disabled || checklist.length > 0}
                  title={checklist.length > 0 ? "Complete the items above first" : undefined}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for HOD review
                </Button>
              )}
            </div>
          </div>

          {kaizen.status === "DRAFT" && (
            <div className="pt-3 border-t border-border">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground">Delete this draft? This cannot be undone.</span>
                  <Button variant="default"
                    type="button"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                    className="flex items-center gap-1.5 bg-danger hover:bg-danger disabled:opacity-50 text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Yes, delete
                  </Button>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={remove.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Keep it
                  </Button>
                </div>
              ) : (
                <Button variant="ghost"
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={disabled}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-danger transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete draft
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionNumberingContext.Provider>
  );
}
