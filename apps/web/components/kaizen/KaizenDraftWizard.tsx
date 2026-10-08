"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Save, Send, Trash2 } from "lucide-react";
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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-0.5 sm:gap-3 py-2 border-b border-slate-100 last:border-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="sm:col-span-2 text-sm text-slate-800 break-words">
        {value || <span className="text-slate-400">Not set</span>}
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
        {/* Step header: each step is clickable so the checklist links and "Back" are never a dead end. */}
        <nav aria-label="Draft steps" className="bg-white border border-slate-100 rounded-xl shadow-sm p-2">
          <ol className="grid grid-cols-4 gap-1">
            {STEPS.map((s) => {
              const isCurrent = s.n === step;
              const gaps = s.n < LAST_STEP ? missingByStep(s.n) : 0;
              const complete = s.n < LAST_STEP && gaps === 0;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => goTo(s.n)}
                    disabled={disabled}
                    aria-current={isCurrent ? "step" : undefined}
                    className={`w-full flex flex-col sm:flex-row items-center sm:items-start gap-1 sm:gap-2 rounded-lg px-1.5 sm:px-3 py-2 text-center sm:text-left transition-colors ${
                      isCurrent ? "bg-indigo-50" : "hover:bg-slate-50"
                    } disabled:cursor-wait`}
                  >
                    <span
                      className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent
                          ? "bg-[#52618a] text-white"
                          : complete
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {complete && !isCurrent ? <Check className="h-3.5 w-3.5" /> : s.n}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[11px] sm:text-sm font-semibold leading-tight ${isCurrent ? "text-indigo-700" : "text-slate-700"}`}>
                        {s.label}
                      </span>
                      <span className="hidden md:block text-xs text-slate-400 leading-tight mt-0.5">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {step === 1 && (
          <>
            <ReasonSection ref={reasonRef} {...sectionProps} />
            <ConditionSection ref={conditionRef} {...sectionProps} />
            <ReferenceSection ref={referenceRef} {...sectionProps} />
          </>
        )}
        {step === 2 && (
          <>
            <QcdsmtImpactSection ref={qcdsmtImpactRef} {...sectionProps} />
            <WasteSection ref={wasteRef} {...sectionProps} />
          </>
        )}
        {step === 3 && (
          <>
            <BasicInfoSection ref={basicInfoRef} {...sectionProps} />
            <ImplementationPlanSection ref={implementationPlanRef} {...sectionProps} />
          </>
        )}

        {step === 4 && (
          <>
            <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-indigo-600 pb-2 mb-4 border-b border-indigo-100">Before you submit</h3>
              {checklist.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Everything needed is filled in. You can submit to your HOD.
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-600 mb-3">Still needed before your HOD can review it:</p>
                  <ul className="space-y-1.5">
                    {checklist.map((m) => (
                      <li key={m.key}>
                        <button
                          type="button"
                          onClick={() => goTo(m.step)}
                          disabled={disabled}
                          className="flex items-center gap-2 text-sm text-left text-orange-700 hover:text-orange-800 hover:underline"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          {m.label}
                          <span className="text-xs text-slate-400 no-underline">
                            (step {m.step}: {STEPS[m.step - 1]?.label})
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-indigo-600 pb-2 mb-2 border-b border-indigo-100">Summary</h3>
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
                                <span className="text-slate-500">
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
        <div className="bg-white border border-slate-100 rounded-xl p-4 sm:p-6 shadow-sm space-y-3">
          {notice && (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={`text-xs rounded-lg px-3 py-2 border ${
                notice.tone === "error" ? "text-red-600 bg-red-50 border-red-100" : "text-emerald-700 bg-emerald-50 border-emerald-100"
              }`}
            >
              {notice.text}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => goTo(step - 1)}
                disabled={disabled}
                className="flex items-center justify-center gap-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <div className="sm:ml-auto flex flex-col-reverse sm:flex-row gap-3">
              {step < LAST_STEP && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={disabled}
                  className="flex items-center justify-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save draft
                </button>
              )}
              {step < LAST_STEP ? (
                <button
                  type="button"
                  onClick={() => goTo(step + 1)}
                  disabled={disabled}
                  className="flex items-center justify-center gap-2 bg-[#52618a] hover:bg-[#445174] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {busy === "nav" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Next: {STEPS[step].label} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={disabled || checklist.length > 0}
                  title={checklist.length > 0 ? "Complete the items above first" : undefined}
                  className="flex items-center justify-center gap-2 bg-[#52618a] hover:bg-[#445174] disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for HOD review
                </button>
              )}
            </div>
          </div>

          {kaizen.status === "DRAFT" && (
            <div className="pt-3 border-t border-slate-100">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-700">Delete this draft? This cannot be undone.</span>
                  <button
                    type="button"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                    className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={remove.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={disabled}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete draft
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionNumberingContext.Provider>
  );
}
