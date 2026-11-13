"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Settings2, LockKeyhole, ArrowRight } from "lucide-react";
import type {
  Finding,
  PlanningView,
  SourceLink,
} from "@/services/leadership-excellence/performance-planning.service";
import { compareFindingWeightage } from "@/services/leadership-excellence/performance-planning/finding-weightage";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import { businessAlignmentLabels } from "@/services/leadership-excellence/performance-planning/business-alignment";
import {
  linkedFindingObjectives,
  type FindingObjectiveLink,
} from "@/services/leadership-excellence/performance-planning/finding-objectives";
import { usePlanning } from "./PlanningProvider";
import {
  Button,
  card,
  control,
  Field,
  Modal,
  Empty,
  ErrorList,
  categories,
  responseLabels,
} from "./PlanningUi";
import { PlanningFlowNav } from "./PlanningFlowNav";
import { PlanningYearPicker } from "./PlanningYearPicker";
import { ItemEditor, PlanSettings } from "./PlanningEditors";
import { FindingWeightage } from "./FindingWeightage";
import { PlanningEvidence } from "./PlanningEvidence";
import { findingReviewStatus, reviewedSwotSources } from "./PlanningSources";
import { ApprovalActions, History } from "./PlanningWorkspace";
import { LinkFindingAction } from "./PlanningLinks";

type Plan = PlanningView["documents"][number];
const reviewNames = {
  UNDER_REVIEW: "Under review",
  NEEDS_EVIDENCE: "Needs evidence",
  REVIEWED: "Reviewed",
};
function mainAlignment(finding: Finding) {
  return businessAlignmentLabels(finding).join(", ") || "Not selected";
}

export function ReviewFinding({
  document,
  finding,
  onClose,
  onEdit,
  onNextAction,
  onSettings,
}: {
  document: Plan;
  finding: Finding;
  onClose: () => void;
  onEdit: () => void;
  onNextAction?: () => void;
  onSettings?: () => void;
}) {
  const { data, run, busy } = usePlanning();
  const [response, setResponse] = useState(finding.response);
  const [note, setNote] = useState(finding.decisionNote);
  const [owner, setOwner] = useState(finding.followupOwnerId);
  const [date, setDate] = useState(finding.reviewDate);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [reopen, setReopen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [revision] = useState(data.revision);
  const reviewed = findingReviewStatus(finding, document) === "REVIEWED";
  const decisionEditable =
    !reviewed &&
    (document.permissions.canEdit || document.permissions.canApprove);
  const reviews = (document.findingReviews || [])
    .filter((entry) => entry.finding.id === finding.id)
    .sort((a, b) => b.version - a.version);
  async function reopenFinding() {
    if (
      busy ||
      !reason.trim() ||
      !document.permissions.canApprove ||
      !document.permissions.canEdit
    )
      return;
    try {
      await run(
        "REOPEN_FINDING",
        { id: finding.id, reason },
        document.id,
        revision,
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reopen.");
    }
  }
  async function decide(
    status: "REVIEWED" | "NEEDS_EVIDENCE" | "UNDER_REVIEW",
  ) {
    if (status === "REVIEWED" && !checked) {
      setError(
        "Confirm that you checked the evidence, period, scope, business impact and proposed score.",
      );
      return;
    }
    try {
      await run(
        "REVIEW_FINDING",
        {
          id: finding.id,
          status,
          response,
          decisionNote: note,
          followupOwnerId: owner,
          reviewDate: date,
          ...(status === "REVIEWED" ? { evidenceChecked: true } : {}),
        },
        document.id,
        revision,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this review.",
      );
    }
  }
  return (
    <Modal
      title={
        reviewed ? "Reviewed finding" : "Review finding & choose the response"
      }
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-sm space-y-1">
            <p className="text-xs leading-5 text-slate-500">
              {reviewed
                ? "Reviewed information is locked."
                : document.permissions.canApprove
                  ? "One authorised reviewer · No approval chain."
                  : "The designated approver completes this review."}
            </p>
            {onSettings && document.permissions.canConfigure && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto min-h-0 p-0"
                disabled={busy}
                onClick={onSettings}
              >
                Change reviewer / access
              </Button>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {reviewed ? (
              <>
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
                {document.permissions.canApprove &&
                  document.permissions.canEdit &&
                  (reopen ? (
                    <Button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => void reopenFinding()}
                    >
                      Reopen finding
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setReopen(true)}
                    >
                      Reopen with reason
                    </Button>
                  ))}
                {!reopen && onNextAction && (
                  <Button type="button" disabled={busy} onClick={onNextAction}>
                    Next action <ArrowRight size={15} />
                  </Button>
                )}
              </>
            ) : (
              <>
                {document.permissions.canEdit && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void decide("UNDER_REVIEW")}
                    >
                      Save proposed decision
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void decide("NEEDS_EVIDENCE")}
                    >
                      Needs evidence
                    </Button>
                  </>
                )}
                {document.permissions.canApprove ? (
                  <Button
                    type="button"
                    disabled={busy || !checked}
                    onClick={() => void decide("REVIEWED")}
                  >
                    Mark reviewed
                  </Button>
                ) : (
                  !document.permissions.canEdit && (
                    <Button type="button" variant="outline" onClick={onClose}>
                      Close
                    </Button>
                  )
                )}
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <ErrorList error={error} />
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section
            className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
            aria-label="Finding evidence"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="rounded-md bg-white px-2 py-1 text-xs text-slate-500">
                  {finding.code} · {finding.pillar} ·{" "}
                  {categories[finding.category].singular}
                </p>
                <FindingWeightage weightage={finding.weightage} />
              </div>
              <h3 className="mt-3 whitespace-pre-wrap break-words text-base font-semibold">
                {finding.title}
              </h3>
            </div>
            <div className="space-y-4">
              {[
                ["Supporting data", finding.explanation],
                ["Reference / source / period", finding.evidence],
                ["Business impact", finding.impact],
                ["QCDSMT / business focus", mainAlignment(finding)],
                ...(finding.sourceUrl
                  ? [["Supporting link", finding.sourceUrl]]
                  : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {value || "Not added yet"}
                  </p>
                </div>
              ))}
            </div>
            <PlanningEvidence
              document={document}
              findingId={finding.id}
              editable={false}
            />
            {!reviewed && document.permissions.canEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onEdit}
                disabled={busy}
              >
                Edit finding
              </Button>
            )}
          </section>
          <div className="min-w-0 space-y-4">
            {reviewed ? (
              <>
                <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Reviewed{reviews[0] ? ` · v${reviews[0].version}` : ""}
                </span>
                <p className="text-sm">
                  <strong>{responseLabels[finding.response]}</strong> ·{" "}
                  {finding.decisionNote || "No decision note"}
                </p>
                <p className="text-sm text-slate-500">
                  Response owner:{" "}
                  {data.references.people.find(
                    (person) => person.id === finding.followupOwnerId,
                  )?.name || "Not assigned"}
                  {" · "}Next review: {finding.reviewDate || "Not set"}
                </p>
                <p className="text-xs text-slate-500">
                  Reviewed by{" "}
                  {data.references.people.find(
                    (person) => person.userId === finding.reviewedBy,
                  )?.name ||
                    (data.actor.userId === finding.reviewedBy
                      ? data.actor.name
                      : "Authorised reviewer")}
                  {" · "}
                  {finding.reviewedAt
                    ? new Date(finding.reviewedAt).toLocaleDateString("en-GB")
                    : "Review date retained in history"}
                </p>
                <p className="text-xs text-slate-500">
                  Reviewed details are locked. Existing objective links keep
                  their reviewed version.
                </p>
                <details className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Reviewed version history ({reviews.length})
                  </summary>
                  <div className="mt-3 space-y-3">
                    {reviews.map((entry) => (
                      <details
                        key={entry.version}
                        className="rounded-lg bg-slate-50 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-medium text-slate-700">
                          Reviewed v{entry.version} ·{" "}
                          {new Date(entry.reviewedAt).toLocaleDateString(
                            "en-GB",
                          )}
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium">
                          {entry.finding.title}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                          {entry.finding.explanation}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                          Source: {entry.finding.evidence || "Not supplied"}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-600">
                          Decision: {responseLabels[entry.finding.response]} ·{" "}
                          {entry.finding.decisionNote}
                        </p>
                      </details>
                    ))}
                    {!reviews.length && (
                      <p className="text-xs text-slate-500">
                        Earlier reviews are retained in assessment history.
                      </p>
                    )}
                  </div>
                </details>
                {document.permissions.canApprove &&
                  document.permissions.canEdit &&
                  reopen && (
                    <Field
                      label="Reason for revisiting the finding"
                      hint="Previous reviewed versions stay in history."
                    >
                      <textarea
                        className={control}
                        value={reason}
                        disabled={busy}
                        rows={3}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                  )}
              </>
            ) : (
              <fieldset
                disabled={busy || !decisionEditable}
                className="min-w-0 space-y-4"
              >
                <Field label="Management decision">
                  <select
                    className={control}
                    value={response}
                    onChange={(e) =>
                      setResponse(e.target.value as Finding["response"])
                    }
                  >
                    {Object.entries(responseLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Why is this the right response?">
                  <textarea
                    className={control}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <Field label="Response owner">
                  <select
                    className={control}
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">Select when follow-up is needed</option>
                    {data.references.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.position}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Next review / response date">
                  <input
                    className={control}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <p className="text-xs leading-5 text-slate-500">
                  Owner and date keep Maintain, Use for opportunity, Verify,
                  Monitor and Defer responses accountable. Department actions
                  get their own owner and due date.
                </p>
                {document.permissions.canApprove && (
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-indigo-600"
                      checked={checked}
                      onChange={(event) => setChecked(event.target.checked)}
                    />
                    <span>
                      I checked the evidence, period, scope, business impact and
                      proposed score.
                    </span>
                  </label>
                )}
                {!document.permissions.canApprove && (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    The assessment’s designated approver marks findings
                    reviewed.{" "}
                    {onSettings && document.permissions.canConfigure
                      ? "Use Change reviewer / access below to assign an authorised reviewer."
                      : "Ask a planning administrator if no reviewer is assigned."}
                  </p>
                )}
              </fieldset>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function PlanningFindingsWorkspace({
  reviewOnly = false,
}: {
  reviewOnly?: boolean;
}) {
  const { data, busy, run, planningCycle, setPlanningCycle, setPlanFocus } =
    usePlanning();
  const router = useRouter();
  const cycle =
    planningCycle ||
    data.documents.at(-1)?.cycle ||
    String(new Date().getFullYear());
  const years = [
    ...new Set([
      cycle,
      String(new Date().getFullYear()),
      ...data.documents.map((p) => p.cycle),
    ]),
  ]
    .sort()
    .reverse();
  const document = data.documents.find(
    (plan) => plan.kind === "SWOT" && plan.cycle === cycle,
  );
  const [pillar, setPillar] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [reviewId, setReviewId] = useState("");
  const [actionSources, setActionSources] = useState<SourceLink[] | null>(null);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const [pendingObjective, setPendingObjective] = useState<{
    id: string;
    source: SourceLink;
    pillar: Finding["pillar"];
  } | null>(null);
  const canCreate = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(
    data.actor.role,
  );
  const canRead = !!document || canCreate;
  const findings = (document?.data.findings || [])
    .filter(
      (finding) =>
        (!reviewOnly ||
          findingReviewStatus(finding, document!) !== "REVIEWED") &&
        (!pillar ||
          finding.pillar === pillar ||
          finding.relatedPillars.includes(pillar as Finding["pillar"])) &&
        (!category || finding.category === category) &&
        (!search ||
          `${finding.code} ${finding.title} ${finding.explanation}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort(compareFindingWeightage);
  const pending =
    document?.data.findings.filter(
      (finding) => findingReviewStatus(finding, document) !== "REVIEWED",
    ).length || 0;
  const reviewedSources = reviewedSwotSources(data.documents, cycle);
  const finding = document?.data.findings.find((item) => item.id === reviewId);
  const objectivePlan =
    pendingObjective &&
    data.documents.find((plan) => plan.id === pendingObjective.id);
  function objectiveLinks(item: Finding) {
    return document
      ? linkedFindingObjectives(data.documents, cycle, {
          documentId: document.id,
          findingId: item.id,
        })
      : [];
  }
  function openObjective(link: FindingObjectiveLink) {
    setPlanFocus(link.documentId);
    router.push(
      `/leadership-excellence/performance-planning/objectives#objective-${link.objective.id}`,
    );
  }
  function nextAction(item: Finding) {
    if (item.response === "OBJECTIVE") {
      void useFinding(item);
      return;
    }
    if (item.response === "ACTION") {
      const source = reviewedSources
        .filter(
          (entry) =>
            entry.documentId === document?.id && entry.findingId === item.id,
        )
        .sort((a, b) => b.version - a.version)[0];
      if (source)
        setActionSources([
          {
            documentId: source.documentId,
            findingId: source.findingId,
            version: source.version,
          },
        ]);
      else
        setError(
          "This action needs a reviewed finding. Open its review first.",
        );
      return;
    }
    setReviewId(item.id);
  }
  async function createAssessment() {
    try {
      await run("CREATE_PLAN", {
        kind: "SWOT",
        cycle,
        title: `SWOT assessment · ${planningPeriodLabel(cycle)}`,
      });
      setSettings(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start the assessment.",
      );
    }
  }
  async function useFinding(item: Finding) {
    if (!document) return;
    const source = reviewedSources
      .filter(
        (entry) =>
          entry.documentId === document.id && entry.findingId === item.id,
      )
      .sort((a, b) => b.version - a.version)[0];
    if (!source) return;
    try {
      const company = data.documents.find(
        (plan) => plan.kind === "COMPANY" && plan.cycle === cycle,
      );
      if (company && !company.permissions.canEdit) {
        setPlanFocus(company!.id);
        router.push("/leadership-excellence/performance-planning/objectives");
        return;
      }
      const id =
        company?.id ||
        (await run("CREATE_PLAN", {
          kind: "COMPANY",
          cycle,
          title: `Company plan · ${planningPeriodLabel(cycle)}`,
        }));
      setPendingObjective({
        id,
        source: {
          documentId: source.documentId,
          findingId: source.findingId,
          version: source.version,
        },
        pillar: item.pillar,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open the objective.",
      );
    }
  }
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Performance planning
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Understand the finding. Agree the response. Plan measurable
            contributions.
          </p>
        </div>
        <PlanningYearPicker
          value={cycle}
          years={years}
          onChange={(year) => {
            setPlanningCycle(year);
            setEdit(null);
            setReviewId("");
            setActionSources(null);
          }}
        />
      </header>
      <PlanningFlowNav active={reviewOnly ? "review" : "findings"} />
      <ErrorList error={error} />
      {!canRead ? (
        <Empty title="Confidential management assessment">
          Only authorised management and invited contributors can access SWOT
          findings. Approved objectives are available in Company objectives.
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {reviewOnly ? "Review & decide" : "SWOT findings"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {reviewOnly
                  ? "Only findings under review or needing evidence appear here."
                  : "Each finding has its own block, evidence and management response."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {document?.permissions.canConfigure && (
                <Button variant="outline" onClick={() => setSettings(true)}>
                  <Settings2 size={15} /> Plan settings
                </Button>
              )}
              {document?.permissions.canEdit && (
                <Button
                  onClick={() =>
                    setEdit({
                      pillar: pillar || "OPX",
                      category: category || "W",
                    })
                  }
                >
                  <Plus size={16} /> Add findings
                </Button>
              )}
            </div>
          </div>
          {!document ? (
            <Empty
              title="Start this period’s SWOT assessment"
              action={
                canCreate ? (
                  <Button
                    disabled={busy}
                    onClick={() => void createAssessment()}
                  >
                    Create assessment
                  </Button>
                ) : undefined
              }
            >
              Select the planning period, then add findings in separate blocks.
              Drafts can be completed later.
            </Empty>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                <LockKeyhole size={16} className="shrink-0" />
                <p>
                  Confidential assessment · {document.data.findings.length}{" "}
                  findings · {pending} awaiting review. Reviewed findings keep
                  their own saved version.
                </p>
              </div>
              {document.status === "APPROVED" && (
                <div className={`${card} space-y-3`}>
                  <p className="text-sm">
                    This assessment is locked. Open a dated revision before
                    adding or changing findings.
                  </p>
                  <ApprovalActions document={document} />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Search findings">
                  <div className="relative">
                    <Search
                      size={15}
                      className="absolute left-3 top-5 text-slate-400"
                    />
                    <input
                      className={`${control} pl-9`}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Finding name or code..."
                    />
                  </div>
                </Field>
                <Field label="Pillar">
                  <select
                    className={control}
                    value={pillar}
                    onChange={(e) => setPillar(e.target.value)}
                  >
                    <option value="">All six pillars</option>
                    {data.references.pillars.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    className={control}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {Object.entries(categories).map(([value, entry]) => (
                      <option key={value} value={value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div
                className="space-y-3"
                aria-label={
                  reviewOnly ? "Pending finding reviews" : "Separate findings"
                }
              >
                {findings.map((item) => {
                  const status = findingReviewStatus(item, document);
                  const links = objectiveLinks(item);
                  return (
                    <article
                      key={item.id}
                      data-finding-id={item.id}
                      className={`${card} space-y-3`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">
                          {item.code} · {item.pillar} ·{" "}
                          {categories[item.category].singular}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${status === "REVIEWED" ? "bg-emerald-50 text-emerald-700" : status === "NEEDS_EVIDENCE" ? "bg-amber-50 text-amber-800" : "bg-indigo-50 text-indigo-700"}`}
                        >
                          {reviewNames[status]}
                        </span>
                      </div>
                      <h3 className="whitespace-pre-wrap break-words text-base font-semibold">
                        {item.title || "Untitled finding"}
                      </h3>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-slate-500">
                            Supporting data
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">
                            {item.explanation || "Not added yet"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">
                            Reference / source / period
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">
                            {item.evidence || "Not added yet"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                        <span>
                          Main result:{" "}
                          <strong className="font-medium text-slate-700">
                            {mainAlignment(item)}
                          </strong>
                        </span>
                        <span>
                          Linked objectives:{" "}
                          {links.length
                            ? links.map((link) => (
                                <span
                                  key={`${link.documentId}/${link.objective.id}`}
                                  className="mr-3 inline-block"
                                >
                                  <button
                                    type="button"
                                    className="font-medium text-indigo-700 hover:underline"
                                    onClick={() => openObjective(link)}
                                  >
                                    {link.objective.code || "Untitled draft"} ·{" "}
                                    {link.objective.title || "Objective"}
                                  </button>
                                  {link.historical && (
                                    <span className="ml-1">
                                      (Earlier approved link · v{link.version})
                                    </span>
                                  )}
                                </span>
                              ))
                            : "Not linked"}
                        </span>
                      </div>
                      {status === "REVIEWED" &&
                        [
                          "MAINTAIN",
                          "USE",
                          "MONITOR",
                          "DEFER",
                          "VERIFY",
                        ].includes(item.response) && (
                          <p className="text-xs text-slate-500">
                            Response owner:{" "}
                            {data.references.people.find(
                              (person) => person.id === item.followupOwnerId,
                            )?.name || "Not assigned"}{" "}
                            · Next review: {item.reviewDate || "Not set"}
                          </p>
                        )}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <FindingWeightage weightage={item.weightage} />
                          <span className="text-xs text-slate-500">
                            {responseLabels[item.response]}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {status !== "REVIEWED" &&
                            document.permissions.canEdit && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEdit({ ...item })}
                              >
                                Edit finding
                              </Button>
                            )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReviewId(item.id)}
                          >
                            {status === "REVIEWED"
                              ? "View review"
                              : "Review finding"}
                          </Button>
                          {status === "REVIEWED" && canCreate && (
                            <Button size="sm" onClick={() => nextAction(item)}>
                              {item.response === "OBJECTIVE"
                                ? links.length
                                  ? "Create another objective"
                                  : "Use for objective"
                                : item.response === "ACTION"
                                  ? "Link department action"
                                  : "View response"}{" "}
                              <ArrowRight size={13} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!findings.length && (
                <Empty
                  title={
                    reviewOnly
                      ? "No findings awaiting review"
                      : "No findings match"
                  }
                >
                  {reviewOnly
                    ? "Reviewed findings remain in the SWOT register. Add a finding or adjust the filters."
                    : "Add a finding or change your filters to see existing records."}
                </Empty>
              )}
              {document.permissions.canEdit && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="text-slate-500">
                    {document.data.consideredPillars.length} of 6 pillars
                    considered.
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run("CONSIDER_ALL_PILLARS", {}, document.id).catch(
                        (cause) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not mark the pillars considered.",
                          ),
                      )
                    }
                  >
                    Mark all pillars considered
                  </Button>
                </div>
              )}
              <History document={document} />
            </>
          )}
        </>
      )}
      {document && edit && (
        <ItemEditor
          key={String(edit.id || "new-findings")}
          document={document}
          kind="finding"
          initial={edit}
          onClose={() => setEdit(null)}
        />
      )}
      {document && finding && (
        <ReviewFinding
          key={finding.id}
          document={document}
          finding={finding}
          onClose={() => setReviewId("")}
          onEdit={() => {
            setEdit({ ...finding });
            setReviewId("");
          }}
        />
      )}
      {document && settings && (
        <PlanSettings document={document} onClose={() => setSettings(false)} />
      )}
      {actionSources && (
        <LinkFindingAction
          cycle={cycle}
          sources={actionSources}
          onClose={() => setActionSources(null)}
        />
      )}
      {objectivePlan && pendingObjective && (
        <ItemEditor
          document={objectivePlan}
          kind="objective"
          initial={{
            sources: [pendingObjective.source],
            pillar: pendingObjective.pillar,
          }}
          onClose={() => setPendingObjective(null)}
          onSaved={(objectiveId) => {
            setPendingObjective(null);
            setPlanFocus(objectivePlan.id);
            router.push(
              `/leadership-excellence/performance-planning/objectives#objective-${objectiveId}`,
            );
          }}
        />
      )}
    </div>
  );
}
