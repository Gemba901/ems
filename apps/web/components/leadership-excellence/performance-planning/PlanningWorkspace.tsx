"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  FileCheck2,
  Info,
  LockKeyhole,
  Plus,
  Settings2,
} from "lucide-react";
import type {
  ApprovedParentGoal,
  Finding,
  Goal,
  ItemKind,
  ParentGoal,
  PlanningDocument,
  PlanningView,
  SourceLink,
} from "@/services/leadership-excellence/performance-planning.service";
import {
  compareFindingWeightage,
  findingPriority,
  validFindingWeightage,
} from "@/services/leadership-excellence/performance-planning/finding-weightage";
import { usePlanning } from "./PlanningProvider";
import { FindingWeightage } from "./FindingWeightage";
import { PlanningEvidence } from "./PlanningEvidence";
import { PlanningBackup } from "./PlanningBackup";
import { ItemEditor, PlanSettings, DefinitionEditor } from "./PlanningEditors";
import {
  AuditChanges,
  FindingConnections,
  LinkFindingAction,
  planningTime,
  planningToday,
  SharedActions,
  ReviewedSources,
} from "./PlanningLinks";
import { PlanningGuide } from "./PlanningGuide";
import { PlanningYearPicker } from "./PlanningYearPicker";
import {
  planningPeriodBounds,
  planningPeriodKey,
  planningPeriodLabel,
  planningPeriodValidation,
} from "@/services/leadership-excellence/performance-planning/planning-period";
import { PlanningStrategyMap } from "./PlanningStrategyMap";
import { PlanningRegister as Register } from "./PlanningRegister";
import { PlanningFlowNav } from "./PlanningFlowNav";
import { resolveParentGoal } from "@/services/leadership-excellence/performance-planning/measurable-objective";
import { PlanningCreateGoal } from "./PlanningCreateGoal";
import { PlanningApprovedGoals } from "./PlanningApprovedGoals";
import { PlanCollection, Readiness } from "./PlanningOverview";
import {
  Button,
  card,
  control,
  categories,
  responseLabels,
  Status,
  Field,
  Modal,
  Tabs,
  Empty,
  ErrorList,
} from "./PlanningUi";

type Plan = PlanningView["documents"][number];
type Section = "company" | "department" | "personal" | "approval";
type Edit = {
  document: PlanningDocument;
  kind: ItemKind;
  initial?: Record<string, unknown>;
};
const titleOf = (document: PlanningDocument) =>
  document.data.title || document.code;

function NewPlan({
  kinds,
  initialCycle,
  lockCycle = false,
  onClose,
  onCreated,
}: {
  kinds: PlanningDocument["kind"][];
  initialCycle?: string;
  lockCycle?: boolean;
  onClose: () => void;
  onCreated: (id: string, cycle: string) => void;
}) {
  const { data, run, busy, refresh } = usePlanning();
  const initialKind =
    kinds[0] === "TEAM" &&
    !data.references.teams.length &&
    kinds.includes("INDIVIDUAL")
      ? "INDIVIDUAL"
      : kinds[0];
  const initialPeriod =
    planningPeriodBounds(initialCycle || "") ||
    planningPeriodBounds(String(new Date().getFullYear()))!;
  const [kind, setKind] = useState(initialKind),
    [startDate, setStartDate] = useState(initialPeriod.startDate),
    [endDate, setEndDate] = useState(initialPeriod.endDate),
    [scopeId, setScope] = useState(
      data.actor.role === "EMPLOYEE" ? data.actor.employeeId : "",
    ),
    [title, setTitle] = useState(""),
    [error, setError] = useState("");
  const cycle = planningPeriodKey(startDate, endDate);
  const scopes =
    kind === "DEPARTMENT"
      ? data.references.departments
      : kind === "TEAM"
        ? data.references.teams.map((team) => ({
            id: team.id,
            name: `${team.name} · ${data.references.departments.find((department) => department.id === team.departmentId)?.name || "Department unavailable"}`,
          }))
        : kind === "POSITION"
          ? (data.references.positions || []).map((position) => ({
              id: position.id,
              name: `${position.name}${position.holderIds.length ? "" : " · Vacant"}`,
            }))
          : data.references.people
              .filter(
                (p) =>
                  data.actor.role !== "EMPLOYEE" ||
                  p.id === data.actor.employeeId,
              )
              .map((p) => ({
                id: p.id,
                name: `${p.name} · ${p.position}`,
              }));
  const requiresScope = !["SWOT", "COMPANY"].includes(kind);
  const validScope =
    !requiresScope || scopes.some((scope) => scope.id === scopeId);
  return (
    <Modal title="Start a planning record" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validScope || busy) return;
          if (!cycle) {
            setError(planningPeriodValidation(startDate, endDate).join("\n"));
            return;
          }
          try {
            onCreated(
              await run("CREATE_PLAN", {
                kind,
                cycle,
                startDate,
                endDate,
                scopeId,
                title,
              }),
              cycle,
            );
            onClose();
          } catch (c) {
            setError(c instanceof Error ? c.message : "Could not create.");
          }
        }}
      >
        <ErrorList error={error} />
        <Field label="Record type">
          <select
            className={control}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setScope("");
            }}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k === "SWOT"
                  ? "Company SWOT assessment"
                  : k === "COMPANY"
                    ? "Company objective plan"
                    : `${k[0]}${k.slice(1).toLowerCase()} plan`}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <input
              className={control}
              type="date"
              min="2000-01-01"
              max="2200-12-31"
              value={startDate}
              readOnly={lockCycle}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              className={control}
              type="date"
              min={startDate || "2000-01-01"}
              max="2200-12-31"
              value={endDate}
              readOnly={lockCycle}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
        {lockCycle && (
          <p className="text-xs text-slate-500">
            Uses the selected planning period. Change it from the period
            selector to work on a different plan.
          </p>
        )}
        {!["SWOT", "COMPANY"].includes(kind) && (
          <Field
            label={
              kind === "INDIVIDUAL"
                ? "EMS employee"
                : kind === "POSITION"
                  ? "EMS position"
                  : kind === "TEAM"
                    ? "EMS team / section"
                    : "EMS department"
            }
          >
            <select
              className={control}
              value={scopeId}
              disabled={!scopes.length}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="">
                {kind === "TEAM" && !scopes.length
                  ? "No EMS teams available"
                  : "Select..."}
              </option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === "TEAM" && !scopes.length && (
          <div
            role="status"
            aria-label="EMS team availability"
            className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm"
          >
            <Info size={18} className="mt-0.5 shrink-0 text-slate-500" />
            <div className="min-w-0 space-y-3">
              <p className="font-medium">No EMS teams are available yet.</p>
              <p className="leading-6 text-slate-500">
                Teams use active employees with the same department and Section
                / Area in EMS. To set up a team, an EMS administrator can open
                an employee&apos;s Work Allocation and fill in Department and
                Section / Area for its members. Then refresh teams here.
              </p>
              <p className="text-slate-500">
                For one person&apos;s plan, choose Individual plan and select
                their EMS employee record.
              </p>
              <div className="flex flex-wrap gap-2">
                {kinds.includes("INDIVIDUAL") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setKind("INDIVIDUAL");
                      setScope(
                        data.actor.role === "EMPLOYEE"
                          ? data.actor.employeeId
                          : "",
                      );
                      setError("");
                    }}
                  >
                    Use individual plan
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                  disabled={busy}
                >
                  Refresh teams
                </Button>
              </div>
            </div>
          </div>
        )}
        {kind === "POSITION" && !scopes.length && (
          <p className="text-sm text-slate-500">
            No position records are available from EMS / Organisation Framework
            yet. Position planning needs its stable position ID; use an employee
            plan until the shared position source is connected.
          </p>
        )}
        <Field label="Plan name (optional)">
          <input
            className={control}
            maxLength={350}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <p className="text-sm text-slate-500">
          One record per scope and planning period. Start with a draft, then set
          its dates, owner and single approver.
        </p>
        <Button type="submit" disabled={busy || !validScope}>
          Create draft
        </Button>
      </form>
    </Modal>
  );
}

export function ApprovalActions({
  document,
  onResolve,
}: {
  document: Plan;
  onResolve?: (issue: string) => void;
}) {
  const { run, busy, data } = usePlanning();
  const [dialog, setDialog] = useState<
      "RETURN" | "REVISE" | "APPROVE" | "SUBMIT" | null
    >(null),
    [reason, setReason] = useState(""),
    [date, setDate] = useState(planningToday(data.references.timeZone)),
    [error, setError] = useState("");
  async function act(
    action: "SUBMIT" | "RETURN" | "REVISE" | "APPROVE" | "ACKNOWLEDGE",
  ) {
    try {
      await run(action, { reason, effectiveDate: date }, document.id);
      setDialog(null);
    } catch (c) {
      setError(c instanceof Error ? c.message : "Could not update the plan.");
    }
  }
  const approved = document.status === "APPROVED";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {document.permissions.canEdit && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError("");
              setDialog("SUBMIT");
            }}
          >
            Check & submit
          </Button>
        )}
        {document.permissions.canApprove && !approved && (
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              setDialog("APPROVE");
            }}
          >
            <FileCheck2 size={15} />
            {document.kind === "SWOT" ? "Review & finalise" : "Approve plan"}
          </Button>
        )}
        {document.permissions.canApprove && document.status === "IN_REVIEW" && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setDialog("RETURN")}
          >
            Return for changes
          </Button>
        )}
        {document.permissions.canApprove && approved && (
          <Button variant="outline" onClick={() => setDialog("REVISE")}>
            Create dated revision
          </Button>
        )}
        {document.kind === "INDIVIDUAL" &&
          document.scopeId === data.actor.employeeId &&
          document.versions.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act("ACKNOWLEDGE")}
            >
              {document.acknowledgement ? "Acknowledged" : "Acknowledge plan"}
            </Button>
          )}
      </div>
      {error && !dialog && <ErrorList error={error} />}
      {dialog && (
        <Modal
          title={
            dialog === "SUBMIT"
              ? "Check before submitting"
              : dialog === "APPROVE"
                ? document.kind === "SWOT"
                  ? "Finalise this SWOT assessment?"
                  : "Approve this plan?"
                : dialog === "REVISE"
                  ? "Open a dated revision"
                  : "Return for changes"
          }
          onClose={() => setDialog(null)}
        >
          <div className="space-y-5">
            <ErrorList error={error} />
            {["APPROVE", "SUBMIT"].includes(dialog) ? (
              <>
                <p className="text-sm leading-6">
                  {dialog === "SUBMIT"
                    ? "Check the missing details before sending this plan to its designated approver. You can keep working in draft until it is ready."
                    : "Approval saves a locked version. Further changes need a reason and an effective date. Company achievement uses its own verified measures."}
                </p>
                {document.issues.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-medium">Resolve these checks first</p>
                    <div className="mt-3">
                      <Readiness
                        document={document}
                        onResolve={
                          onResolve
                            ? (issue) => {
                                setDialog(null);
                                onResolve(issue);
                              }
                            : undefined
                        }
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Field label="Reason">
                  <textarea
                    className={control}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                {dialog === "REVISE" && (
                  <Field label="Effective date">
                    <input
                      className={control}
                      type="date"
                      min={planningToday(data.references.timeZone)}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </Field>
                )}
                <p className="text-sm text-slate-500">
                  The previous approved version remains available. A future
                  revision takes effect only on its effective date.
                </p>
              </>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                disabled={
                  busy ||
                  (["APPROVE", "SUBMIT"].includes(dialog) &&
                    document.issues.length > 0)
                }
                onClick={() => void act(dialog)}
              >
                {dialog === "SUBMIT" ? "Send for approval" : "Confirm"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function PlanBar({
  document,
  onSettings,
  onResolve,
}: {
  document: Plan;
  onSettings: () => void;
  onResolve?: (issue: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Status status={document.status} swot={document.kind === "SWOT"} />
            <span className="text-xs text-slate-500">{document.code}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {document.status === "APPROVED"
              ? "This plan is locked. Its approved commitments are available to the next planning stage."
              : document.status === "IN_REVIEW"
                ? "The designated approver will review this plan together."
                : "Complete the essentials, then send the whole plan for approval."}
          </p>
        </div>
        {document.permissions.canEdit && (
          <Button size="sm" variant="outline" onClick={onSettings}>
            <Settings2 size={14} />
            Plan settings
          </Button>
        )}
      </div>
      <div className="mt-3">
        <ApprovalActions document={document} onResolve={onResolve} />
      </div>
    </section>
  );
}

function SwotBoard({
  document,
  edit,
}: {
  document: Plan;
  edit: (value: Edit) => void;
}) {
  const { data, run, busy } = usePlanning();
  const [pillar, setPillar] = useState("OPX");
  const considered = document.data.consideredPillars.includes(
    pillar as Finding["pillar"],
  );
  const consideredCount = data.references.pillars.filter((p) =>
    document.data.consideredPillars.includes(p.code),
  ).length;
  const allConsidered =
    consideredCount > 0 && consideredCount === data.references.pillars.length;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <LockKeyhole className="mt-0.5 shrink-0 text-slate-500" size={17} />
        <p>
          Confidential planning input. Only management, coordinators and
          selected contributors can access this assessment. Approved company
          goals can be shared without exposing raw SWOT.
        </p>
      </div>
      <Tabs
        label="Six excellence pillars"
        value={pillar}
        onChange={setPillar}
        items={data.references.pillars.map((p) => [
          p.code,
          `${p.code} · ${p.name}`,
        ])}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72 text-sm text-slate-500">
          <p role="status">
            {consideredCount} of 6 pillars considered. Empty quadrants are
            allowed.
          </p>
          <p className="mt-1 text-xs">
            Findings appear highest weightage first; unassessed findings appear
            last.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            className="w-full sm:w-auto"
            variant={considered ? "secondary" : "outline"}
            disabled={!document.permissions.canEdit || busy}
            aria-pressed={considered}
            onClick={() =>
              void run("CONSIDER_PILLAR", { pillar }, document.id).catch(
                () => {},
              )
            }
          >
            {considered && <Check size={16} />}{" "}
            {considered ? "Pillar considered" : "Mark pillar considered"}
          </Button>
          {document.permissions.canEdit && (
            <Button
              className="w-full sm:w-auto"
              variant={allConsidered ? "secondary" : "default"}
              disabled={busy || allConsidered}
              onClick={() =>
                void run("CONSIDER_ALL_PILLARS", {}, document.id).catch(
                  () => {},
                )
              }
            >
              <CheckCheck size={16} />
              {allConsidered
                ? "All pillars considered"
                : "Mark all pillars considered"}
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Object.entries(categories).map(([key, category]) => {
          const findings = document.data.findings
            .filter(
              (f) =>
                f.category === key &&
                (f.pillar === pillar ||
                  f.relatedPillars.includes(pillar as Finding["pillar"])),
            )
            .sort(compareFindingWeightage);
          return (
            <section
              key={key}
              className={`min-h-52 rounded-xl border p-5 ${category.className}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    className={`flex items-center gap-2 font-semibold ${category.ink}`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-sm">
                      {key}
                    </span>
                    {category.label}
                    <span className="text-xs font-normal">
                      ({findings.length})
                    </span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">{category.hint}</p>
                </div>
                {document.permissions.canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      edit({
                        document,
                        kind: "finding",
                        initial: { pillar, category: key },
                      })
                    }
                    aria-label={`Add ${category.singular}`}
                  >
                    <Plus size={14} />
                    Add
                  </Button>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {findings.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() =>
                      edit({ document, kind: "finding", initial: { ...f } })
                    }
                    className="w-full rounded-lg border border-white/80 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
                  >
                    <div className="mb-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        {f.code}
                        {f.pillar !== pillar
                          ? ` · Shared from ${f.pillar}`
                          : ""}
                      </span>
                      <FindingWeightage weightage={f.weightage} />
                    </div>
                    <p className="text-sm font-medium text-slate-900">
                      {f.title}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {responseLabels[f.response]}
                      {f.basis === "NEEDS_CHECKING" ? " · Needs checking" : ""}
                    </p>
                  </button>
                ))}
                {!findings.length && (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No {category.label.toLowerCase()} recorded for this pillar.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SwotSummary({
  document,
  edit,
  onUse,
}: {
  document: Plan;
  edit: (value: Edit) => void;
  onUse: (sources: SourceLink[]) => void;
}) {
  const { data } = usePlanning();
  const [actionSources, setActionSources] = useState<SourceLink[] | null>(null);
  const canPlan =
    ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(data.actor.role) ||
    data.documents.some((d) => d.kind === "COMPANY" && d.permissions.canEdit);
  const [search, setSearch] = useState(""),
    [pillar, setPillar] = useState(""),
    [category, setCategory] = useState(""),
    [priority, setPriority] = useState(""),
    [response, setResponse] = useState(""),
    [selection, setSelection] = useState<string[]>([]);
  const rows = document.data.findings
    .filter(
      (f) =>
        (!pillar ||
          f.pillar === pillar ||
          f.relatedPillars.includes(pillar as Finding["pillar"])) &&
        (!category || f.category === category) &&
        (!priority ||
          (priority === "NOT_ASSESSED"
            ? !validFindingWeightage(f.weightage)
            : findingPriority(f.weightage) === priority)) &&
        (!response || f.response === response) &&
        `${f.title} ${f.code} ${f.explanation} ${f.impact} ${f.evidence} ${f.decisionNote}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(compareFindingWeightage);
  const latest = document.versions.at(-1);
  const eligible = (f: Finding) =>
    document.status === "APPROVED" &&
    f.basis !== "NEEDS_CHECKING" &&
    latest?.data.findings.some((v) => v.id === f.id);
  const choose = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: [string, string][],
  ) => (
    <select
      aria-label={label}
      className={control}
      value={value}
      onChange={(e) => set(e.target.value)}
    >
      <option value="">All {label.toLowerCase()}</option>
      {options.map(([id, title]) => (
        <option key={id} value={id}>
          {title}
        </option>
      ))}
    </select>
  );
  return (
    <section className={`${card} space-y-4`}>
      <h2 className="font-semibold text-slate-900">
        Summary & management decisions
      </h2>
      <p className="text-xs text-slate-500">
        Highest weightage first; unassessed findings appear last. Priority is
        derived from weightage: Low 1–3, Medium 4–7, High 8–10.
      </p>
      <input
        aria-label="Search SWOT summary"
        className={control}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search findings and supporting information..."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {choose(
          "Pillars",
          pillar,
          setPillar,
          ["LEX", "PEX", "OPX", "CMX", "SGEX", "FPEX"].map((p) => [p, p]),
        )}
        {choose(
          "Categories",
          category,
          setCategory,
          Object.entries(categories).map(([id, c]) => [id, c.label]),
        )}
        {choose("Priorities", priority, setPriority, [
          ["HIGH", "High"],
          ["MEDIUM", "Medium"],
          ["LOW", "Low"],
          ["NOT_ASSESSED", "Not assessed"],
        ])}
        {choose(
          "Responses",
          response,
          setResponse,
          Object.entries(responseLabels).filter(([id]) => id),
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          {rows.length} findings · {selection.length} selected ·{" "}
          {selection.filter((id) => !rows.some((f) => f.id === id)).length}{" "}
          hidden by filters
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canPlan || !selection.length || !latest}
            onClick={() =>
              onUse(
                selection.map((findingId) => ({
                  documentId: document.id,
                  version: latest!.version,
                  findingId,
                })),
              )
            }
          >
            Create / link objective
            <ArrowRight size={15} />
          </Button>
          <Button
            variant="outline"
            disabled={
              !selection.length ||
              !latest ||
              !data.documents.some(
                (plan) =>
                  plan.cycle === document.cycle &&
                  plan.permissions.canEdit &&
                  plan.data.actions.length,
              )
            }
            onClick={() =>
              setActionSources(
                selection.map((findingId) => ({
                  documentId: document.id,
                  version: latest!.version,
                  findingId,
                })),
              )
            }
          >
            Link existing action
          </Button>
        </div>
      </div>
      {document.status !== "APPROVED" && (
        <p className="text-xs text-slate-500">
          Finalise the assessment before selecting sources for objectives. You
          can record decisions while it is a draft.
        </p>
      )}
      <div className="divide-y divide-slate-100">
        {rows.map((f) => (
          <div key={f.id} className="flex items-start gap-3 py-4">
            <input
              aria-label={`Select ${f.title}`}
              type="checkbox"
              className="mt-1"
              disabled={!eligible(f)}
              checked={selection.includes(f.id)}
              onChange={() =>
                setSelection(
                  selection.includes(f.id)
                    ? selection.filter((id) => id !== f.id)
                    : [...selection, f.id],
                )
              }
            />
            <div className="min-w-0 flex-1">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  edit({ document, kind: "finding", initial: { ...f } })
                }
              >
                <span className="text-xs text-slate-500">
                  {f.code} · {f.pillar} · {categories[f.category].singular}
                </span>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {f.title}
                </p>
                <div className="mt-2">
                  <FindingWeightage weightage={f.weightage} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {responseLabels[f.response]}
                  {f.basis === "NEEDS_CHECKING" ? " · Needs checking" : ""}
                </p>
              </button>
              <FindingConnections
                documentId={document.id}
                findingId={f.id}
                onOpen={(plan, kind, item) =>
                  edit({ document: plan, kind, initial: item })
                }
              />
            </div>
            <ChevronRight size={15} className="mt-3 text-slate-500" />
          </div>
        ))}
      </div>
      {!rows.length && (
        <p className="py-6 text-center text-sm text-slate-500">
          No findings match these filters.
        </p>
      )}
      {actionSources && (
        <LinkFindingAction
          cycle={document.cycle}
          sources={actionSources}
          onClose={() => setActionSources(null)}
        />
      )}
    </section>
  );
}

function Delivery({
  document,
  edit,
  fullDocument,
}: {
  document: Plan;
  edit: (value: Edit) => void;
  fullDocument?: Plan;
}) {
  const { data } = usePlanning();
  const [definition, setDefinition] = useState(false);
  return (
    <div className="space-y-6">
      <section className={`${card} space-y-4`}>
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-semibold">KRA / KPI assignments</h2>
          {document.permissions.canEdit && (
            <div className="flex gap-2">
              {(["ADMIN", "SUPER_ADMIN", "MANAGEMENT", "HOD"].includes(
                data.actor.role,
              ) ||
                data.documents.some((plan) =>
                  plan.data.coordinatorIds.includes(data.actor.employeeId),
                )) && (
                <Button variant="outline" onClick={() => setDefinition(true)}>
                  Create / adapt KPI
                </Button>
              )}
              <Button onClick={() => edit({ document, kind: "assignment" })}>
                <Plus size={14} />
                Assign KPI
              </Button>
            </div>
          )}
        </div>
        {document.data.assignments.map((a) => {
          const k = data.definitions.find((k) => k.id === a.definitionId);
          return (
            <button
              key={a.id}
              onClick={() =>
                edit({ document, kind: "assignment", initial: { ...a } })
              }
              className="block w-full rounded-lg border border-slate-200 p-4 text-left"
            >
              <span className="text-xs text-slate-500">
                {a.code} · {data.kras.find((r) => r.id === k?.kraId)?.name}
              </span>
              <h3 className="mt-1 font-medium">
                {k?.name || "KPI not selected"}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Update: {a.updateFrequency.replaceAll("_", " ")} · Review:{" "}
                {a.reviewFrequency.replaceAll("_", " ")} · {a.targets.length}{" "}
                periods ·{" "}
                {
                  a.targets.filter(
                    (p) => p.scheduled !== false && p.target === null,
                  ).length
                }{" "}
                targets missing
              </p>
              {a.targets.some((period) => period.scheduled === false) && (
                <p className="mt-1 text-xs text-slate-500">
                  {
                    a.targets.filter((period) => period.scheduled === false)
                      .length
                  }{" "}
                  non-working dates not scheduled
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {document.data.goals.find((g) => g.id === a.goalId)?.title ||
                  "Goal not selected"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Accountable owner:{" "}
                {data.references.people.find(
                  (person) => person.id === a.ownerId,
                )?.name || "Not set"}
                {k?.adaptedFromId
                  ? ` · Adapted from ${data.definitions.find((definition) => definition.id === k.adaptedFromId)?.code || "original definition"}`
                  : ""}
              </p>
            </button>
          );
        })}
        {!document.data.assignments.length && (
          <p className="text-sm text-slate-500">
            Assign a reusable measure to a contribution goal, then set targets
            for its reporting periods.
          </p>
        )}
      </section>
      <section className={`${card} space-y-4`}>
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-semibold">Delivery actions</h2>
          {document.permissions.canEdit && (
            <Button onClick={() => edit({ document, kind: "action" })}>
              <Plus size={14} />
              Add action
            </Button>
          )}
        </div>
        {document.data.actions.map((a) => (
          <button
            key={a.id}
            onClick={() =>
              edit({ document, kind: "action", initial: { ...a } })
            }
            className="block w-full rounded-lg border border-slate-200 p-4 text-left"
          >
            <span className="text-xs text-slate-500">
              {a.code}
              {a.parentActionId ? " · Sub-action" : ""} · Due{" "}
              {a.dueDate || "not set"}
            </span>
            <p className="mt-1 font-medium">{a.title || "Untitled action"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {a.expectedResult || "Expected result not set"}
            </p>
          </button>
        ))}
        {!document.data.actions.length && (
          <p className="text-sm text-slate-500">
            Plan the work, owner, due date and evidence needed to deliver each
            contribution.
          </p>
        )}
        <SharedActions
          document={fullDocument || document}
          unlinkedOnly={!!fullDocument}
        />
      </section>
      {definition && <DefinitionEditor onClose={() => setDefinition(false)} />}
    </div>
  );
}

export function History({
  document,
  expanded = false,
}: {
  document: Plan;
  expanded?: boolean;
}) {
  const { data } = usePlanning();
  return (
    <details className={card} open={expanded || undefined}>
      <summary className="cursor-pointer text-sm font-medium">
        Version & audit history
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-xs text-slate-500">
          Times shown in {data.references.timeZone || "UTC"}. Previous approvals
          remain available during revisions.
        </p>
        {document.versions.map((v) => (
          <details
            key={v.version}
            className="rounded-lg border border-slate-200 p-3"
          >
            <summary className="cursor-pointer text-sm">
              Version {v.version} · effective {v.effectiveDate} · approved{" "}
              {planningTime(v.approvedAt, data.references.timeZone)}
            </summary>
            <p className="my-2 text-sm">{v.reason || "Initial approval"}</p>
            <div className="space-y-2 text-sm">
              {[
                ...v.data.findings,
                ...v.data.objectives,
                ...v.data.goals,
                ...v.data.actions,
              ].map((item) => (
                <p key={item.id}>
                  <span className="text-slate-500">{item.code}</span> —{" "}
                  {item.title || "Untitled"}
                </p>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {v.data.assignments.length} KPI assignments preserved with this
              version.
            </p>
          </details>
        ))}
        {document.history
          .slice()
          .reverse()
          .map((event) => (
            <div
              key={event.id}
              className="border-b border-slate-200 pb-2 text-xs"
            >
              <p className="font-medium">
                {event.action}
                {event.detail ? ` · ${event.detail}` : ""}
              </p>
              <p className="mt-1 text-slate-500">
                {event.actorName} ·{" "}
                {planningTime(event.at, data.references.timeZone)}
              </p>
              <AuditChanges event={event} />
            </div>
          ))}
        {!document.versions.length && !document.history.length && (
          <p className="text-sm text-slate-500">
            No visible version history yet.
          </p>
        )}
      </div>
    </details>
  );
}

function ReadItem({ edit, onClose }: { edit: Edit; onClose: () => void }) {
  const { data } = usePlanning();
  const value = edit.initial || {};
  const skip = new Set(["id", "createdBy", "updatedBy"]);
  if (edit.kind === "finding") {
    skip.add("weightage");
    skip.add("priority");
  }
  const display = (key: string, v: unknown): string => {
    if (v === null || v === "") return "Not set";
    if (key.endsWith("At") && typeof v === "string")
      return `${planningTime(v, data.references.timeZone)} (${data.references.timeZone || "UTC"})`;
    if (key === "sources" && Array.isArray(v))
      return (
        v
          .map((s: SourceLink) => {
            const finding = data.documents
              .find((d) => d.id === s.documentId)
              ?.versions.find((version) => version.version === s.version)
              ?.data.findings.find((f) => f.id === s.findingId);
            return `${finding?.code || "Restricted source"} · ${finding?.title || ""} · reviewed v${s.version}`;
          })
          .join("\n") || "None"
      );
    if (key === "targets" && Array.isArray(v))
      return (
        v
          .map(
            (p) =>
              `${p.label}: ${p.scheduled === false ? "Not scheduled" : (p.target ?? "Not set")}${p.upper != null ? ` to ${p.upper}` : ""}${p.submissionDate && p.scheduled !== false ? ` · Submit by ${p.submissionDate}` : ""}`,
          )
          .join("\n") || "No periods yet"
      );
    if (key === "parent" && typeof v === "object") {
      const parent = v as ParentGoal;
      const plan = data.documents.find((d) => d.id === parent.documentId);
      const version = plan?.versions.find(
        (version) => version.version === parent.version,
      );
      const goal = version && resolveParentGoal(version.data, parent);
      return `${goal?.title || "Approved parent commitment"} · v${parent.version}`;
    }
    if (Array.isArray(v))
      return (
        v
          .map((item) =>
            typeof item === "object"
              ? JSON.stringify(item)
              : data.references.people.find((p) => p.id === item)?.name ||
                data.references.departments.find((d) => d.id === item)?.name ||
                String(item),
          )
          .join(", ") || "None"
      );
    if (typeof v === "object") return JSON.stringify(v);
    return key.endsWith("Id")
      ? data.references.people.find((p) => p.id === v)?.name ||
          edit.document.data.goals.find((g) => g.id === v)?.title ||
          edit.document.data.objectives.find((o) => o.id === v)?.title ||
          edit.document.data.actions.find((a) => a.id === v)?.title ||
          data.definitions.find((d) => d.id === v)?.name ||
          "Record unavailable"
      : String(v);
  };
  return (
    <Modal
      title={String(value.title || value.code || "Planning detail")}
      onClose={onClose}
      wide
    >
      <p className="mb-4 text-sm text-slate-500">
        Read-only record. Approved information can be changed only through a
        dated revision.
      </p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {edit.kind === "finding" && (
          <div className="min-w-0 rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Weightage & priority</dt>
            <dd className="mt-1">
              <FindingWeightage weightage={value.weightage} />
            </dd>
            {!validFindingWeightage(value.weightage) &&
              edit.document.status === "APPROVED" &&
              typeof value.priority === "string" &&
              ["HIGH", "MEDIUM", "LOW"].includes(value.priority) && (
                <dd className="mt-2 text-xs text-slate-500">
                  Previous priority (before weightage): {value.priority}
                </dd>
              )}
          </div>
        )}
        {Object.entries(value)
          .filter(([key]) => !skip.has(key))
          .map(([key, v]) => (
            <div key={key} className="min-w-0 rounded-lg bg-slate-50 p-3">
              <dt className="text-xs capitalize text-slate-500">
                {key.replace(/([A-Z])/g, " $1")}
              </dt>
              <dd className="mt-1 break-words whitespace-pre-wrap text-sm">
                {display(key, v)}
              </dd>
            </div>
          ))}
      </dl>
      {edit.kind === "finding" && typeof value.id === "string" && (
        <div className="mt-5">
          <PlanningEvidence
            document={edit.document}
            findingId={value.id}
            editable={false}
          />
        </div>
      )}
    </Modal>
  );
}

export function PlanningWorkspace({ section }: { section: Section }) {
  const router = useRouter();
  const {
    data,
    planningCycle,
    setPlanningCycle: setCycle,
    contributionContext,
    setContributionContext,
    planFocus,
    setPlanFocus,
    registerFocus,
    setRegisterFocus,
  } = usePlanning();
  const cycle =
    planningCycle ||
    data.documents.filter((d) => d.kind === "COMPANY").at(-1)?.cycle ||
    data.documents.at(-1)?.cycle ||
    String(new Date().getFullYear());

  const canSeeSwot =
    ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(data.actor.role) ||
    data.documents.some((d) => d.kind === "SWOT");
  const [requestedTab, setTab] = useState("summary"),
    [swotOpen, setSwotOpen] = useState(false),
    [newKind, setNewKind] = useState<PlanningDocument["kind"] | null>(null),
    [requestedPersonalKind, setPersonalKind] = useState<
      PlanningDocument["kind"]
    >(() => {
      const focused = data.documents.find((d) => d.id === planFocus);
      return focused &&
        ["TEAM", "POSITION", "INDIVIDUAL"].includes(focused.kind)
        ? focused.kind
        : "INDIVIDUAL";
    }),
    [scopeSelection, setScopeSelection] = useState({
      cycle,
      id:
        section === "department" && contributionContext?.cycle === cycle
          ? contributionContext.departmentId
          : data.documents.find((d) => d.id === planFocus && d.cycle === cycle)
              ?.scopeId || "",
    }),
    [contributionGoal, setContributionGoal] = useState<Goal | null>(null),
    [settingsId, setSettingsId] = useState(""),
    [setupNotice, setSetupNotice] = useState(""),
    [pendingSources, setPendingSources] = useState<SourceLink[]>([]),
    [pendingObjective, setPendingObjective] = useState<{
      documentId: string;
      sources: SourceLink[];
    } | null>(null),
    [review, setReview] = useState(false),
    [history, setHistory] = useState(false),
    [id, setId] = useState(section === "approval" ? planFocus : ""),
    [create, setCreate] = useState(false),
    [companyDraft, setCompanyDraft] = useState<string | null>(null),
    [edit, setEdit] = useState<Edit | null>(null),
    [sourceLinks, setSourceLinks] = useState<SourceLink[] | null>(null),
    [objectiveId, setObjectiveId] = useState("");
  const [createGoal, setCreateGoal] = useState(false);
  const [pendingEditor, setPendingEditor] = useState<{
    documentId: string;
    kind: ItemKind;
    initial?: Record<string, unknown>;
  } | null>(null);
  const tab = canSeeSwot ? requestedTab : "objectives";
  const { run, busy } = usePlanning();
  const [linkError, setLinkError] = useState("");
  const personalKinds: PlanningDocument["kind"][] = (
    ["INDIVIDUAL", "TEAM", "POSITION"] as const
  ).filter(
    (kind) =>
      data.actor.role !== "EMPLOYEE" ||
      kind === "INDIVIDUAL" ||
      data.documents.some(
        (plan) =>
          plan.cycle === cycle &&
          plan.kind === kind &&
          plan.permissions.canRead,
      ),
  );
  const personalKind = personalKinds.includes(requestedPersonalKind)
    ? requestedPersonalKind
    : "INDIVIDUAL";
  const kinds: PlanningDocument["kind"][] =
    section === "company"
      ? ["COMPANY"]
      : section === "department"
        ? ["DEPARTMENT"]
        : section === "personal"
          ? [personalKind]
          : ["SWOT", "COMPANY", "DEPARTMENT", "TEAM", "POSITION", "INDIVIDUAL"];
  const documents = data.documents.filter(
    (d) => kinds.includes(d.kind) && d.cycle === cycle,
  );
  const scopeKind = section === "department" ? "DEPARTMENT" : personalKind;
  const scopeOptions = (
    scopeKind === "DEPARTMENT"
      ? data.references.departments.map((d) => ({ ...d, departmentId: d.id }))
      : scopeKind === "TEAM"
        ? data.references.teams
        : scopeKind === "POSITION"
          ? data.references.positions || []
          : data.references.people.map((person) => ({
              ...person,
              name: `${person.name} · ${person.position}`,
            }))
  ).filter((scope) => {
    const sharedWithActor = data.documents.some(
      (plan) =>
        plan.kind === scopeKind &&
        plan.cycle === cycle &&
        plan.scopeId === scope.id &&
        plan.permissions.canRead,
    );
    if (data.actor.role === "EMPLOYEE")
      return (
        sharedWithActor ||
        (scopeKind === "DEPARTMENT" && scope.id === data.actor.departmentId) ||
        (scopeKind === "INDIVIDUAL" && scope.id === data.actor.employeeId)
      );
    if (data.actor.role === "HOD")
      return sharedWithActor || scope.departmentId === data.actor.departmentId;
    return true;
  });
  const scopeId =
    scopeSelection.cycle === cycle &&
    scopeOptions.some((scope) => scope.id === scopeSelection.id)
      ? scopeSelection.id
      : documents.find((plan) =>
          scopeOptions.some((scope) => scope.id === plan.scopeId),
        )?.scopeId ||
        (section === "personal" &&
        personalKind === "INDIVIDUAL" &&
        scopeOptions.some((scope) => scope.id === data.actor.employeeId)
          ? data.actor.employeeId
          : "");
  const document =
    section === "company"
      ? documents.at(-1)
      : section === "approval"
        ? documents.find((d) => d.id === id)
        : documents.find((d) => d.scopeId === scopeId);
  const swotDocument = data.documents.find(
    (d) => d.kind === "SWOT" && d.cycle === cycle,
  );
  const cycles = Array.from(
    new Set([
      cycle,
      String(new Date().getFullYear()),
      String(new Date().getFullYear() + 1),
      ...data.documents.map((d) => d.cycle),
    ]),
  ).sort((a, b) => b.localeCompare(a));
  const canCreate =
    section !== "approval" &&
    (["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(data.actor.role) ||
      (section !== "company" && data.actor.role === "HOD") ||
      (section === "personal" && !!data.actor.employeeId));
  const existingCompanyPlan = data.documents.find(
    (d) => d.kind === "COMPANY" && d.cycle === cycle,
  );
  const companyPlan = data.documents.find(
    (d) => d.kind === "COMPANY" && d.cycle === cycle && d.permissions.canEdit,
  );
  async function linkObjective() {
    if (!companyPlan || !sourceLinks?.length) return;
    const objective = companyPlan.data.objectives.find(
      (o) => o.id === objectiveId,
    );
    if (!objective) {
      setSourceLinks(null);
      setPendingSources([]);
      setTab("objectives");
      setId(companyPlan.id);
      setEdit({
        document: companyPlan,
        kind: "objective",
        initial: {
          sources: sourceLinks,
          pillar:
            data.documents
              .find((d) => d.id === sourceLinks[0]?.documentId)
              ?.versions.find((v) => v.version === sourceLinks[0]?.version)
              ?.data.findings.find((f) => f.id === sourceLinks[0]?.findingId)
              ?.pillar || "",
        },
      });
      return;
    }
    try {
      const links = [...objective.sources];
      for (const s of sourceLinks)
        if (
          !links.some(
            (l) =>
              l.documentId === s.documentId &&
              l.version === s.version &&
              l.findingId === s.findingId,
          )
        )
          links.push(s);
      await run(
        "SAVE_ITEM",
        {
          kind: "objective",
          id: objective.id,
          data: { ...objective, sources: links },
        },
        companyPlan.id,
      );
      setSourceLinks(null);
      setPendingSources([]);
      setTab("objectives");
      setId(companyPlan.id);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Could not link sources.");
    }
  }
  const pendingDocument =
    pendingObjective &&
    data.documents.find((d) => d.id === pendingObjective.documentId);
  const selectedFinding =
    pendingObjective &&
    data.documents
      .find((d) => d.id === pendingObjective.sources[0]?.documentId)
      ?.versions.find((v) => v.version === pendingObjective.sources[0]?.version)
      ?.data.findings.find(
        (f) => f.id === pendingObjective.sources[0]?.findingId,
      );
  const pendingEditorDocument =
    pendingEditor &&
    data.documents.find((d) => d.id === pendingEditor.documentId);
  const activeEdit: Edit | null =
    edit ||
    (pendingEditorDocument && pendingEditor
      ? {
          document: pendingEditorDocument,
          kind: pendingEditor.kind,
          initial: pendingEditor.initial,
        }
      : null) ||
    (pendingDocument && pendingObjective
      ? {
          document: pendingDocument,
          kind: "objective",
          initial: {
            sources: pendingObjective.sources,
            pillar: selectedFinding?.pillar || "",
          },
        }
      : null);
  const closeEditor = () => {
    setEdit(null);
    setPendingObjective(null);
    setPendingEditor(null);
  };
  const editorDocument =
    activeEdit &&
    (data.documents.find((d) => d.id === activeEdit.document.id) ||
      activeEdit.document);
  const firstGoalObjective =
    activeEdit?.kind === "goal" && !activeEdit.initial?.id
      ? editorDocument?.data.objectives.find(
          (o) => o.id === activeEdit.initial?.objectiveId,
        )
      : undefined;
  const editorInitial = firstGoalObjective
    ? {
        startDate: firstGoalObjective.startDate,
        endDate: firstGoalObjective.endDate,
        ...activeEdit?.initial,
      }
    : activeEdit?.initial;
  const startFromSwot = () =>
    router.push("/leadership-excellence/performance-planning/swot-findings");
  const selectedScope = scopeOptions.find((scope) => scope.id === scopeId);
  const relatedDepartmentId =
    document?.departmentId || selectedScope?.departmentId;
  const relatedDepartment = data.references.departments.find(
    (d) => d.id === relatedDepartmentId,
  );
  const departmentPlan = data.documents.find(
    (d) =>
      d.kind === "DEPARTMENT" &&
      d.scopeId === relatedDepartmentId &&
      d.cycle === cycle,
  );
  const canCreateDepartment =
    ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(data.actor.role) ||
    (data.actor.role === "HOD" &&
      data.actor.departmentId === relatedDepartmentId);
  const openSettings = (plan: PlanningDocument) => setSettingsId(plan.id);
  const settingsDocument = data.documents.find((d) => d.id === settingsId);
  async function createScopedDraft(kind = scopeKind, scope = selectedScope) {
    if (!scope || busy) return;
    try {
      const savedId = await run("CREATE_PLAN", {
        kind,
        scopeId: scope.id,
        cycle,
        title: `${scope.name} · ${planningPeriodLabel(cycle)}`,
      });
      setId(savedId);
      setScopeSelection({ cycle, id: scope.id });
    } catch {
      /* The provider keeps the entered scope and displays the error. */
    }
  }
  function openPlan(plan: Plan) {
    setContributionContext(null);
    setCycle(plan.cycle);
    setPlanFocus(plan.id);
    setId(plan.id);
    setScopeSelection({ cycle: plan.cycle, id: plan.scopeId });
    if (["TEAM", "POSITION", "INDIVIDUAL"].includes(plan.kind))
      setPersonalKind(plan.kind);
    if (plan.kind === "COMPANY" && section === "company") {
      setReview(true);
      return;
    }
    const path =
      plan.kind === "COMPANY"
        ? "objectives"
        : plan.kind === "DEPARTMENT"
          ? "department-plans"
          : plan.kind === "SWOT"
            ? "check-approve"
            : "team-individual-plans";
    router.push(`/leadership-excellence/performance-planning/${path}`);
  }
  async function linkApprovedGoal(parent: ApprovedParentGoal) {
    if (!selectedScope || busy || (document && !document.permissions.canEdit))
      return;
    try {
      const documentId =
        document?.id ||
        (await run("CREATE_PLAN", {
          kind: scopeKind,
          scopeId: selectedScope.id,
          cycle,
          title: `${selectedScope.name} · ${planningPeriodLabel(cycle)}`,
        }));
      setPendingEditor({
        documentId,
        kind: "goal",
        initial: {
          parent: {
            documentId: parent.documentId,
            goalId: parent.goal.id,
            version: parent.version,
            ...(parent.itemKind ? { itemKind: parent.itemKind } : {}),
          },
          startDate: parent.goal.startDate,
          endDate: parent.goal.endDate,
        },
      });
    } catch {
      /* Provider displays the error and keeps the selected scope. */
    }
  }
  async function completeDepartmentSetup() {
    if (departmentPlan) {
      if (departmentPlan.permissions.canEdit) openSettings(departmentPlan);
      return;
    }
    if (!relatedDepartment || !canCreateDepartment) {
      setSetupNotice(
        relatedDepartment
          ? `Ask your department manager to create the ${relatedDepartment.name} plan for ${planningPeriodLabel(cycle)}. Your draft is saved and you can keep working on it.`
          : "Your employee record needs a department in EMS. Ask your EMS administrator to confirm it; your saved draft stays available.",
      );
      return;
    }
    if (busy) return;
    try {
      const savedId = await run("CREATE_PLAN", {
        kind: "DEPARTMENT",
        scopeId: relatedDepartment.id,
        cycle,
        title: `${relatedDepartment.name} · ${planningPeriodLabel(cycle)}`,
      });
      setSettingsId(savedId);
    } catch {
      /* Keep the individual plan open; the provider displays errors. */
    }
  }
  function resolveIssue(plan: Plan, issue: string) {
    setReview(false);
    const collections: [ItemKind, { id: string; code: string }[]][] = [
      ["finding", plan.data.findings],
      ["objective", plan.data.objectives],
      ["goal", plan.data.goals],
      ["assignment", plan.data.assignments],
      ["action", plan.data.actions],
    ];
    for (const [kind, items] of collections) {
      const item = items.find((value) => issue.startsWith(`${value.code}:`));
      if (item) {
        if (
          kind === "goal" &&
          (issue.includes("add a KPI assignment") ||
            issue.includes("add a delivery action"))
        ) {
          const goal = plan.data.goals.find((goal) => goal.id === item.id)!;
          setEdit({
            document: plan,
            kind: issue.includes("KPI assignment") ? "assignment" : "action",
            initial: {
              goalId: goal.id,
              ownerId: goal.ownerId,
              startDate: goal.startDate,
              endDate: goal.endDate,
              dueDate: goal.endDate,
            },
          });
          return;
        }
        setEdit({
          document: plan,
          kind,
          initial: { ...item },
        });
        return;
      }
    }
    if (issue.startsWith("Consider ")) {
      router.push("/leadership-excellence/performance-planning/swot-findings");
    } else if (issue.includes("before submitting. Your draft")) {
      void completeDepartmentSetup();
    } else if (issue.includes("at least one objective")) {
      setEdit({ document: plan, kind: "objective" });
    } else if (issue.includes("at least one goal")) {
      setEdit({
        document: plan,
        kind: plan.kind === "COMPANY" ? "objective" : "goal",
      });
    } else openSettings(plan);
  }
  const personName = (personId: string) =>
    data.references.people.find((person) => person.id === personId)?.name ||
    "Not assigned";
  const handoffParent =
    section === "department" &&
    contributionContext?.cycle === cycle &&
    contributionContext.departmentId === scopeId
      ? data.approvedParentGoals?.find(
          (parent) =>
            parent.documentId === contributionContext.parent.documentId &&
            parent.goal.id === contributionContext.parent.goalId &&
            (parent.itemKind || "GOAL") ===
              (contributionContext.parent.itemKind || "GOAL") &&
            parent.version === contributionContext.parent.version &&
            parent.cycle === cycle &&
            parent.goal.departmentIds.includes(scopeId),
        )
      : undefined;
  const orphanDelivery = document && {
    ...document,
    data: {
      ...document.data,
      assignments: document.data.assignments.filter(
        (item) => !document.data.goals.some((goal) => goal.id === item.goalId),
      ),
      actions: document.data.actions.filter(
        (item) => !document.data.goals.some((goal) => goal.id === item.goalId),
      ),
      actionLinks: (document.data.actionLinks || []).filter(
        (item) => !document.data.goals.some((goal) => goal.id === item.goalId),
      ),
    },
  };
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5 text-slate-900">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Leadership Excellence</span>
            <ChevronRight size={12} />
            <span>Performance planning &amp; alignment</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Performance planning
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Save once. Find it in the register. Link each contribution to its
            approved objective or department goal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {section === "company" && <PlanningStrategyMap cycle={cycle} />}
          <PlanningYearPicker
            value={cycle}
            years={cycles}
            onChange={(year, created) => {
              setCycle(year);
              setId("");
              setReview(false);
              setHistory(false);
              setPendingSources([]);
              setPendingObjective(null);
              setContributionContext(null);
              setPlanFocus("");
              setRegisterFocus(null);
              if (created && section === "company") {
                setSwotOpen(true);
                setTab("swot");
              }
            }}
          />
        </div>
      </header>
      <PlanningFlowNav active={section} />
      {section !== "company" && (
        <section
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4"
          aria-label="Your next step"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-700">
              YOUR NEXT STEP
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {section === "department"
                ? "Choose a department. Add its contribution, then assign KPIs and actions below that goal."
                : section === "personal"
                  ? "Choose a person. Agree their contribution and reuse department work where relevant."
                  : "Complete any missing details, then send each plan to its single approver."}
            </p>
          </div>
          {document && (
            <Button variant="outline" onClick={() => setReview(true)}>
              Check readiness <ArrowRight size={14} />
            </Button>
          )}
        </section>
      )}
      {section === "company" && !document && (
        <Empty
          title="Create your company objective plan"
          action={
            canCreate ? (
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    const savedId = await run("CREATE_PLAN", {
                      kind: "COMPANY",
                      cycle,
                      title: `Company plan · ${planningPeriodLabel(cycle)}`,
                    });
                    setPendingEditor({
                      documentId: savedId,
                      kind: "objective",
                    });
                  } catch {
                    /* Provider retains the error and form context. */
                  }
                }}
              >
                <Plus size={16} /> Create objective
              </Button>
            ) : undefined
          }
        >
          Start with reviewed SWOT evidence. Save incomplete drafts and add
          measurable goals under each objective.
        </Empty>
      )}
      {(section === "department" || section === "personal") && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-4">
            {section === "personal" && personalKinds.length > 1 && (
              <div className="w-full sm:w-44">
                <Field label="Plan for">
                  <select
                    className={control}
                    value={personalKind}
                    onChange={(event) => {
                      setPersonalKind(
                        event.target.value as typeof personalKind,
                      );
                      setScopeSelection({ cycle, id: "" });
                      setId("");
                    }}
                  >
                    {personalKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind === "INDIVIDUAL"
                          ? "Individual"
                          : kind === "TEAM"
                            ? "Team / section"
                            : "Position"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <div className="min-w-0 flex-1 basis-64">
              <Field
                label={
                  section === "department"
                    ? "Department"
                    : personalKind === "INDIVIDUAL"
                      ? "Employee"
                      : personalKind === "TEAM"
                        ? "EMS team / section"
                        : "EMS position"
                }
              >
                <select
                  className={control}
                  value={scopeId}
                  disabled={!scopeOptions.length}
                  onChange={(event) => {
                    setScopeSelection({ cycle, id: event.target.value });
                    setId("");
                    setReview(false);
                  }}
                >
                  <option value="">
                    {scopeOptions.length
                      ? "Choose..."
                      : "No EMS records available"}
                  </option>
                  {scopeOptions.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {selectedScope && !document && canCreate && (
              <Button disabled={busy} onClick={() => void createScopedDraft()}>
                Create draft <Plus size={15} />
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {section === "personal" && relatedDepartment
              ? `EMS department: ${relatedDepartment.name} · `
              : ""}
            Planning period {planningPeriodLabel(cycle)}.{" "}
            {section === "personal" && personalKind === "INDIVIDUAL"
              ? "Employee details come from EMS; goals come from approved company or department plans you can access, including other departments."
              : "People and departments come from EMS."}{" "}
            You can save an incomplete draft and finish setup later.
          </p>
          {section === "personal" &&
            personalKind === "TEAM" &&
            !scopeOptions.length && (
              <p className="mt-2 text-sm text-amber-800">
                Teams use Department and Section / Area from EMS. Choose
                Individual to plan for one person, or ask your EMS administrator
                to set up the team.
              </p>
            )}
        </section>
      )}
      {(section === "department" || section === "personal") &&
        selectedScope && (
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Browse approved parent goals
            </summary>
            <PlanningApprovedGoals
              child={{
                id: document?.id,
                kind: scopeKind,
                cycle,
                scopeId,
                departmentId: relatedDepartmentId || "",
              }}
              canLink={document ? document.permissions.canEdit : canCreate}
              busy={busy}
              onLink={(parent) => void linkApprovedGoal(parent)}
            />
          </details>
        )}
      {section === "personal" &&
        personalKind !== "INDIVIDUAL" &&
        relatedDepartment &&
        !departmentPlan && (
          <section
            aria-label="Department setup"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4"
          >
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-amber-900">
                {relatedDepartment.name} plan needs setup
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                You can save this person&apos;s draft now. Create the department
                plan for {planningPeriodLabel(cycle)} before submitting.
                Approved department goals will then be available for linking.
              </p>
            </div>
            {canCreateDepartment ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void completeDepartmentSetup()}
              >
                Create {relatedDepartment.name} draft
              </Button>
            ) : (
              <p className="text-xs text-amber-800">
                Ask your department manager to complete this setup.
              </p>
            )}
          </section>
        )}
      {handoffParent && (
        <section
          aria-label="Selected company objective"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4"
        >
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-xs text-slate-500">
              Contributing to company{" "}
              {handoffParent.itemKind === "OBJECTIVE" ? "objective" : "goal"} ·
              approved v{handoffParent.version}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {handoffParent.goal.title}
            </p>
          </div>
          {document?.permissions.canEdit && (
            <Button
              onClick={() =>
                setEdit({
                  document,
                  kind: "goal",
                  initial: {
                    parent: contributionContext!.parent,
                    startDate: handoffParent.goal.startDate,
                    endDate: handoffParent.goal.endDate,
                  },
                })
              }
            >
              Add contribution
            </Button>
          )}
          <Button variant="ghost" onClick={() => setContributionContext(null)}>
            Clear selection
          </Button>
        </section>
      )}
      {section === "company" && !document ? null : section === "approval" &&
        !document ? (
        <PlanCollection
          key={`${section}/${cycle}`}
          documents={documents}
          section={section}
          onOpen={setId}
        />
      ) : !document ? (
        <Empty
          title={
            section === "company"
              ? "Your company plan starts here"
              : selectedScope
                ? `Start ${selectedScope.name}'s plan`
                : "Choose who this plan is for"
          }
          action={
            section === "company" && canCreate ? (
              <Button onClick={startFromSwot}>
                Start from reviewed SWOT <ArrowRight size={14} />
              </Button>
            ) : undefined
          }
        >
          {section === "company"
            ? "Choose a reviewed finding above to create a measurable company objective."
            : selectedScope
              ? "Create a draft above. Add the contribution first; KPIs and actions stay beside it."
              : "Select a department, employee, team or position above. The same planning period carries through all six steps."}
        </Empty>
      ) : (
        <div className="min-w-0 space-y-4">
          {section === "approval" && (
            <button
              type="button"
              onClick={() => setId("")}
              className="inline-flex items-center gap-2 text-sm text-slate-500"
            >
              <ArrowLeft size={14} /> All plans for review
            </button>
          )}
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {section === "company" ? "Company plan" : titleOf(document)}
                  </h2>
                  <Status
                    status={document.status}
                    swot={document.kind === "SWOT"}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Owner: {personName(document.data.ownerId)} · Approver:{" "}
                  {personName(document.data.approverId)} ·{" "}
                  {document.data.startDate || "Start date not set"} —{" "}
                  {document.data.endDate || "End date not set"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {document.permissions.canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openSettings(document)}
                  >
                    Plan settings
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReview(true)}
                >
                  Review & approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistory(true)}
                >
                  History
                </Button>
              </div>
            </div>
          </section>
          {section === "approval" && (
            <section className={card}>
              <h3 className="mb-4 font-semibold">Complete the plan</h3>
              <Readiness
                document={document}
                onResolve={(issue) => resolveIssue(document, issue)}
              />
              <div className="mt-5">
                <ApprovalActions
                  document={document}
                  onResolve={(issue) => resolveIssue(document, issue)}
                />
              </div>
            </section>
          )}
          {document.kind === "SWOT" ? (
            <SwotBoard key={document.id} document={document} edit={setEdit} />
          ) : (
            <>
              {pendingSources.length > 0 && document.kind === "COMPANY" && (
                <section className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
                  <p className="flex-1">
                    {pendingSources.length} reviewed findings selected.{" "}
                    {document.permissions.canEdit
                      ? "Continue with your objective."
                      : "Open a dated revision to use these findings."}
                  </p>
                  <Button
                    disabled={!document.permissions.canEdit}
                    onClick={() => {
                      setSourceLinks(pendingSources);
                      setObjectiveId("");
                    }}
                  >
                    Continue from selected findings
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingSources([])}>
                    Clear
                  </Button>
                </section>
              )}
              {
                <Register
                  key={document.id}
                  document={document}
                  edit={setEdit}
                  onStartFromSwot={canSeeSwot ? startFromSwot : undefined}
                  onPlanContributions={setContributionGoal}
                />
              }
              {orphanDelivery &&
                document.kind !== "COMPANY" &&
                orphanDelivery.data.assignments.length +
                  orphanDelivery.data.actions.length +
                  (orphanDelivery.data.actionLinks?.length || 0) >
                  0 && (
                  <details className="rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Unlinked draft KPIs & actions · choose their goal to
                      finish setup
                    </summary>
                    <div className="mt-4">
                      <Delivery
                        document={orphanDelivery}
                        fullDocument={document}
                        edit={(value) => setEdit({ ...value, document })}
                      />
                    </div>
                  </details>
                )}
            </>
          )}
          {section === "company" && (
            <p className="text-xs leading-5 text-slate-500">
              Company achievement comes from its own verified measures.
              Department contributions remain distinct.
            </p>
          )}
        </div>
      )}
      <PlanningGuide section={section} />
      {data.references.refreshedAt && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">Shared organisation data</summary>
          <p className="mt-2 leading-5">
            People and departments: {data.references.source || "EMS"} &middot;
            Refreshed{" "}
            {planningTime(
              data.references.refreshedAt,
              data.references.timeZone,
            )}{" "}
            ({data.references.timeZone || "UTC"}). Update organisation records
            in EMS.
          </p>
        </details>
      )}
      {section === "approval" && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            Backup &amp; restore
          </summary>
          <div className="mt-4">
            <PlanningBackup />
          </div>
        </details>
      )}
      {review && document && (
        <Modal title="Check & approval" onClose={() => setReview(false)}>
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900">
                {titleOf(document)}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Planning period {planningPeriodLabel(document.cycle)} &middot;
                The whole plan is checked together.
              </p>
            </div>
            <Readiness
              document={document}
              onResolve={(issue) => resolveIssue(document, issue)}
            />
            <ApprovalActions
              document={document}
              onResolve={(issue) => resolveIssue(document, issue)}
            />
          </div>
        </Modal>
      )}
      {history && document && (
        <Modal
          title="Version & audit history"
          onClose={() => setHistory(false)}
          wide
        >
          <History document={document} expanded />
        </Modal>
      )}
      {contributionGoal && document && (
        <Modal
          title="Plan department contributions"
          onClose={() => setContributionGoal(null)}
        >
          <p className="mb-4 text-sm text-slate-500">
            {contributionGoal.title} · Planning period{" "}
            {planningPeriodLabel(cycle)}. Choose a contributing department; its
            targets will be planned separately.
          </p>
          <div className="space-y-3">
            {contributionGoal.departmentIds
              .filter(
                (departmentId) =>
                  !["HOD", "EMPLOYEE"].includes(data.actor.role) ||
                  departmentId === data.actor.departmentId,
              )
              .map((departmentId) => {
                const department = data.references.departments.find(
                  (d) => d.id === departmentId,
                );
                const parent = data.approvedParentGoals
                  ?.filter(
                    (candidate) =>
                      candidate.documentId === document.id &&
                      candidate.itemKind === "OBJECTIVE" &&
                      candidate.goal.id === contributionGoal.id &&
                      candidate.cycle === cycle &&
                      candidate.goal.departmentIds.includes(departmentId),
                  )
                  .sort((a, b) => b.version - a.version)[0];
                const existing = data.documents.find(
                  (d) =>
                    d.kind === "DEPARTMENT" &&
                    d.scopeId === departmentId &&
                    d.cycle === cycle,
                );
                return (
                  <button
                    key={departmentId}
                    type="button"
                    disabled={!parent || !department}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => {
                      if (!parent) return;
                      setCycle(cycle);
                      setContributionContext({
                        cycle,
                        departmentId,
                        parent: {
                          documentId: parent.documentId,
                          goalId: parent.goal.id,
                          version: parent.version,
                          ...(parent.itemKind
                            ? { itemKind: parent.itemKind }
                            : {}),
                        },
                      });
                      router.push(
                        "/leadership-excellence/performance-planning/department-plans",
                      );
                      setContributionGoal(null);
                    }}
                  >
                    <span>
                      <strong className="block">
                        {department?.name || "Department unavailable"}
                      </strong>
                      <span className="mt-1 block text-xs text-slate-500">
                        {parent
                          ? existing
                            ? "Open existing department plan"
                            : "Start a department draft"
                          : "Approve this company objective first"}
                      </span>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                );
              })}
            {!contributionGoal.departmentIds.some(
              (departmentId) =>
                !["HOD", "EMPLOYEE"].includes(data.actor.role) ||
                departmentId === data.actor.departmentId,
            ) && (
              <p className="text-sm text-slate-500">
                No contributing department is available to your role. The
                objective owner can choose contributing departments before
                finalising the objective.
              </p>
            )}
          </div>
        </Modal>
      )}
      {setupNotice && (
        <Modal title="Department setup" onClose={() => setSetupNotice("")}>
          <p className="text-sm leading-6">{setupNotice}</p>
          <Button className="mt-5" onClick={() => setSetupNotice("")}>
            Continue with my draft
          </Button>
        </Modal>
      )}
      {create && (
        <NewPlan
          kinds={
            newKind
              ? [newKind]
              : companyDraft
                ? ["COMPANY"]
                : section === "personal" && data.actor.role === "EMPLOYEE"
                  ? ["INDIVIDUAL"]
                  : kinds
          }
          initialCycle={companyDraft || cycle}
          lockCycle={!!companyDraft && pendingSources.length > 0}
          onClose={() => {
            setCreate(false);
            setNewKind(null);
            setCompanyDraft(null);
            setPendingSources([]);
          }}
          onCreated={(newId, newCycle) => {
            setId(newId);
            setCycle(newCycle);
            if (newKind === "SWOT") {
              setSwotOpen(true);
              setTab("swot");
            }
            if (companyDraft && pendingSources.length) {
              setTab("objectives");
              setPendingObjective({
                documentId: newId,
                sources: pendingSources,
              });
            }
          }}
        />
      )}
      {createGoal && (
        <PlanningCreateGoal
          cycle={cycle}
          onClose={() => setCreateGoal(false)}
          onReady={(documentId, kind, initial) =>
            setPendingEditor({ documentId, kind, initial })
          }
          onOpen={openPlan}
        />
      )}
      {settingsDocument && (
        <PlanSettings
          key={settingsDocument.id}
          document={settingsDocument}
          onClose={() => setSettingsId("")}
        />
      )}
      {activeEdit &&
        (data.documents.find((d) => d.id === activeEdit.document.id)
          ?.permissions.canEdit ? (
          <ItemEditor
            key={`${activeEdit.document.id}/${activeEdit.kind}/${String(activeEdit.initial?.id || "new")}`}
            {...activeEdit}
            document={editorDocument!}
            initial={editorInitial}
            onClose={closeEditor}
            onSaved={(savedId) => {
              if (
                activeEdit.kind === "objective" ||
                activeEdit.kind === "goal"
              ) {
                setRegisterFocus({
                  documentId: activeEdit.document.id,
                  itemId: savedId,
                });
                setCycle(activeEdit.document.cycle);
                const destination =
                  activeEdit.document.kind === "COMPANY"
                    ? "objectives"
                    : activeEdit.document.kind === "DEPARTMENT"
                      ? "department-plans"
                      : "team-individual-plans";
                router.push(
                  `/leadership-excellence/performance-planning/${destination}`,
                );
              }
            }}
          />
        ) : (
          <ReadItem edit={activeEdit} onClose={closeEditor} />
        ))}
      {sourceLinks && (
        <Modal
          title="Use reviewed findings"
          onClose={() => setSourceLinks(null)}
        >
          <div className="space-y-5">
            <ErrorList error={linkError} />
            <p className="text-sm">
              {sourceLinks.length} reviewed finding(s) selected. These are the
              source for the measurable company objective.
            </p>
            <ReviewedSources sources={sourceLinks} />
            {companyPlan ? (
              <>
                <Field label="Objective">
                  <select
                    className={control}
                    value={objectiveId}
                    onChange={(e) => setObjectiveId(e.target.value)}
                  >
                    <option value="">Create a new objective</option>
                    {companyPlan.data.objectives.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code || "Code pending"} · {o.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button disabled={busy} onClick={() => void linkObjective()}>
                  Continue
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  {existingCompanyPlan
                    ? "This company plan is locked. Open its dated revision to continue; your selected findings will stay with you."
                    : "Create the company plan for this year. Your selected findings will carry into the objective automatically."}
                </p>
                <Button
                  onClick={() => {
                    setPendingSources(sourceLinks);
                    if (existingCompanyPlan) {
                      setSourceLinks(null);
                      setTab("objectives");
                      setId(existingCompanyPlan.id);
                      return;
                    }
                    setCompanyDraft(cycle);
                    setSourceLinks(null);
                    setTab("objectives");
                    setCreate(true);
                  }}
                >
                  {existingCompanyPlan
                    ? "Open existing company plan"
                    : "Create plan & continue"}
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
