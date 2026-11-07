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
import { Button } from "@/components/ui/button";
import type {
  Finding,
  Goal,
  ItemKind,
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
import { PlanningRegister as Register } from "./PlanningRegister";
import { PlanningSteps, PlanCollection, Readiness } from "./PlanningOverview";
import {
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
  const [kind, setKind] = useState(initialKind),
    [cycle, setCycle] = useState(
      initialCycle || String(new Date().getFullYear()),
    ),
    [scopeId, setScope] = useState(
      data.actor.role === "EMPLOYEE" ? data.actor.employeeId : "",
    ),
    [title, setTitle] = useState(""),
    [error, setError] = useState("");
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
          try {
            onCreated(
              await run("CREATE_PLAN", { kind, cycle, scopeId, title }),
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
                    ? "Company objective & goal plan"
                    : `${k[0]}${k.slice(1).toLowerCase()} plan`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Planning year">
          <input
            className={control}
            type="number"
            min={2000}
            max={2200}
            value={cycle}
            readOnly={lockCycle}
            onChange={(e) => setCycle(e.target.value)}
          />
        </Field>
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
            className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
          >
            <Info size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-3">
              <p className="font-medium">No EMS teams are available yet.</p>
              <p className="leading-6 text-muted-foreground">
                Teams use active employees with the same department and Section
                / Area in EMS. To set up a team, an EMS administrator can open
                an employee&apos;s Work Allocation and fill in Department and
                Section / Area for its members. Then refresh teams here.
              </p>
              <p className="text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">
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
        <p className="text-sm text-muted-foreground">
          One record per scope and planning year. Start with a draft, then set
          its dates, owner and single approver.
        </p>
        <Button type="submit" disabled={busy || !validScope}>
          Create draft
        </Button>
      </form>
    </Modal>
  );
}

function ApprovalActions({
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
                <p className="text-sm text-muted-foreground">
                  The previous approved version remains available. A future
                  revision takes effect only on its effective date.
                </p>
              </>
            )}
            <div className="flex justify-end gap-3">
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
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Status status={document.status} swot={document.kind === "SWOT"} />
            <span className="text-xs text-muted-foreground">
              {document.code}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
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
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
        <LockKeyhole
          className="mt-0.5 shrink-0 text-muted-foreground"
          size={17}
        />
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
        <div className="min-w-0 flex-1 basis-72 text-sm text-muted-foreground">
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    {category.hint}
                  </p>
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
                    className="w-full rounded-lg border border-white/80 bg-card p-4 text-left shadow-sm transition hover:shadow-md"
                  >
                    <div className="mb-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {f.code}
                        {f.pillar !== pillar
                          ? ` · Shared from ${f.pillar}`
                          : ""}
                      </span>
                      <FindingWeightage weightage={f.weightage} />
                    </div>
                    <p className="text-sm font-medium text-gemba-navy">
                      {f.title}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {responseLabels[f.response]}
                      {f.basis === "NEEDS_CHECKING" ? " · Needs checking" : ""}
                    </p>
                  </button>
                ))}
                {!findings.length && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
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
      <h2 className="font-semibold text-gemba-navy">
        Summary & management decisions
      </h2>
      <p className="text-xs text-muted-foreground">
        Highest weightage first; unassessed findings appear last. Priority is
        derived from weightage: Low 1–3, Medium 4–6, High 7–10.
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
        <p className="text-xs text-muted-foreground">
          Finalise the assessment before selecting sources for objectives. You
          can record decisions while it is a draft.
        </p>
      )}
      <div className="divide-y divide-border">
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
                <span className="text-xs text-muted-foreground">
                  {f.code} · {f.pillar} · {categories[f.category].singular}
                </span>
                <p className="mt-1 text-sm font-medium text-gemba-navy">
                  {f.title}
                </p>
                <div className="mt-2">
                  <FindingWeightage weightage={f.weightage} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
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
            <ChevronRight size={15} className="mt-3 text-muted-foreground" />
          </div>
        ))}
      </div>
      {!rows.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">
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
              className="block w-full rounded-lg border border-border p-4 text-left"
            >
              <span className="text-xs text-muted-foreground">
                {a.code} · {data.kras.find((r) => r.id === k?.kraId)?.name}
              </span>
              <h3 className="mt-1 font-medium">
                {k?.name || "KPI not selected"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
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
                <p className="mt-1 text-xs text-muted-foreground">
                  {
                    a.targets.filter((period) => period.scheduled === false)
                      .length
                  }{" "}
                  non-working dates not scheduled
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {document.data.goals.find((g) => g.id === a.goalId)?.title ||
                  "Goal not selected"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">
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
            className="block w-full rounded-lg border border-border p-4 text-left"
          >
            <span className="text-xs text-muted-foreground">
              {a.code}
              {a.parentActionId ? " · Sub-action" : ""} · Due{" "}
              {a.dueDate || "not set"}
            </span>
            <p className="mt-1 font-medium">{a.title || "Untitled action"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.expectedResult || "Expected result not set"}
            </p>
          </button>
        ))}
        {!document.data.actions.length && (
          <p className="text-sm text-muted-foreground">
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

function History({
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
        <p className="text-xs text-muted-foreground">
          Times shown in {data.references.timeZone || "UTC"}. Previous approvals
          remain available during revisions.
        </p>
        {document.versions.map((v) => (
          <details
            key={v.version}
            className="rounded-lg border border-border p-3"
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
                  <span className="text-muted-foreground">{item.code}</span> —{" "}
                  {item.title || "Untitled"}
                </p>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {v.data.assignments.length} KPI assignments preserved with this
              version.
            </p>
          </details>
        ))}
        {document.history
          .slice()
          .reverse()
          .map((event) => (
            <div key={event.id} className="border-b border-border pb-2 text-xs">
              <p className="font-medium">
                {event.action}
                {event.detail ? ` · ${event.detail}` : ""}
              </p>
              <p className="mt-1 text-muted-foreground">
                {event.actorName} ·{" "}
                {planningTime(event.at, data.references.timeZone)}
              </p>
              <AuditChanges event={event} />
            </div>
          ))}
        {!document.versions.length && !document.history.length && (
          <p className="text-sm text-muted-foreground">
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
      const parent = v as {
        documentId: string;
        goalId: string;
        version: number;
      };
      const plan = data.documents.find((d) => d.id === parent.documentId);
      const goal = plan?.versions
        .find((version) => version.version === parent.version)
        ?.data.goals.find((g) => g.id === parent.goalId);
      return `${goal?.title || "Approved parent goal"} · v${parent.version}`;
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
      <p className="mb-4 text-sm text-muted-foreground">
        Read-only record. Approved information can be changed only through a
        dated revision.
      </p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {edit.kind === "finding" && (
          <div className="min-w-0 rounded-lg bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">
              Weightage & priority
            </dt>
            <dd className="mt-1">
              <FindingWeightage weightage={value.weightage} />
            </dd>
            {!validFindingWeightage(value.weightage) &&
              edit.document.status === "APPROVED" &&
              typeof value.priority === "string" &&
              ["HIGH", "MEDIUM", "LOW"].includes(value.priority) && (
                <dd className="mt-2 text-xs text-muted-foreground">
                  Previous priority (before weightage): {value.priority}
                </dd>
              )}
          </div>
        )}
        {Object.entries(value)
          .filter(([key]) => !skip.has(key))
          .map(([key, v]) => (
            <div key={key} className="min-w-0 rounded-lg bg-muted/50 p-3">
              <dt className="text-xs capitalize text-muted-foreground">
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
    [personalKind, setPersonalKind] =
      useState<PlanningDocument["kind"]>("INDIVIDUAL"),
    [scopeSelection, setScopeSelection] = useState({
      cycle,
      id:
        section === "department" && contributionContext?.cycle === cycle
          ? contributionContext.departmentId
          : "",
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
    [id, setId] = useState(""),
    [create, setCreate] = useState(false),
    [companyDraft, setCompanyDraft] = useState<string | null>(null),
    [edit, setEdit] = useState<Edit | null>(null),
    [sourceLinks, setSourceLinks] = useState<SourceLink[] | null>(null),
    [objectiveId, setObjectiveId] = useState("");
  const tab = canSeeSwot ? requestedTab : "objectives";
  const { run, busy } = usePlanning();
  const [linkError, setLinkError] = useState("");
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
  ).filter((scope) =>
    data.actor.role === "EMPLOYEE"
      ? scopeKind === "DEPARTMENT"
        ? scope.id === data.actor.departmentId
        : scopeKind === "INDIVIDUAL" && scope.id === data.actor.employeeId
      : data.actor.role === "HOD"
        ? scope.departmentId === data.actor.departmentId
        : true,
  );
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
  const activeEdit: Edit | null =
    edit ||
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
  const startFromSwot = () => {
    if (section !== "company") {
      router.push("/leadership-excellence/performance-planning/objectives");
      return;
    }
    setTab("summary");
    setSwotOpen(true);
  };
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
        title: `${scope.name} · ${cycle}`,
      });
      setId(savedId);
      setScopeSelection({ cycle, id: scope.id });
    } catch {
      /* The provider keeps the entered scope and displays the error. */
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
          ? `Ask your department manager to create the ${relatedDepartment.name} plan for ${cycle}. Your draft is saved and you can keep working on it.`
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
        title: `${relatedDepartment.name} · ${cycle}`,
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
          kind:
            kind === "objective" &&
            issue.includes("add a measurable linked goal")
              ? "goal"
              : kind,
          initial:
            kind === "objective" &&
            issue.includes("add a measurable linked goal")
              ? { objectiveId: item.id }
              : { ...item },
        });
        return;
      }
    }
    if (issue.startsWith("Consider ")) {
      if (section === "company") {
        setSwotOpen(true);
        setTab("swot");
      } else setTab("swot");
    } else if (issue.includes("before submitting. Your draft")) {
      void completeDepartmentSetup();
    } else if (issue.includes("at least one objective")) {
      setEdit({ document: plan, kind: "objective" });
    } else if (issue.includes("at least one goal")) {
      setEdit({ document: plan, kind: "goal" });
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
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Leadership Excellence</span>
            <ChevronRight size={12} />
            <span>Performance planning &amp; alignment</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gemba-navy sm:text-3xl">
            Performance planning
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start with SWOT. Turn reviewed findings into objectives, goals and
            clear contributions.
          </p>
        </div>
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
            if (created && section === "company") {
              setSwotOpen(true);
              setTab("swot");
            }
          }}
        />
      </header>
      <PlanningSteps section={section} />
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4"
        aria-label="Your next step"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-700">YOUR NEXT STEP</p>
          <p className="mt-1 text-sm text-gemba-navy">
            {section === "company"
              ? "Review SWOT findings, then agree your company objectives and measurable goals."
              : section === "department"
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
      {section === "company" && canSeeSwot && (
        <details
          open={swotOpen}
          onToggle={(event) => setSwotOpen(event.currentTarget.open)}
          className="rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <summary className="cursor-pointer text-sm font-semibold text-gemba-navy">
            SWOT findings{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {swotDocument
                ? `${swotDocument.data.findings.length} findings · ${swotDocument.status === "APPROVED" ? "Reviewed" : "Draft"}`
                : "Start your business assessment"}
            </span>
          </summary>
          <div className="mt-5 space-y-4">
            {swotDocument ? (
              <>
                <PlanBar
                  document={swotDocument}
                  onSettings={() => openSettings(swotDocument)}
                  onResolve={(issue) => resolveIssue(swotDocument, issue)}
                />
                <Tabs
                  label="SWOT view"
                  value={tab === "swot" ? "swot" : "summary"}
                  onChange={setTab}
                  items={[
                    ["swot", "Findings by pillar"],
                    ["summary", "Reviewed findings & decisions"],
                  ]}
                />
                {tab === "swot" ? (
                  <SwotBoard
                    key={swotDocument.id}
                    document={swotDocument}
                    edit={setEdit}
                  />
                ) : (
                  <SwotSummary
                    key={`${swotDocument.id}/${swotDocument.status}`}
                    document={swotDocument}
                    edit={setEdit}
                    onUse={(links) => {
                      setSourceLinks(links);
                      setObjectiveId("");
                      setLinkError("");
                    }}
                  />
                )}
                <History document={swotDocument} />
              </>
            ) : (
              <Empty
                title="Add your first SWOT findings"
                action={
                  canCreate ? (
                    <Button
                      onClick={() => {
                        setNewKind("SWOT");
                        setCreate(true);
                      }}
                    >
                      Start SWOT assessment
                    </Button>
                  ) : undefined
                }
              >
                Record business findings, consider the six pillars and have the
                assessment reviewed before finalising company objectives.
              </Empty>
            )}
          </div>
        </details>
      )}
      {(section === "department" || section === "personal") && (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-4">
            {section === "personal" && data.actor.role !== "EMPLOYEE" && (
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
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="TEAM">Team / section</option>
                    <option value="POSITION">Position</option>
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
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {section === "personal" && relatedDepartment
              ? `${relatedDepartment.name} · `
              : ""}
            Planning year {cycle}. Your selections come from EMS. You can save
            an incomplete draft and finish setup later.
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
      {section === "personal" && relatedDepartment && !departmentPlan && (
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
              plan for {cycle} before submitting. Approved department goals will
              then be available for linking.
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
          aria-label="Selected company goal"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4"
        >
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-xs text-muted-foreground">
              Contributing to company goal · approved v{handoffParent.version}
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
      {section === "approval" && !document ? (
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
            ? "Choose a reviewed finding above to create an objective and its first measurable goal."
            : selectedScope
              ? "Create a draft above. Add the contribution first; KPIs and actions stay beside it."
              : "Select a department, employee, team or position above. The same planning year carries through all four steps."}
        </Empty>
      ) : (
        <div className="min-w-0 space-y-4">
          {section === "approval" && (
            <button
              type="button"
              onClick={() => setId("")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <ArrowLeft size={14} /> All plans for review
            </button>
          )}
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-gemba-navy">
                    {section === "company"
                      ? "Objectives & goals"
                      : titleOf(document)}
                  </h2>
                  <Status
                    status={document.status}
                    swot={document.kind === "SWOT"}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
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
              <Register
                key={document.id}
                document={document}
                edit={setEdit}
                onStartFromSwot={canSeeSwot ? startFromSwot : undefined}
                onPlanContributions={setContributionGoal}
              />
              {orphanDelivery &&
                document.kind !== "COMPANY" &&
                orphanDelivery.data.assignments.length +
                  orphanDelivery.data.actions.length +
                  (orphanDelivery.data.actionLinks?.length || 0) >
                  0 && (
                  <details className="rounded-xl border border-border bg-card p-4">
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
            <p className="text-xs leading-5 text-muted-foreground">
              Company achievement comes from its own verified measures.
              Department contributions remain distinct.
            </p>
          )}
        </div>
      )}
      <PlanningGuide section={section} />
      {data.references.refreshedAt && (
        <details className="text-xs text-muted-foreground">
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
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
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
              <h3 className="font-semibold text-gemba-navy">
                {titleOf(document)}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Planning year {document.cycle} &middot; The whole plan is
                checked together.
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
          <p className="mb-4 text-sm text-muted-foreground">
            {contributionGoal.title} · Planning year {cycle}. Choose a
            contributing department; its targets will be planned separately.
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
                const parent = data.approvedParentGoals?.find(
                  (candidate) =>
                    candidate.documentId === document.id &&
                    candidate.goal.id === contributionGoal.id &&
                    candidate.cycle === cycle &&
                    candidate.goal.departmentIds.includes(departmentId),
                );
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
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-4 text-left text-sm hover:bg-muted/30 disabled:opacity-50"
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
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {parent
                          ? existing
                            ? "Open existing department plan"
                            : "Start a department draft"
                          : "Approve this company goal first"}
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
              <p className="text-sm text-muted-foreground">
                No contributing department is available to your role. The goal
                owner can choose contributing departments before finalising the
                goal.
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
            onSaved={(savedId, continueToGoal) => {
              if (activeEdit.kind === "objective" && continueToGoal)
                setEdit({
                  document: activeEdit.document,
                  kind: "goal",
                  initial: { objectiveId: savedId },
                });
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
              source for the objective and its linked goals.
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
                <p className="text-sm text-muted-foreground">
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
