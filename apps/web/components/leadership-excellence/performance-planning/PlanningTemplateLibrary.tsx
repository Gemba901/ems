"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BookOpen, Loader2, RefreshCw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { PerformancePlanningService } from "@/services/leadership-excellence/performance-planning.service";
import {
  type PlanningLibraryTemplate,
  type PlanningTemplateKind,
} from "@/services/leadership-excellence/performance-planning/library-templates";
import { businessAlignmentLabels } from "@/services/leadership-excellence/performance-planning/business-alignment";
import { Button, categories, control, Field, Modal } from "./PlanningUi";

const pillars = [
  ["LEX", "Leadership"],
  ["PEX", "People"],
  ["OPX", "Operational"],
  ["CMX", "Customer & Market"],
  ["SGEX", "Sustainability & Governance"],
  ["FPEX", "Financial Performance"],
] as const;

const titles: Record<PlanningTemplateKind, string> = {
  finding: "SWOT templates",
  objective: "Company objective templates",
  "department-goal": "Department goal templates",
};

const previewFields = [
  ["result", "Measurable result"],
  ["explanation", "Supporting data"],
  ["impact", "Business impact"],
  ["evidence", "Example reference / source"],
  ["otherBusinessFocus", "Business focus"],
  ["measure", "Measure / KPI"],
  ["definition", "Measurement rule"],
  ["baseline", "Baseline"],
  ["target", "Target"],
  ["unit", "Unit"],
  ["selectionReason", "Selection reason"],
  ["approach", "How the goal can be achieved"],
  ["relevance", "Contribution to the company objective"],
  ["source", "Example baseline / source note"],
  ["frequency", "Review frequency"],
  ["weightage", "Finding weightage"],
] as const;

function display(value: unknown) {
  if (value == null || value === "") return "Not supplied";
  if (typeof value === "number")
    return new Intl.NumberFormat("en", { maximumFractionDigits: 4 }).format(
      value,
    );
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function alignmentLabels(fields: Record<string, unknown>) {
  return businessAlignmentLabels({
    alignments: Array.isArray(fields.alignments)
      ? fields.alignments.filter(
          (value): value is string => typeof value === "string",
        )
      : undefined,
    alignment:
      typeof fields.alignment === "string" ? fields.alignment : undefined,
    otherBusinessFocus:
      typeof fields.otherBusinessFocus === "string"
        ? fields.otherBusinessFocus
        : undefined,
  });
}

function TemplateNotes({ template }: { template: PlanningLibraryTemplate }) {
  return (
    <div className="space-y-2 text-xs leading-5 text-slate-600">
      {template.ownerRole && (
        <p>
          <span className="font-medium text-slate-700">
            Example owner role:
          </span>{" "}
          {template.ownerRole}. Choose a person from your organisation.
        </p>
      )}
      {template.parentObjectiveTitle && (
        <p>
          <span className="font-medium text-slate-700">
            Example company objective:
          </span>{" "}
          {template.parentObjectiveTitle}
          {template.parentObjectiveCode && (
            <span className="ml-1">({template.parentObjectiveCode})</span>
          )}{" "}
          Select the appropriate approved objective in your organisation.
        </p>
      )}
      {template.notes.map((note, index) => (
        <p key={`${template.id}-${index}`}>{note}</p>
      ))}
    </div>
  );
}

/** Shared database content fills the caller's draft; it never saves a record. */
export function PlanningTemplateLibrary({
  kind,
  onSelect,
  disabled = false,
}: {
  kind: PlanningTemplateKind;
  onSelect: (template: PlanningLibraryTemplate) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<PlanningLibraryTemplate | null>(null);
  const choose = (template: PlanningLibraryTemplate) => {
    if (disabled) return;
    // Applying a fresh copy never mutates the fetched shared template.
    const copy = structuredClone(template);
    onSelect(copy);
    setApplied(copy);
    setOpen(false);
  };
  return (
    <div className="min-w-0 space-y-2" data-planning-template-library={kind}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <BookOpen size={15} aria-hidden="true" /> Use library template
      </Button>
      {applied?.kind === kind && (
        <div
          role="status"
          className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
        >
          <p>
            <span className="font-medium text-slate-700">
              Template applied: {applied.sourceCode}.
            </span>{" "}
            Everything remains editable. Review example figures and dates, and
            choose your organisation&apos;s owner and links before approval.
          </p>
          {applied.fields.measure && applied.fields.measure === applied.fields.definition ? <p className="mt-1">The example repeated its KPI as its definition. The KPI text is preserved; add a distinct counting rule, source and scope in the definition field.</p> : null}
          <details className="mt-1">
            <summary className="cursor-pointer font-medium text-slate-700">
              Example notes
            </summary>
            <div className="mt-2">
              <TemplateNotes template={applied} />
            </div>
          </details>
        </div>
      )}
      {open &&
        createPortal(
          <PlanningTemplateLibraryDialog
            kind={kind}
            disabled={disabled}
            onSelect={choose}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}

function PlanningTemplateLibraryDialog({
  kind,
  disabled,
  onSelect,
  onClose,
}: {
  kind: PlanningTemplateKind;
  disabled: boolean;
  onSelect: (template: PlanningLibraryTemplate) => void;
  onClose: () => void;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const organizationId = useAuthStore((state) => state.user?.organizationId);
  const userId = useAuthStore((state) => state.user?.userId);
  const role = useAuthStore((state) => state.user?.roleLevel);
  const canLoad = Boolean(token && organizationId);
  // Mount only while open. Each reopen fetches current DB content, and closing
  // cancels in-flight requests. Identity-scoped keys never reuse another session.
  const library = useQuery({
    queryKey: ["lex-planning-library", organizationId, userId, role, kind],
    queryFn: ({ signal }) =>
      PerformancePlanningService.getLibraryTemplates(token!, kind, signal),
    enabled: canLoad,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const loading = canLoad && (library.isPending || library.isFetching);
  const errorMessage = !canLoad
    ? "Sign in again to load the template library."
    : library.isError
      ? library.error.message || "Please try again."
      : "";
  const [search, setSearch] = useState("");
  const [pillar, setPillar] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [limit, setLimit] = useState(20);
  const templates = library.data || [];
  const departments = [
    ...new Set(templates.flatMap((item) => item.department || [])),
  ].sort();
  const query = search.trim().toLowerCase();
  const matches = templates.filter(
    (item) =>
      (!pillar || item.pillar === pillar) &&
      (!category || item.category === category) &&
      (!department || item.department === department) &&
      (!query ||
        [
          item.title,
          item.sourceCode,
          item.department,
          item.ownerRole,
          item.parentObjectiveTitle,
          ...Object.values(item.fields),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  );
  const shown = matches.slice(0, limit);
  const reset = () => {
    setSearch("");
    setPillar("");
    setCategory("");
    setDepartment("");
    setLimit(20);
  };

  return (
    <div
      data-planning-library-dialog
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Modal
        wide
        title={titles[kind]}
        description="Examples shared across organisations. Select one to fill this draft, then edit it for your organisation."
        onClose={onClose}
        scrollKey={`${search}|${pillar}|${category}|${department}`}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Selecting a template does not save or approve it.
            </p>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        }
      >
        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-sm text-slate-600"
          >
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            Loading templates…
          </div>
        ) : errorMessage ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900"
          >
            <p className="font-semibold">Could not load templates.</p>
            <p className="mt-1 break-words">{errorMessage}</p>
            {canLoad && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void library.refetch()}
              >
                <RefreshCw size={14} aria-hidden="true" /> Retry
              </Button>
            )}
          </div>
        ) : !templates.length ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              No templates available yet.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              You can close the library and fill in this draft yourself.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void library.refetch()}
            >
              <RefreshCw size={14} aria-hidden="true" /> Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Search templates">
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-5 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    className={`${control} pl-9`}
                    aria-label="Search templates"
                    type="search"
                    value={search}
                    placeholder="Search a result, topic or example code"
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setLimit(20);
                    }}
                  />
                </div>
              </Field>
              <Field label="Pillar">
                <select
                  className={control}
                  value={pillar}
                  onChange={(event) => {
                    setPillar(event.target.value);
                    setLimit(20);
                  }}
                >
                  <option value="">All pillars</option>
                  {pillars.map(([code, name]) => (
                    <option key={code} value={code}>
                      {code} · {name}
                    </option>
                  ))}
                </select>
              </Field>
              {kind === "finding" && (
                <Field label="SWOT category">
                  <select
                    className={control}
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setLimit(20);
                    }}
                  >
                    <option value="">All categories</option>
                    {Object.entries(categories).map(([code, item]) => (
                      <option key={code} value={code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {kind === "department-goal" && (
                <Field label="Example department">
                  <select
                    className={control}
                    value={department}
                    onChange={(event) => {
                      setDepartment(event.target.value);
                      setLimit(20);
                    }}
                  >
                    <option value="">All departments</option>
                    {departments.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500" role="status">
                Showing {shown.length} of {matches.length} matching templates ·{" "}
                {templates.length} in this library
              </p>
              {(search || pillar || category || department) && (
                <Button type="button" size="sm" variant="ghost" onClick={reset}>
                  Clear filters
                </Button>
              )}
            </div>
            {shown.length ? (
              <div className="space-y-3">
                {shown.map((template) => (
                  <article
                    key={template.id}
                    data-library-template={template.id}
                    className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {template.sourceCode}
                      </span>
                      <span>{template.pillar}</span>
                      {template.category && (
                        <span>{categories[template.category].singular}</span>
                      )}
                      {template.department && (
                        <span>{template.department}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(template)}
                      className="mt-2 block w-full rounded text-left text-sm font-semibold leading-6 text-slate-900 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {template.title}
                    </button>
                    {alignmentLabels(template.fields).length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        {alignmentLabels(template.fields).join(" · ")}
                      </p>
                    )}
                    {kind !== "finding" && (
                      <p className="mt-2 text-xs text-slate-600">
                        Baseline {display(template.fields.baseline)} → Target{" "}
                        {display(template.fields.target)}{" "}
                        {display(template.fields.unit)}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                      <details className="min-w-0 flex-1 text-xs">
                        <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">
                          Preview fields & notes
                        </summary>
                        <dl className="mt-3 space-y-3">
                          {previewFields
                            .filter(
                              ([key]) =>
                                key in template.fields &&
                                template.fields[key] !== "" &&
                                !(key === "result" && template.fields.result === template.fields.title) &&
                                !(key === "definition" && template.fields.definition === template.fields.measure),
                            )
                            .map(([key, label]) => (
                              <div key={key}>
                                <dt className="font-medium text-slate-700">
                                  {label}
                                </dt>
                                <dd className="mt-1 whitespace-pre-line break-words leading-5 text-slate-600">
                                  {display(template.fields[key])}
                                </dd>
                              </div>
                            ))}
                        </dl>
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <TemplateNotes template={template} />
                          <p className="mt-2 text-slate-400">
                            Workbook example · {template.sourceSheet}, row{" "}
                            {template.sourceRow}
                          </p>
                        </div>
                      </details>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onSelect(template)}
                        aria-label={`Use template ${template.sourceCode}`}
                      >
                        Use template <ArrowRight size={13} aria-hidden="true" />
                      </Button>
                    </div>
                  </article>
                ))}
                {shown.length < matches.length && (
                  <div className="flex justify-center pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLimit((current) => current + 20)}
                    >
                      Show more templates
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No templates match these filters.
                </p>
                <Button
                  className="mt-2"
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
