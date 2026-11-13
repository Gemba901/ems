"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceLink } from "@/services/leadership-excellence/performance-planning/types";
import {
  programmeItemIssues,
  programmeItemState,
} from "@/services/leadership-excellence/performance-planning/programme";
import { usePlanning } from "./PlanningProvider";
import {
  PlanningProgrammeFrame,
  useProgrammePeriod,
} from "./PlanningProgrammeFrame";
import {
  PlanningProgrammeRegister,
  type ProgrammeRegisterAction,
} from "./PlanningProgrammeRegister";
import {
  PlanningProgrammeFindings,
  type ProgrammeFinding,
  type ProgrammeFindingAction,
} from "./PlanningProgrammeFindings";
import {
  ProgrammeObjectiveEditor,
  ProgrammeDepartmentEditor,
  ProgrammeIndividualEditor,
} from "./PlanningProgrammeEditors";
import { PlanningProgrammeResults } from "./PlanningProgrammeResults";
import {
  PlanningProgrammeActions,
  ProgrammeActionEditor,
  type ProgrammeActionSeed,
} from "./PlanningProgrammeActions";
import { PlanningFindingEditor } from "./PlanningFindingEditor";
import { ReviewFinding } from "./PlanningFindingsWorkspace";
import { reviewedSwotSources } from "./PlanningSources";
import { PlanSettings } from "./PlanningEditors";
import { planningToday } from "./PlanningLinks";
import {
  Button,
  control,
  ErrorList,
  Field,
  Modal,
  responseLabels,
} from "./PlanningUi";

type Stage =
  | "findings"
  | "review"
  | "company"
  | "department"
  | "individual"
  | "results";
type Editor =
  | {
      kind: "objective";
      documentId: string;
      itemId?: string;
      source?: SourceLink;
    }
  | {
      kind: "goal";
      documentId?: string;
      itemId?: string;
      parentObjectiveId?: string;
      parentDocumentId?: string;
    }
  | { kind: "individual"; documentId?: string }
  | { kind: "finding"; documentId: string; initial?: Record<string, unknown> };
type Approval = {
  documentId: string;
  kind: "objective" | "goal" | "individual";
  itemId: string;
  revision?: boolean;
};

export function PlanningProgrammeWorkspace({ stage }: { stage: Stage }) {
  const { data, run, busy } = usePlanning();
  const { cycle } = useProgrammePeriod();
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [review, setReview] = useState<ProgrammeFinding | null>(null);
  const [batch, setBatch] = useState<ProgrammeFinding[] | null>(null);
  const [action, setAction] = useState<ProgrammeActionSeed | null>(null);
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    const openGuide = () => setGuide(true);
    window.addEventListener("planning-programme-guide", openGuide);
    return () =>
      window.removeEventListener("planning-programme-guide", openGuide);
  }, []);
  const [settings, setSettings] = useState("");
  const [returnToApproval, setReturnToApproval] = useState<Approval | null>(
    null,
  );
  const [returnToReview, setReturnToReview] = useState<ProgrammeFinding | null>(
    null,
  );
  const [error, setError] = useState("");
  const document =
    editor && "documentId" in editor
      ? data.documents.find((item) => item.id === editor.documentId)
      : undefined;
  const settingsDocument = data.documents.find((item) => item.id === settings);
  async function ensureCompany(kind: "COMPANY" | "SWOT") {
    const found = data.documents.find(
      (item) => item.cycle === cycle && item.kind === kind,
    );
    if (found) return found.id;
    return run("CREATE_PLAN", { kind, cycle });
  }
  async function createObjective(source?: SourceLink) {
    setError("");
    try {
      const id = await ensureCompany("COMPANY");
      setEditor({ kind: "objective", documentId: id, source });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open the objective draft.",
      );
    }
  }
  async function addFinding() {
    setError("");
    try {
      const id = await ensureCompany("SWOT");
      setEditor({ kind: "finding", documentId: id });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open the finding draft.",
      );
    }
  }
  function registerAction(event: ProgrammeRegisterAction) {
    switch (event.action) {
      case "create-objective":
        void createObjective();
        break;
      case "create-department":
        setEditor({ kind: "goal" });
        break;
      case "create-individual":
        setEditor({ kind: "individual" });
        break;
      case "edit-objective":
        setEditor({
          kind: "objective",
          documentId: event.document.id,
          itemId: event.objective.id,
        });
        break;
      case "review-objective":
        setApproval({
          kind: "objective",
          documentId: event.document.id,
          itemId: event.objective.id,
        });
        break;
      case "revise-objective":
        setApproval({
          kind: "objective",
          documentId: event.document.id,
          itemId: event.objective.id,
          revision: true,
        });
        break;
      case "contribute":
        setEditor({
          kind: "goal",
          parentObjectiveId: event.objective.id,
          parentDocumentId: event.document.id,
        });
        break;
      case "edit-goal":
        setEditor({
          kind: "goal",
          documentId: event.document.id,
          itemId: event.goal.id,
        });
        break;
      case "review-goal":
        setApproval({
          kind: "goal",
          documentId: event.document.id,
          itemId: event.goal.id,
        });
        break;
      case "revise-goal":
        setApproval({
          kind: "goal",
          documentId: event.document.id,
          itemId: event.goal.id,
          revision: true,
        });
        break;
      case "add-action":
        setAction({ document: event.document, goal: event.goal });
        break;
      case "edit-individual":
        setEditor({ kind: "individual", documentId: event.document.id });
        break;
      case "review-individual":
        setApproval({
          kind: "individual",
          documentId: event.document.id,
          itemId: event.document.id,
        });
        break;
      case "revise-individual":
        setApproval({
          kind: "individual",
          documentId: event.document.id,
          itemId: event.document.id,
          revision: true,
        });
        break;
    }
  }
  function findingAction(event: ProgrammeFindingAction) {
    if (event.action === "add") {
      void addFinding();
      return;
    }
    if (event.action === "guide") {
      setGuide(true);
      return;
    }
    if (event.action === "bulk-review") {
      setBatch(event.findings);
      return;
    }
    if (event.action === "objective") {
      router.push(
        `/leadership-excellence/performance-planning/objectives#objective-${event.objectiveId}`,
      );
      return;
    }
    if (event.action === "open") {
      setEditor({
        kind: "finding",
        documentId: event.document.id,
        initial: { ...event.finding },
      });
      return;
    }
    if (event.action === "review") {
      setReview(event);
      return;
    }
    if (event.action === "follow") {
      const source = reviewedSwotSources(data.documents, cycle)
        .filter(
          (item) =>
            item.documentId === event.document.id &&
            item.findingId === event.finding.id,
        )
        .sort((a, b) => b.version - a.version)[0];
      if (!source) {
        setReview(event);
        return;
      }
      const ref = {
        documentId: source.documentId,
        findingId: source.findingId,
        version: source.version,
      };
      if (event.finding.response === "OBJECTIVE") {
        void createObjective(ref);
      } else if (event.finding.response === "ACTION")
        setAction({ sources: [ref] });
      else setReview(event);
    }
  }
  const freshReview =
    review && data.documents.find((item) => item.id === review.document.id);
  return (
    <PlanningProgrammeFrame
      active={stage === "individual" ? "personal" : stage}
    >
      <ErrorList error={error} />
      {(stage === "findings" || stage === "review") && (
        <PlanningProgrammeFindings
          key={`${cycle}/${stage}`}
          cycle={cycle}
          reviewOnly={stage === "review"}
          onAction={findingAction}
        />
      )}
      {(stage === "company" ||
        stage === "department" ||
        stage === "individual") && (
        <PlanningProgrammeRegister
          key={`${cycle}/${stage}`}
          section={stage}
          cycle={cycle}
          onAction={registerAction}
          stateFor={(plan, kind, id) =>
            kind === "individual"
              ? {
                  approved: plan.status === "APPROVED",
                  version: plan.versions.at(-1)?.version || 0,
                  canEdit: plan.permissions.canEdit,
                  canApprove:
                    plan.permissions.canApprove && plan.status !== "APPROVED",
                }
              : programmeItemState(plan, kind, id)
          }
        >
          {stage === "department" && (
            <PlanningProgrammeActions cycle={cycle} onAdd={setAction} />
          )}
        </PlanningProgrammeRegister>
      )}
      {stage === "results" && (
        <PlanningProgrammeResults
          cycle={cycle}
          onNewFinding={() =>
            router.push(
              "/leadership-excellence/performance-planning/swot-findings",
            )
          }
        />
      )}
      {editor?.kind === "objective" && document && (
        <ProgrammeObjectiveEditor
          key={`${document.id}/${editor.itemId || "new"}`}
          document={document}
          initial={document.data.objectives.find(
            (item) => item.id === editor.itemId,
          )}
          source={editor.source}
          readOnly={
            !!editor.itemId &&
            programmeItemState(document, "objective", editor.itemId).approved
          }
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.push(
              "/leadership-excellence/performance-planning/objectives",
            );
          }}
        />
      )}
      {editor?.kind === "goal" && (
        <ProgrammeDepartmentEditor
          key={`${editor.documentId || "new"}/${editor.itemId || "new"}`}
          cycle={cycle}
          document={document}
          initial={document?.data.goals.find(
            (item) => item.id === editor.itemId,
          )}
          parentObjectiveId={editor.parentObjectiveId}
          parentDocumentId={editor.parentDocumentId}
          readOnly={
            !!document &&
            !!editor.itemId &&
            programmeItemState(document, "goal", editor.itemId).approved
          }
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.push(
              "/leadership-excellence/performance-planning/department-plans",
            );
          }}
        />
      )}
      {editor?.kind === "individual" && (
        <ProgrammeIndividualEditor
          cycle={cycle}
          document={document}
          readOnly={document?.status === "APPROVED"}
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}
      {editor?.kind === "finding" && document && (
        <PlanningFindingEditor
          document={document}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}
      {review && freshReview && (
        <ReviewFinding
          document={freshReview}
          finding={
            freshReview.data.findings.find(
              (item) => item.id === review.finding.id,
            ) || review.finding
          }
          onClose={() => setReview(null)}
          onSettings={() => {
            setReturnToReview(review);
            setReview(null);
            setSettings(freshReview.id);
          }}
          onNextAction={() => {
            const finding =
              freshReview.data.findings.find(
                (item) => item.id === review.finding.id,
              ) || review.finding;
            setReview(null);
            findingAction({ action: "follow", document: freshReview, finding });
          }}
          onEdit={() => {
            setEditor({
              kind: "finding",
              documentId: freshReview.id,
              initial: { ...review.finding },
            });
            setReview(null);
          }}
        />
      )}
      {batch && (
        <ProgrammeBatchReview findings={batch} onClose={() => setBatch(null)} />
      )}
      {action && (
        <ProgrammeActionEditor
          cycle={cycle}
          seed={action}
          onClose={() => setAction(null)}
        />
      )}
      {approval && (
        <ProgrammeApproval
          event={approval}
          onClose={() => setApproval(null)}
          onSettings={(id) => {
            setReturnToApproval(approval);
            setApproval(null);
            setSettings(id);
          }}
          onRevised={() => {
            const current = approval;
            setApproval(null);
            setEditor(
              current.kind === "individual"
                ? { kind: "individual", documentId: current.documentId }
                : {
                    kind: current.kind,
                    documentId: current.documentId,
                    itemId: current.itemId,
                  },
            );
          }}
        />
      )}
      {settingsDocument && (
        <PlanSettings
          document={settingsDocument}
          onClose={() => {
            setSettings("");
            setApproval(returnToApproval);
            setReturnToApproval(null);
            setReview(returnToReview);
            setReturnToReview(null);
          }}
        />
      )}
      {guide && (
        <Modal
          title="Follow the complete flow"
          onClose={() => setGuide(false)}
          footer={
            <Button variant="outline" onClick={() => setGuide(false)}>
              Close
            </Button>
          }
        >
          <ol className="list-decimal space-y-4 pl-5 text-sm">
            {[
              "Record one condition per SWOT finding, with evidence, impact and a primary pillar.",
              "Review the information, request missing evidence or choose a management response. A high priority does not automatically become an objective.",
              "Create a measurable company objective from reviewed findings. Enter its own measurement, baseline, target, timing, owner, priority and weightage. Approve it once ready.",
              "Create department goals directly under an approved company objective. Each goal has its own KPI, baseline, target, unit, owner and deadline. One company objective can have several goals across departments. A reviewed finding can also go straight to a department action.",
              "Create an individual plan and link each person's goal to the relevant approved department goal. Authorised direct company-objective links remain available when needed.",
              "Record actual results, have another authorised reviewer verify them, then review progress and decide what to sustain or change.",
            ].map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ol>
        </Modal>
      )}
    </PlanningProgrammeFrame>
  );
}

function ProgrammeApproval({
  event,
  onClose,
  onSettings,
  onRevised,
}: {
  event: Approval;
  onClose: () => void;
  onSettings: (id: string) => void;
  onRevised: () => void;
}) {
  const { data, run, busy } = usePlanning();
  const [revision] = useState(data.revision);
  const plan = data.documents.find((item) => item.id === event.documentId);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() =>
    planningToday(data.references.timeZone),
  );
  const [error, setError] = useState("");
  if (!plan) return null;
  const item =
    event.kind === "objective"
      ? plan.data.objectives.find((item) => item.id === event.itemId)
      : event.kind === "goal"
        ? plan.data.goals.find((item) => item.id === event.itemId)
        : undefined;
  const issues =
    event.kind === "individual"
      ? plan.issues
      : programmeItemIssues(plan, event.itemId);
  const approver = data.references.people.find(
    (person) => person.id === plan.data.approverId,
  );
  async function submit() {
    if (!plan) return;
    setError("");
    try {
      if (event.revision) {
        await run(
          event.kind === "individual" ? "REVISE" : "REVISE_ITEM",
          { kind: event.kind, id: event.itemId, reason, effectiveDate },
          plan.id,
          revision,
        );
        onRevised();
      } else {
        if (!checked) {
          setError(
            "Confirm that you checked the evidence and measurable commitment.",
          );
          return;
        }
        await run(
          event.kind === "individual" ? "APPROVE" : "APPROVE_ITEM",
          {
            kind: event.kind,
            id: event.itemId,
            evidenceChecked: true,
            effectiveDate,
          },
          plan.id,
          revision,
        );
        onClose();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete this review.",
      );
    }
  }
  return (
    <Modal
      title={
        event.revision
          ? "Create a dated revision"
          : event.kind === "individual"
            ? "Review individual plan"
            : "Review & approve"
      }
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !plan.permissions.canApprove ||
              (!event.revision && (!checked || issues.length > 0))
            }
            onClick={() => void submit()}
          >
            {event.revision ? "Open revision" : "Confirm approval"}
          </Button>
        </>
      }
    >
      <ErrorList error={error} />
      <h3>{item?.title || plan.data.title}</h3>
      <p className="mt-2 text-xs text-slate-500">
        Single authorised approver: {approver?.name || "Not assigned"}
      </p>
      {plan.permissions.canConfigure && (
        <Button
          variant="ghost"
          className="my-2"
          onClick={() => onSettings(plan.id)}
        >
          Change approver / period settings
        </Button>
      )}
      {event.revision ? (
        <div className="mt-5 space-y-4">
          <p className="programme-callout">
            The previous approved version stays available. A changed commitment
            must be reviewed and approved again.
          </p>
          <Field label="Reason for change">
            <textarea
              className={control}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Field label="Effective date">
            <input
              type="date"
              className={control}
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </Field>
        </div>
      ) : (
        <>
          <div
            className={`programme-callout my-5 ${issues.length ? "amber" : "green"}`}
          >
            {issues.length ? (
              <>
                <strong>Complete these checks before approval</strong>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </>
            ) : (
              "The saved commitment is ready for your review. Approval locks its measurement and preserves this version."
            )}
          </div>
          {item && (
            <dl className="mb-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Measure", item.measure],
                [
                  "Baseline",
                  item.baseline == null
                    ? "Not recorded"
                    : String(item.baseline),
                ],
                [
                  "Target",
                  item.target == null
                    ? "Not set"
                    : `${item.target} ${item.unit}`,
                ],
                ["Deadline", item.endDate],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 text-sm">{value || "Not set"}</dd>
                </div>
              ))}
            </dl>
          )}
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            I checked the evidence, measurement rule, baseline, target, owner,
            timing and feasibility.
          </label>
          {!plan.permissions.canApprove && (
            <p className="mt-4 text-sm text-slate-500">
              {approver?.name || "The designated approver"} must approve this
              commitment.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function ProgrammeBatchReview({
  findings,
  onClose,
}: {
  findings: ProgrammeFinding[];
  onClose: () => void;
}) {
  const { run, busy, data } = usePlanning();
  const [revision] = useState(data.revision);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!checked) {
      setError("Confirm the checks for every selected finding.");
      return;
    }
    const documentId = findings[0]?.document.id;
    if (!documentId || findings.some((row) => row.document.id !== documentId)) {
      setError("Review findings from one assessment at a time.");
      return;
    }
    setError("");
    try {
      await run(
        "REVIEW_FINDINGS",
        {
          ids: findings.map((row) => row.finding.id),
          status: "REVIEWED",
          evidenceChecked: true,
        },
        documentId,
        revision,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not review the selected findings.",
      );
    }
  }
  return (
    <Modal
      title="Review the selected findings"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !checked} onClick={() => void save()}>
            Mark selected reviewed
          </Button>
        </>
      }
    >
      <ErrorList error={error} />
      <p className="programme-callout">
        Confirm each finding and its own proposed decision. Bulk review does not
        change decisions or approve company objectives.
      </p>
      <div className="my-5 space-y-4">
        {findings.map(({ finding }) => (
          <article key={finding.id} className="programme-card">
            <h3>
              {finding.code} &middot; {finding.title}
            </h3>
            <p className="mt-3 text-xs text-slate-500">{finding.explanation}</p>
            <p className="mt-2 text-xs">
              Source: {finding.evidence || "Not added"}
            </p>
            <p className="mt-2 text-xs">
              Impact: {finding.impact || "Not added"}
            </p>
            <p className="mt-2 text-xs">
              Priority: {finding.weightage ?? "Not set"}/10 &middot; Decision:{" "}
              {responseLabels[finding.response] || "Not decided"}
            </p>
            <p className="mt-2 text-xs">
              Reason: {finding.decisionNote || "Missing"}
            </p>
          </article>
        ))}
      </div>
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        I checked the source, scope, period, impact and proposed response of
        every selected finding.
      </label>
    </Modal>
  );
}
