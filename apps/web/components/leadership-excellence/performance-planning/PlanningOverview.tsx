"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Info,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlanningView } from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { card, control, Empty, Status } from "./PlanningUi";

type Plan = PlanningView["documents"][number];
export type PlanningSection =
  | "company"
  | "department"
  | "personal"
  | "approval";
const BASE = "/leadership-excellence/performance-planning";
const stages = [
  {
    section: "company",
    path: "objectives",
    label: "Company plan",
    hint: "SWOT → objectives → goals",
  },
  {
    section: "department",
    path: "department-plans",
    label: "Department plans",
    hint: "Distinct contributions",
  },
  {
    section: "personal",
    path: "team-individual-plans",
    label: "Individual plans",
    hint: "Team & individual commitments",
  },
  {
    section: "approval",
    path: "check-approve",
    label: "Review & approve",
    hint: "Check & approve",
  },
] as const;

export function PlanningSteps({ section }: { section: PlanningSection }) {
  return (
    <nav
      aria-label="Planning stages"
      className="grid w-full grid-cols-4 rounded-xl border border-border bg-card p-1.5"
    >
      {stages.map((stage, index) => (
        <Link
          key={stage.section}
          href={`${BASE}/${stage.path}`}
          aria-current={section === stage.section ? "page" : undefined}
          className={`relative flex min-w-0 flex-col items-center gap-2 rounded-lg px-1.5 py-3 text-center transition sm:flex-row sm:gap-3 sm:px-3 sm:text-left ${section === stage.section ? "bg-slate-100 text-gemba-navy" : "text-muted-foreground hover:bg-muted/60"}`}
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs sm:size-8 ${section === stage.section ? "border-gemba-navy bg-gemba-navy text-white" : "border-border bg-card"}`}
          >
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] leading-4 font-semibold sm:text-xs xl:text-sm">
              {stage.label}
            </span>
            <span className="mt-0.5 hidden text-[11px] leading-4 text-muted-foreground xl:block">
              {stage.hint}
            </span>
          </span>
          {index < 3 && (
            <ChevronRight
              size={13}
              className="ml-auto hidden shrink-0 text-slate-300 2xl:block"
            />
          )}
        </Link>
      ))}
    </nav>
  );
}

export function Readiness({
  document,
  compact = false,
  onResolve,
}: {
  document: Plan;
  compact?: boolean;
  onResolve?: (issue: string) => void;
}) {
  const hasAccess =
    document.permissions.canEdit || document.permissions.canApprove;
  if (document.status === "APPROVED") {
    return (
      <p className="flex items-start gap-2 text-sm text-gemba-lime-ink">
        <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
        Approved and locked. Changes require a dated revision.
      </p>
    );
  }
  if (!hasAccess)
    return (
      <p className="text-sm text-muted-foreground">
        The owner and designated approver can check this draft.
      </p>
    );
  if (!document.issues.length) {
    return (
      <div className="space-y-2">
        <p className="flex items-start gap-2 text-sm text-gemba-lime-ink">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          Required planning details are complete.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          The approver confirms that the commitments are realistic, relevant and
          measurable.
        </p>
      </div>
    );
  }
  const issues = compact ? document.issues.slice(0, 3) : document.issues;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gemba-navy">
        {document.issues.length}{" "}
        {document.issues.length === 1 ? "detail needs" : "details need"}{" "}
        attention
      </p>
      <ul className="space-y-2 text-xs leading-5 text-amber-800">
        {issues.map((issue, index) => (
          <li key={index} className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{issue}</span>
            {onResolve && document.permissions.canEdit && (
              <button
                type="button"
                onClick={() => onResolve(issue)}
                className="shrink-0 font-semibold text-gemba-navy underline underline-offset-2"
              >
                Complete now
              </button>
            )}
          </li>
        ))}
      </ul>
      {compact && document.issues.length > issues.length && (
        <p className="text-xs text-muted-foreground">
          +{document.issues.length - issues.length} more in the full check
        </p>
      )}
    </div>
  );
}

export function PlanOverview({
  document,
  section,
  onReview,
  onHistory,
  onSwot,
  children,
}: {
  document: Plan;
  section: PlanningSection;
  onReview: () => void;
  onHistory: () => void;
  onSwot?: () => void;
  children?: ReactNode;
}) {
  const { data } = usePlanning();
  const person = (id: string) =>
    data.references.people.find((person) => person.id === id)?.name ||
    "Not assigned";
  const company = document.kind === "COMPANY";
  const swot = document.kind === "SWOT";
  const next =
    document.kind === "COMPANY"
      ? stages[1]
      : document.kind === "DEPARTMENT"
        ? stages[2]
        : null;
  return (
    <aside className="min-w-0 space-y-4">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gemba-navy">
            Plan at a glance
          </h2>
          <Status status={document.status} swot={document.kind === "SWOT"} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <strong className="block text-2xl font-semibold text-gemba-navy">
              {swot
                ? document.data.findings.length
                : company
                  ? document.data.objectives.length
                  : document.data.goals.length}
            </strong>
            <span className="text-xs text-muted-foreground">
              {swot ? "Findings" : company ? "Objectives" : "Contributions"}
            </span>
          </div>
          <div>
            <strong className="block text-2xl font-semibold text-gemba-navy">
              {swot
                ? document.data.consideredPillars.length
                : company
                  ? document.data.goals.length
                  : document.data.actions.length +
                    (document.data.actionLinks?.length || 0)}
            </strong>
            <span className="text-xs text-muted-foreground">
              {swot
                ? "Pillars considered"
                : company
                  ? "Linked goals"
                  : "Delivery actions"}
            </span>
          </div>
        </div>
        <dl className="mt-5 space-y-3 border-t border-border pt-4 text-xs">
          {[
            ["Planning year", document.cycle],
            ["Owner", person(document.data.ownerId)],
            ["Single approver", person(document.data.approverId)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium text-gemba-navy">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className="mt-5 text-xs font-medium text-gemba-navy underline-offset-4 hover:underline"
          onClick={onHistory}
        >
          View version history
        </button>
      </section>
      <section className="rounded-xl border border-slate-200 bg-slate-100/80 p-5">
        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
          Your next step
        </p>
        <h3 className="mt-2 text-sm font-semibold text-gemba-navy">
          {document.status === "APPROVED"
            ? next
              ? "Connect the next contribution"
              : "Use the agreed commitments"
            : document.status === "IN_REVIEW"
              ? "Review the plan together"
              : "Finish the essentials"}
        </h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {document.status === "APPROVED"
            ? next
              ? "Use these approved goals to agree distinct contributions and responsibilities."
              : "Execution will record results against this approved plan. Missing results remain unset."
            : "Save your work as a draft. Check missing details together, then approve the plan once."}
        </p>
        {document.status === "APPROVED" && next ? (
          <Link
            href={`${BASE}/${next.path}`}
            className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-medium text-gemba-navy"
          >
            <ArrowRight size={14} />
            {next.label}
          </Link>
        ) : (
          document.status !== "APPROVED" && (
            <Button
              variant="outline"
              className="mt-4 w-full text-xs"
              onClick={onReview}
            >
              <ClipboardCheck size={14} />
              Check plan readiness
            </Button>
          )
        )}
      </section>
      {section !== "company" && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-gemba-navy">
            Readiness
          </h3>
          <Readiness document={document} compact />
        </section>
      )}
      {company && (
        <p className="px-1 text-xs leading-6 text-muted-foreground">
          Company achievement uses its own verified measures. Department
          contributions and employee scores do not replace it.
        </p>
      )}
      {onSwot && (
        <button
          type="button"
          onClick={onSwot}
          className="flex items-center gap-1 px-1 text-xs font-medium text-gemba-navy"
        >
          View SWOT &amp; reviewed sources
          <ChevronRight size={14} />
        </button>
      )}
      {children}
    </aside>
  );
}

export function PlanCollection({
  documents,
  section,
  onOpen,
}: {
  documents: Plan[];
  section: PlanningSection;
  onOpen: (id: string) => void;
}) {
  const { data } = usePlanning();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const person = (id: string) =>
    data.references.people.find((person) => person.id === id)?.name ||
    "Owner not assigned";
  const label = (document: Plan) =>
    document.kind === "DEPARTMENT"
      ? data.references.departments.find((d) => d.id === document.scopeId)
          ?.name || document.data.title
      : document.kind === "INDIVIDUAL"
        ? person(document.scopeId)
        : document.data.title || document.code;
  const filtered = documents
    .filter(
      (document) =>
        (!status || document.status === status) &&
        `${label(document)} ${document.code} ${person(document.data.ownerId)}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      section === "approval"
        ? ["IN_REVIEW", "DRAFT", "APPROVED"].indexOf(a.status) -
          ["IN_REVIEW", "DRAFT", "APPROVED"].indexOf(b.status)
        : label(a).localeCompare(label(b)),
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search plans</span>
          <Search
            size={16}
            className="absolute top-3.5 left-3 text-muted-foreground"
          />
          <input
            className={`${control} mt-0 pl-9`}
            placeholder="Find a plan or owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className={`${control} mt-0 w-auto max-w-full`}
          aria-label="Filter plan status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_REVIEW">Under review</option>
          <option value="APPROVED">Approved</option>
        </select>
      </div>
      {filtered.map((document) => (
        <article key={document.id} className={card}>
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-slate-100 p-2.5 text-slate-500">
              {document.kind === "DEPARTMENT" ? (
                <Building2 size={20} />
              ) : ["TEAM", "POSITION", "INDIVIDUAL"].includes(document.kind) ? (
                <Users size={20} />
              ) : (
                <ClipboardCheck size={20} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gemba-navy">
                {label(document)}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {document.code} · {person(document.data.ownerId)}
              </p>
            </div>
            <Status status={document.status} swot={document.kind === "SWOT"} />
          </div>
          <p className="mt-4 text-sm font-medium text-gemba-navy">
            {document.data.goals[0]?.title ||
              (document.kind === "SWOT"
                ? "SWOT findings & decisions"
                : "Add your first measurable contribution")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {document.kind === "SWOT"
              ? `${document.data.findings.length} findings`
              : `${document.data.goals.length} ${document.kind === "COMPANY" ? "linked goals" : "contributions"} · ${document.data.assignments.length} KPI assignments`}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {document.cycle}
              {section === "approval" &&
              document.status !== "APPROVED" &&
              (document.permissions.canEdit || document.permissions.canApprove)
                ? document.issues.length
                  ? ` · ${document.issues.length} details to check`
                  : " · Ready for review"
                : ` · ${document.versions.length} approved versions`}
            </span>
            <Button
              variant={
                section === "approval" && document.status !== "APPROVED"
                  ? "default"
                  : "outline"
              }
              className="text-xs"
              onClick={() => onOpen(document.id)}
            >
              {section === "approval" ? "Review plan" : "Open plan"}
              <ArrowRight size={14} />
            </Button>
          </div>
        </article>
      ))}
      {!filtered.length && (
        <Empty
          title={documents.length ? "No matching plans" : "No plans here yet"}
        >
          {documents.length
            ? "Try another name or status."
            : "Create a draft when you are ready. Only records available to your role are shown."}
        </Empty>
      )}
    </div>
  );
}
