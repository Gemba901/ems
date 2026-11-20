"use client";

import { useId } from "react";
import { commonPlanningUnits, embeddedDeadlineWarnings } from "@/services/leadership-excellence/performance-planning/editor-guidance";
import { Button, control, Field } from "./PlanningUi";

export function PlanningUnitInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <Field label="Unit" hint="Choose a common unit or type a custom unit. Counts such as actions, people or defects require nonnegative whole values. Use the same unit for baseline, target and actual results.">
    <span>
      <input className={control} data-planning-field="unit" list={id} value={value} onChange={(event) => onChange(event.target.value)} aria-label="Unit" />
      <datalist id={id}>{commonPlanningUnits.map((unit) => <option key={unit} value={unit} />)}</datalist>
    </span>
  </Field>;
}

export function focusPlanningField(formId: string, name: string) {
  const form = window.document.getElementById(formId);
  const aliases: Record<string, string[]> = { source: ["source", "dataSource"], dataSource: ["dataSource", "source"], reviewFrequency: ["reviewFrequency", "frequency"] };
  const names = aliases[name] || [name];
  const field = (name === "otherBusinessFocus" ? form?.querySelector<HTMLElement>('[data-planning-field="alignments"] input:not([type="checkbox"])') : undefined)
    || names.map((value) => form?.querySelector<HTMLElement>(`[data-planning-field="${value}"]`)).find(Boolean);
  if (!field) return;
  let ancestor: HTMLElement | null = field;
  while (ancestor && ancestor !== form) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  if (field.matches("input,select,textarea,button")) field.focus({ preventScroll: true });
  else field.querySelector<HTMLElement>("input,select,textarea,button")?.focus({ preventScroll: true });
}

export function ApprovalRequirements({ values, kind, formId }: { values: Record<string, unknown>; kind: "objective" | "goal"; formId: string }) {
  const fields: [string, string][] = [
    ["title", "Commitment"], ["measure", "KPI / measure"], ["unit", "Unit"], ["definition", "Counting rule"],
    ["baseline", "Measured baseline"], ["baselinePeriod", "Baseline period"], ["target", "Target"], ["ownerId", "Owner"], ["direction", "Success direction"], ["endDate", "Deadline"],
    ...(kind === "objective" ? [["result", "Measurable result"], ["pillar", "Primary pillar"], ["alignments", "QCDSMT / business focus"], ["sources", "Reviewed SWOT evidence"], ["selectionReason", "Reason for selection"], ["priority", "Objective priority"], ["weightage", "Weight in company score"], ["dataSource", "Data source & verifier"], ["reviewFrequency", "Review frequency"], ["approach", "Approach"], ["guardrails", "Quality / safety conditions"]] : [["parent", "Approved parent"], ["source", "Data source"], ["frequency", "Review frequency"], ["approach", "Achievable plan"], ["relevance", "Company contribution"]]) as [string, string][],
    ...(Array.isArray(values.alignments) && values.alignments.includes("OTHER") ? [["otherBusinessFocus", "Business focus details"]] as [string, string][] : []),
  ];
  const missing = fields.filter(([key]) => values[key] == null || values[key] === "" || (Array.isArray(values[key]) && values[key].length === 0));
  return <details className="rounded-xl border border-slate-200 p-4" open={undefined}>
    <summary className="cursor-pointer text-sm font-semibold text-slate-700">Before approval: {missing.length ? `${missing.length} details still needed` : "details entered; ready for validation"}</summary>
    <p className="mt-2 text-xs leading-5 text-slate-500">Save draft accepts unfinished details. Approval also checks valid values, evidence, parent dates, the designated approver{kind === "objective" ? " and that weights stay within the pillar budget" : ""}. These links stay in this form and preserve your entries. Refresh restores the saved draft only.</p>
    <div className="mt-3 flex flex-wrap gap-2">{missing.map(([key, label]) => <Button key={key} type="button" size="xs" variant="outline" onClick={() => focusPlanningField(formId, key)}>{label}</Button>)}</div>
  </details>;
}

export function TemplateContentGuidance({ values }: { values: Record<string, unknown> }) {
  const warnings = embeddedDeadlineWarnings(values);
  const seen = new Map<string, string>();
  for (const [key, label] of [["title", "Title"], ["result", "Result"], ["measure", "KPI / measure"], ["definition", "Counting rule"]]) {
    const value = String(values[key] || "").trim().toLowerCase();
    if (value && seen.has(value)) warnings.push(`${label} repeats ${seen.get(value)}. Keep a short title, a measurable result, a KPI name and a separate counting rule.`);
    if (value) seen.set(value, label);
  }
  if (!warnings.length) return null;
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">{warnings.map((warning) => <p className="mt-1 first:mt-0" key={warning}>{warning}</p>)}</div>;
}
