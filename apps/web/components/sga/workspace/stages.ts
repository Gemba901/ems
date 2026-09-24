import { Sga } from "@/services/sga.service";
import { IMPLEMENTATION_STATUS_LABELS, ROOT_CAUSE_TOOL_LABELS } from "@/components/sga/sga-ui";

// Once the HOD approves, an SGA runs for weeks. The workspace opens one stage at a
// time; a stage unlocks when the one before it has its minimum content, or as soon
// as it already holds data (so nothing the team entered is ever hidden).

export type WorkspaceStageKey = "analyse" | "implement" | "check" | "verify";

export interface WorkspaceStage {
  key: WorkspaceStageKey;
  n: number;
  label: string;
  hint: string;
  done: boolean;
  unlocked: boolean;
  summary: string;
  // What is still missing before the next stage opens.
  missing: string[];
  unlockHint: string;
}

const hasText = (value: string | null | undefined) => !!value?.trim();

export function hasRootCause(sga: Sga) {
  return sga.rootCauseTools.length > 0 || sga.fishboneCauses.length > 0 || sga.whyWhyChains.length > 0;
}

export function isActionOverdue(item: Sga["actionItems"][number], now: number) {
  if (item.status === "DONE" || !item.dueDate) return false;
  // Due dates are whole days: an action due today is not overdue until tomorrow.
  return new Date(item.dueDate.slice(0, 10) + "T23:59:59").getTime() < now;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function getWorkspaceStages(sga: Sga): WorkspaceStage[] {
  const withResult = sga.measures.filter((m) => hasText(m.finalResultValue)).length;
  const actionsDone = sga.actionItems.filter((a) => a.status === "DONE").length;
  const submitted = sga.status === "PENDING_VERIFICATION" || sga.status === "VERIFIED_CLOSED";
  const leader = sga.owner ? `${sga.owner.firstName} ${sga.owner.lastName}` : "the SGA leader";

  const analyseMissing = [
    ...(sga.measures.length ? [] : ["Add at least one baseline measure"]),
    ...(hasRootCause(sga) ? [] : ["Record the root cause analysis"]),
  ];
  const implementMissing = [
    ...(sga.actionItems.length ? [] : ["Add at least one action"]),
    ...(hasText(sga.implementationSummary) ? [] : [`${leader} writes the implementation summary`]),
  ];
  const checkMissing = withResult ? [] : ["Enter the final result for at least one measure"];

  const rootCauseTools = sga.rootCauseTools.map((t) => ROOT_CAUSE_TOOL_LABELS[t]).join(", ");

  const stages: Omit<WorkspaceStage, "unlocked">[] = [
    {
      key: "analyse",
      n: 3,
      label: "Understand & Analyse",
      hint: "Measure how things are today and find the root cause.",
      done: analyseMissing.length === 0,
      missing: analyseMissing,
      summary: [
        plural(sga.measures.length, "baseline measure"),
        hasRootCause(sga) ? `root cause via ${rootCauseTools || "analysis"}` : "no root cause yet",
      ].join(" · "),
      unlockHint: "",
    },
    {
      key: "implement",
      n: 4,
      label: "Plan & Implement",
      hint: "Agree the actions, who does them and by when, then carry them out.",
      done: implementMissing.length === 0,
      missing: implementMissing,
      summary: [
        sga.actionItems.length ? `${plural(sga.actionItems.length, "action")} (${actionsDone} done)` : "no actions yet",
        `implementation ${IMPLEMENTATION_STATUS_LABELS[sga.implementationStatus].toLowerCase()}`,
      ].join(" · "),
      unlockHint: "Opens once stage 3 has a baseline measure and a root cause.",
    },
    {
      key: "check",
      n: 5,
      label: "Check Results",
      hint: "Compare the results with the baseline and record the benefits.",
      done: checkMissing.length === 0,
      missing: checkMissing,
      summary: [
        `${withResult} of ${plural(sga.measures.length, "measure")} with a final result`,
        plural(sga.qcdsmtBenefits.length, "benefit"),
      ].join(" · "),
      unlockHint: "Opens once stage 4 has an action and the implementation summary.",
    },
    {
      key: "verify",
      n: 6,
      label: "Verify & Close",
      hint: "Choose who confirms the results, then submit for verification.",
      done: submitted,
      missing: [],
      summary: sga.verifyingDepartment ? `Verified with ${sga.verifyingDepartment.name}` : "No affected department",
      unlockHint: "Opens once stage 5 has at least one final result.",
    },
  ];

  const hasData: Record<WorkspaceStageKey, boolean> = {
    analyse: true,
    implement: sga.actionItems.length > 0 || hasText(sga.implementationSummary),
    check: withResult > 0 || sga.qcdsmtBenefits.length > 0 || hasText(sga.lessonsLearned),
    verify: !!sga.verifyingDepartmentId || submitted,
  };

  return stages.map((stage, i) => ({
    ...stage,
    unlocked: hasData[stage.key] || stages.slice(0, i).every((s) => s.done),
  }));
}

// The stage the team should be working on: the first unlocked one that is not done.
export function getCurrentStage(stages: WorkspaceStage[]): WorkspaceStageKey {
  return (stages.find((s) => s.unlocked && !s.done) ?? stages[stages.length - 1]).key;
}
