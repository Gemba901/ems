"use client";

import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Compass, Loader2, Save, Send, Trash2 } from "lucide-react";
import { ModuleTour, startTour } from "@/components/onboarding/ModuleTour";
import { SGA_CREATE_TOURS } from "@/components/onboarding/tours";
import { Sga, SgaDraftMissingItem, SgaIncompleteError, SgaService } from "@/services/sga.service";
import {
  formatDate,
  MEETING_FREQUENCY_LABELS,
  QCDSMT_LABELS,
  SectionNumberingContext,
  STARTING_REASONS,
  UNIT_LABELS,
} from "@/components/sga/sga-ui";
import { getDraftChecklist, SgaGating } from "@/components/sga/gating";

import ReasonSection from "./sections/01-Reason";
import InfoSection from "./sections/02-Info";
import ImpactSection from "./sections/03-Impact";
import TeamSection from "./sections/04-Team";
import MeetingPlanSection from "./sections/05-MeetingPlan";
import ResourcesSection from "./sections/06-Resources";
import { SgaSectionHandle } from "./sections/types";

const STEPS = [
  { n: 1, label: "Problem", hint: "Why you are starting, what is wrong and where" },
  { n: 2, label: "What will improve", hint: "How you will measure success" },
  { n: 3, label: "Team & meetings", hint: "Who is involved and when you meet" },
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

export default function SgaDraftWizard({
  sga,
  gating,
  token,
  onSaved,
}: {
  sga: Sga;
  gating: SgaGating;
  token: string;
  onSaved: (updated: Sga) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const step = parseStep(searchParams.get("step"));

  const [busy, setBusy] = useState<"save" | "nav" | "submit" | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [serverMissing, setServerMissing] = useState<SgaDraftMissingItem[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const reasonRef = useRef<SgaSectionHandle>(null);
  const infoRef = useRef<SgaSectionHandle>(null);
  const impactRef = useRef<SgaSectionHandle>(null);
  const teamRef = useRef<SgaSectionHandle>(null);
  const meetingPlanRef = useRef<SgaSectionHandle>(null);
  const resourcesRef = useRef<SgaSectionHandle>(null);

  const stepRefs: Record<number, React.RefObject<SgaSectionHandle | null>[]> = {
    1: [reasonRef, infoRef],
    2: [impactRef],
    3: [teamRef, meetingPlanRef, resourcesRef],
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
      // The saved SGA is the source of truth again; drop any stale list from a failed submit.
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
          ? { tone: "ok", text: "Draft saved. You can come back and finish it any time from My SGAs." }
          : { tone: "error", text: "Could not save. Fix the highlighted problem and try again." },
      );
    } finally {
      setBusy(null);
    }
  };

  const submit = useMutation({
    mutationFn: () => SgaService.submitForHodApproval(sga.id, token),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["sga-my"] });
      onSaved(updated);
      router.replace(pathname, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: unknown) => {
      if (err instanceof SgaIncompleteError) {
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
    mutationFn: () => SgaService.delete(sga.id, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sga-my"] });
      queryClient.removeQueries({ queryKey: ["sga-detail", sga.id] });
      router.push("/sga");
    },
    onError: (err: unknown) => {
      setConfirmingDelete(false);
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Failed to delete the draft" });
    },
  });

  const checklist = serverMissing ?? getDraftChecklist(sga);
  const missingByStep = (n: number) => checklist.filter((m) => m.step === n).length;
  const disabled = busy !== null || remove.isPending;
  const sectionProps = { sga, token, onSaved };
  const reasonLabel = STARTING_REASONS.find((r) => r.value === sga.startingReason)?.label;

  return (
    <SectionNumberingContext.Provider value={false}>
      <div className="space-y-5">
        {/* Each step has its own short walkthrough, shown the first time the step is opened. */}
        <ModuleTour key={step} tourId={`sga-create-step-${step}`} steps={SGA_CREATE_TOURS[step - 1]} />
        <div className="flex justify-end -mb-2">
          <Button variant="outline"
            type="button"
            onClick={() => startTour(`sga-create-step-${step}`)}
          >
            <Compass className="h-3.5 w-3.5" /> Show me how
          </Button>
        </div>
        {/* Step header — each step is clickable so the checklist links and "Back" are never a dead end. */}
        <nav aria-label="Draft steps" data-tour="draft-steps" className="bg-card border border-border rounded-xl shadow-sm p-2">
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
                    className={`h-auto min-h-12 w-full flex flex-col whitespace-normal sm:flex-row items-center sm:items-start justify-start gap-1 sm:gap-2 rounded-lg px-1.5 sm:px-3 py-2 text-center sm:text-left transition-colors ${
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
            <div data-tour="sga-reason"><ReasonSection ref={reasonRef} {...sectionProps} access={gating.reason} /></div>
            <div data-tour="sga-info"><InfoSection ref={infoRef} {...sectionProps} access={gating.info} /></div>
          </>
        )}
        {step === 2 && (
          <div data-tour="sga-impact"><ImpactSection ref={impactRef} {...sectionProps} access={gating.impact} /></div>
        )}
        {step === 3 && (
          <>
            <div data-tour="sga-team"><TeamSection ref={teamRef} {...sectionProps} access={gating.team} /></div>
            <div data-tour="sga-meetings"><MeetingPlanSection ref={meetingPlanRef} {...sectionProps} access={gating.meetingPlan} /></div>
            <div data-tour="sga-resources"><ResourcesSection ref={resourcesRef} {...sectionProps} access={gating.resources} /></div>
          </>
        )}

        {step === 4 && (
          <>
            <div data-tour="draft-checklist" className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-primary pb-2 mb-4 border-b border-border">Before you submit</h3>
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

            <div data-tour="draft-summary" className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-primary pb-2 mb-2 border-b border-border">Summary</h3>
              <dl>
                <SummaryRow label="Title" value={sga.title} />
                <SummaryRow label="Problem" value={sga.problemDescription && <span className="whitespace-pre-line">{sga.problemDescription}</span>} />
                <SummaryRow
                  label="Kind of problem"
                  value={sga.startingReason === "OTHER" ? `Other: ${sga.startingReasonOther ?? ""}` : reasonLabel}
                />
                <SummaryRow
                  label="Where"
                  value={[sga.mainDepartment?.name, sga.workArea].filter(Boolean).join(" · ")}
                />
                <SummaryRow
                  label="Dates"
                  value={
                    sga.startDate || sga.targetCompletionDate
                      ? `${sga.startDate ? formatDate(sga.startDate) : "?"} → ${sga.targetCompletionDate ? formatDate(sga.targetCompletionDate) : "?"}`
                      : null
                  }
                />
                <SummaryRow
                  label="What will improve"
                  value={
                    sga.qcdsmtImpacts.length > 0 && (
                      <ul className="space-y-1">
                        {sga.qcdsmtImpacts.map((i) => {
                          const unit = i.unit === "OTHER" ? i.otherUnitLabel : i.unit === "CURRENCY" ? i.currency : UNIT_LABELS[i.unit];
                          return (
                            <li key={i.category}>
                              <span className="font-medium">{QCDSMT_LABELS[i.category]}:</span> {i.whatIsMeasured}
                              {(i.baselineValue || i.targetValue) && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({i.baselineValue ?? "?"} → {i.targetValue ?? "?"} {unit?.toLowerCase()})
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )
                  }
                />
                <SummaryRow label="SGA leader" value={sga.owner && `${sga.owner.firstName} ${sga.owner.lastName}`} />
                <SummaryRow
                  label="Team"
                  value={sga.teamMembers.length > 0 && sga.teamMembers.map((m) => `${m.firstName} ${m.lastName}`).join(", ")}
                />
                <SummaryRow
                  label="Meetings"
                  value={
                    sga.meetingFrequency &&
                    (sga.meetingFrequency === "CUSTOM"
                      ? sga.meetingFrequencyCustomText
                      : MEETING_FREQUENCY_LABELS[sga.meetingFrequency])
                  }
                />
                <SummaryRow
                  label="Approximate cost"
                  value={sga.approximateInvestmentAmount && `${sga.approximateInvestmentCurrency ?? ""} ${sga.approximateInvestmentAmount}`.trim()}
                />
              </dl>
            </div>
          </>
        )}

        {/* Action bar */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm space-y-3">
          {notice && (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={`text-xs rounded-lg px-3 py-2 border ${
                notice.tone === "error" ? "text-danger bg-danger-subtle border-danger" : "text-success bg-success-subtle border-success"
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
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <div className="sm:ml-auto flex flex-col-reverse sm:flex-row gap-3">
              {step < LAST_STEP && (
                <Button variant="outline"
                  type="button"
                  data-tour="draft-save"
                  onClick={handleSaveDraft}
                  disabled={disabled}
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
                >
                  {busy === "nav" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Next: {STEPS[step].label} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  data-tour="draft-submit"
                  onClick={handleSubmit}
                  disabled={disabled || checklist.length > 0}
                  title={checklist.length > 0 ? "Complete the items above first" : undefined}
                >
                  {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for HOD approval
                </Button>
              )}
            </div>
          </div>

          {sga.status === "DRAFT" && (
            <div className="pt-3 border-t border-border">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground">Delete this draft? This cannot be undone.</span>
                  <Button variant="destructive"
                    type="button"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Yes, delete
                  </Button>
                  <Button variant="outline"
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={remove.isPending}
                  >
                    Keep it
                  </Button>
                </div>
              ) : (
                <Button variant="ghost"
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={disabled}
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
