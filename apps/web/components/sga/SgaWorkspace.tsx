"use client";

import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, Loader2, Lock, Plus, Save, Send } from "lucide-react";
import { Sga, SgaService } from "@/services/sga.service";
import { MEETING_FREQUENCY_LABELS, SectionNumberingContext, WEEKDAY_LABELS } from "@/components/sga/sga-ui";
import { SgaAccessContext, SgaGating } from "@/components/sga/gating";
import ActionChecklist from "@/components/sga/workspace/ActionChecklist";
import { getCurrentStage, getWorkspaceStages, isActionOverdue, WorkspaceStage, WorkspaceStageKey } from "@/components/sga/workspace/stages";

import ConditionSection from "./sections/08-Condition";
import RootCauseSection from "./sections/09-RootCause";
import MeetingReportsSection from "./sections/10-MeetingReports";
import ActionPlanSection from "./sections/11-ActionPlan";
import ImplementationSection from "./sections/12-Implementation";
import ResultsSection from "./sections/13-Results";
import BenefitsSection from "./sections/14-Benefits";
import VerifyingDepartmentSection from "./sections/15-VerifyingDepartment";
import { SgaSectionHandle } from "./sections/types";

type Tab = "stages" | "meetings" | "actions";
const TABS: Tab[] = ["stages", "meetings", "actions"];

const parseTab = (value: string | null): Tab => (TABS.includes(value as Tab) ? (value as Tab) : "stages");

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

// Wraps one section with its own Save button, so a long-running SGA is updated a
// piece at a time instead of through one page-wide save.
function SaveableSection({
  sectionRef,
  editable,
  children,
}: {
  sectionRef: React.RefObject<SgaSectionHandle | null>;
  editable: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ saving: boolean; savedAt: Date | null; failed: boolean }>({
    saving: false,
    savedAt: null,
    failed: false,
  });

  const save = async () => {
    if (!sectionRef.current) return;
    setState((s) => ({ ...s, saving: true, failed: false }));
    const ok = await sectionRef.current.save();
    setState((s) => ({ saving: false, failed: !ok, savedAt: ok ? new Date() : s.savedAt }));
  };

  return (
    <div>
      {children}
      {editable && (
        <div className="mt-2 flex items-center justify-end gap-3">
          <span aria-live="polite" className="text-xs">
            {state.failed ? (
              <span className="text-danger">Not saved. See the message above.</span>
            ) : state.savedAt ? (
              <span className="text-success">Saved at {timeFormat.format(state.savedAt)}</span>
            ) : null}
          </span>
          <Button variant="ghost"
            type="button"
            disabled={state.saving}
            onClick={save}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            {state.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function StageCard({
  stage,
  isCurrent,
  open,
  onToggle,
  children,
  footer,
}: {
  stage: WorkspaceStage;
  isCurrent: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const bodyId = `sga-stage-${stage.key}`;
  const circle = stage.done
    ? "bg-success text-success-foreground"
    : stage.unlocked
      ? isCurrent
        ? "bg-primary text-primary-foreground"
        : "border-2 border-primary/25 text-primary"
      : "border-2 border-border text-muted-foreground";

  return (
    <section className={`overflow-hidden rounded-xl border bg-background ${open ? "border-primary/25 shadow-sm" : "border-border"}`}>
      <Button variant="ghost"
        type="button"
        disabled={!stage.unlocked}
        onClick={onToggle}
        aria-expanded={stage.unlocked ? open : undefined}
        aria-controls={stage.unlocked ? bodyId : undefined}
        className="flex w-full items-start gap-3 px-4 py-4 text-left enabled:hover:bg-muted disabled:cursor-default sm:px-5"
      >
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${circle}`}>
          {stage.done ? <Check className="h-4 w-4" /> : stage.unlocked ? stage.n : <Lock className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-semibold ${stage.unlocked ? "text-foreground" : "text-muted-foreground"}`}>
              {stage.n}. {stage.label}
            </span>
            {isCurrent && !stage.done && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">Current stage</span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {!stage.unlocked ? stage.unlockHint : open ? stage.hint : stage.summary}
          </span>
        </span>
        {stage.unlocked && (
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </Button>
      {/* Unlocked stages stay mounted while collapsed so unsaved edits survive switching stages. */}
      {stage.unlocked && (
        <div id={bodyId} hidden={!open} className="space-y-5 border-t border-border bg-muted/60 px-3 py-4 sm:px-5">
          {children}
          {footer}
        </div>
      )}
    </section>
  );
}

export default function SgaWorkspace({
  sga,
  gating,
  ctx,
  meId,
  token,
  onSaved,
}: {
  sga: Sga;
  gating: SgaGating;
  ctx: SgaAccessContext;
  meId: string;
  token: string;
  onSaved: (updated: Sga) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const stages = getWorkspaceStages(sga);
  const current = getCurrentStage(stages);
  // null = follow the current stage; set once the user opens or closes a stage themselves.
  const [chosenStage, setChosenStage] = useState<WorkspaceStageKey | "none" | null>(null);
  const openStage = chosenStage ?? current;
  const [meetingFormKey, setMeetingFormKey] = useState(0);
  const [now] = useState(() => Date.now());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const conditionRef = useRef<SgaSectionHandle>(null);
  const rootCauseRef = useRef<SgaSectionHandle>(null);
  const actionPlanRef = useRef<SgaSectionHandle>(null);
  const implementationRef = useRef<SgaSectionHandle>(null);
  const resultsRef = useRef<SgaSectionHandle>(null);
  const benefitsRef = useRef<SgaSectionHandle>(null);
  const verifyingDepartmentRef = useRef<SgaSectionHandle>(null);

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "stages") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const openStageInTab = (key: WorkspaceStageKey) => {
    setChosenStage(key);
    setTab("stages");
    requestAnimationFrame(() => document.getElementById(`sga-stage-${key}`)?.parentElement?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const addMeetingNote = () => {
    setMeetingFormKey((k) => k + 1);
    setTab("meetings");
  };

  const submitForVerification = useMutation({
    mutationFn: async () => {
      if (verifyingDepartmentRef.current && !(await verifyingDepartmentRef.current.save())) {
        throw new Error("Fix the verifying department above before submitting.");
      }
      return SgaService.submitForVerification(sga.id, token);
    },
    onMutate: () => setSubmitError(null),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) => setSubmitError(err instanceof Error ? err.message : "Failed to submit"),
  });

  const stage = (key: WorkspaceStageKey) => stages.find((s) => s.key === key)!;
  const overdueCount = sga.actionItems.filter((a) => isActionOverdue(a, now)).length;
  const actionsDone = sga.actionItems.filter((a) => a.status === "DONE").length;
  const teamStatusOpen = sga.status === "IN_PROGRESS" || sga.status === "RETURNED_FOR_REWORK";
  const isTeam = ctx.isRaiser || ctx.isOwner || ctx.isTeamMember;
  const earlierStagesDone = stages.filter((s) => s.key !== "verify").every((s) => s.done);
  const leader = sga.owner ? `${sga.owner.firstName} ${sga.owner.lastName}` : "the SGA leader";

  const toggle = (key: WorkspaceStageKey) => setChosenStage(openStage === key ? "none" : key);

  const stageFooter = (s: WorkspaceStage) => {
    if (!teamStatusOpen || !isTeam || s.key === "verify") return null;
    const next = stages[stages.findIndex((x) => x.key === s.key) + 1];
    if (!s.done) {
      return s.missing.length ? (
        <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">To finish this stage</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {s.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null;
    }
    return next ? (
      <div className="flex justify-end">
        <Button variant="default"
          type="button"
          onClick={() => openStageInTab(next.key)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Continue to {next.n}. {next.label} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    ) : null;
  };

  const tabLabel: Record<Tab, React.ReactNode> = {
    stages: "Stages",
    meetings: (
      <>
        Meetings <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{sga.meetingReports.length}</span>
      </>
    ),
    actions: (
      <>
        Actions{" "}
        <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] ${overdueCount ? "bg-danger-subtle text-danger" : "bg-muted text-muted-foreground"}`}>
          {actionsDone}/{sga.actionItems.length}
        </span>
      </>
    ),
  };

  const meetingPlan = [
    sga.meetingFrequency === "CUSTOM"
      ? sga.meetingFrequencyCustomText
      : sga.meetingFrequency && MEETING_FREQUENCY_LABELS[sga.meetingFrequency].toLowerCase(),
    sga.meetingDay && `on ${WEEKDAY_LABELS[sga.meetingDay]}`,
    sga.meetingTime && `at ${sga.meetingTime}`,
    sga.meetingLocation && `in ${sga.meetingLocation}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="SGA workspace" className="flex gap-6 overflow-x-auto whitespace-nowrap">
          {TABS.map((t) => (
            <Button variant="ghost"
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`border-b-2 pb-3 text-sm font-semibold transition duration-150 ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabel[t]}
            </Button>
          ))}
        </div>
        {gating.meetingReports.editable && (
          <Button variant="ghost"
            type="button"
            onClick={addMeetingNote}
            className="mb-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Add meeting note
          </Button>
        )}
      </div>

      <div role="tabpanel" hidden={tab !== "stages"} className="space-y-3">
        <StageCard stage={stage("analyse")} isCurrent={current === "analyse"} open={openStage === "analyse"} onToggle={() => toggle("analyse")} footer={stageFooter(stage("analyse"))}>
          <SaveableSection sectionRef={conditionRef} editable={gating.condition.editable}>
            <ConditionSection ref={conditionRef} sga={sga} access={gating.condition} token={token} onSaved={onSaved} />
          </SaveableSection>
          <SaveableSection sectionRef={rootCauseRef} editable={gating.rootCause.editable}>
            <RootCauseSection ref={rootCauseRef} sga={sga} access={gating.rootCause} token={token} onSaved={onSaved} />
          </SaveableSection>
        </StageCard>

        <StageCard stage={stage("implement")} isCurrent={current === "implement"} open={openStage === "implement"} onToggle={() => toggle("implement")} footer={stageFooter(stage("implement"))}>
          <SaveableSection sectionRef={actionPlanRef} editable={gating.actionPlan.editable}>
            <ActionPlanSection ref={actionPlanRef} sga={sga} access={gating.actionPlan} token={token} onSaved={onSaved} />
          </SaveableSection>
          {gating.actionPlan.editable && sga.actionItems.length > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              Tick actions off as they are done in the{" "}
              <Button variant="ghost" type="button" onClick={() => setTab("actions")} className="font-semibold text-primary hover:underline">
                Actions
              </Button>{" "}
              tab.
            </p>
          )}
          {teamStatusOpen && isTeam && !ctx.isOwner && (
            <p className="px-1 text-xs text-muted-foreground">Only {leader}, the SGA leader, can fill in the implementation below.</p>
          )}
          <SaveableSection sectionRef={implementationRef} editable={gating.implementation.editable}>
            <ImplementationSection ref={implementationRef} sga={sga} access={gating.implementation} token={token} onSaved={onSaved} />
          </SaveableSection>
        </StageCard>

        <StageCard stage={stage("check")} isCurrent={current === "check"} open={openStage === "check"} onToggle={() => toggle("check")} footer={stageFooter(stage("check"))}>
          <SaveableSection sectionRef={resultsRef} editable={gating.results.editable}>
            <ResultsSection ref={resultsRef} sga={sga} access={gating.results} token={token} onSaved={onSaved} />
          </SaveableSection>
          <SaveableSection sectionRef={benefitsRef} editable={gating.benefits.editable}>
            <BenefitsSection ref={benefitsRef} sga={sga} access={gating.benefits} token={token} onSaved={onSaved} />
          </SaveableSection>
        </StageCard>

        <StageCard stage={stage("verify")} isCurrent={current === "verify"} open={openStage === "verify"} onToggle={() => toggle("verify")}>
          <SaveableSection sectionRef={verifyingDepartmentRef} editable={gating.verifyingDepartment.editable}>
            <VerifyingDepartmentSection ref={verifyingDepartmentRef} sga={sga} access={gating.verifyingDepartment} token={token} onSaved={onSaved} />
          </SaveableSection>

          {teamStatusOpen && isTeam && (
            <div className="rounded-xl border border-border bg-background px-4 py-4 sm:px-5">
              <p className="text-sm font-semibold text-foreground">Ready to submit?</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {stages
                  .filter((s) => s.key !== "verify")
                  .map((s) => (
                    <li key={s.key} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-success text-success-foreground" : "border-2 border-border"}`}
                      >
                        {s.done && <Check className="h-3 w-3" />}
                      </span>
                      <span className={s.done ? "text-muted-foreground" : "text-foreground"}>
                        {s.n}. {s.label}
                        {!s.done && (
                          <Button variant="ghost" type="button" onClick={() => openStageInTab(s.key)} className="ml-1 text-xs font-semibold text-primary hover:underline">
                            {s.missing[0]}
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
              {submitError && <p className="mt-3 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger">{submitError}</p>}
              {gating.canSubmitForVerification ? (
                <Button
                  type="button"
                  disabled={!earlierStagesDone || submitForVerification.isPending}
                  onClick={() => submitForVerification.mutate()}
                  className="mt-4"
                >
                  {submitForVerification.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for Verification
                </Button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Only {sga.employee.firstName} {sga.employee.lastName} (raiser) or {leader} (SGA leader) can submit for verification.
                </p>
              )}
            </div>
          )}
        </StageCard>
      </div>

      <div role="tabpanel" hidden={tab !== "meetings"} className="space-y-3">
        {meetingPlan && (
          <p className="px-1 text-sm text-muted-foreground">
            The team meets <span className="font-medium text-foreground">{meetingPlan}</span>.
          </p>
        )}
        <SectionNumberingContext.Provider value={false}>
          <MeetingReportsSection
            key={meetingFormKey}
            initialAdding={meetingFormKey > 0}
            sga={sga}
            access={gating.meetingReports}
            token={token}
            onSaved={onSaved}
          />
        </SectionNumberingContext.Provider>
      </div>

      <div role="tabpanel" hidden={tab !== "actions"}>
        <ActionChecklist
          sga={sga}
          meId={meId}
          teamCanEdit={gating.actionPlan.editable}
          statusOpen={teamStatusOpen}
          token={token}
          onSaved={onSaved}
          onPlanActions={() => openStageInTab("implement")}
        />
      </div>
    </div>
  );
}
