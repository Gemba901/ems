"use client";

import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
import type {
  ApprovedParentGoal,
  PlanningDocument,
} from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { approvedParents, approvedParentOptions } from "./PlanningParents";
import { planningToday } from "./PlanningLinks";
import { Button } from "./PlanningUi";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import { resolveParentGoal } from "@/services/leadership-excellence/performance-planning/measurable-objective";

/** Read the approved source; linking always retains its ID and approved version. */
export function PlanningApprovedGoals({
  child,
  canLink,
  busy,
  onLink,
}: {
  child: Pick<
    PlanningDocument,
    "kind" | "cycle" | "scopeId" | "departmentId"
  > & { id?: string };
  canLink: boolean;
  busy: boolean;
  onLink: (parent: ApprovedParentGoal) => void;
}) {
  const { data } = usePlanning();
  const today = planningToday(data.references.timeZone);
  const department = child.kind === "DEPARTMENT";
  const individual = child.kind === "INDIVIDUAL";
  const departmentName =
    data.references.departments.find(
      (d) => d.id === (department ? child.scopeId : child.departmentId),
    )?.name || "this department";
  const eligible = new Set(
    approvedParentOptions(data, child, today).map((option) => option.value),
  );
  const seen = new Set<string>();
  const parents = approvedParents(data)
    .filter(
      (parent) =>
        parent.cycle === child.cycle &&
        (!parent.retainedFor ||
          parent.retainedFor.some((link) => link.documentId === child.id)) &&
        (department
          ? parent.kind === "COMPANY"
          : individual
            ? parent.kind === "COMPANY" || parent.kind === "DEPARTMENT"
            : parent.kind === "DEPARTMENT" &&
              parent.scopeId === child.departmentId),
    )
    .sort(
      (a, b) => b.version - a.version || a.goal.code.localeCompare(b.goal.code),
    )
    .filter((parent) => {
      const key = `${parent.documentId}/${parent.itemKind || "GOAL"}/${parent.goal.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return (
    <section
      aria-label={
        department
          ? "Approved company objectives"
          : individual
            ? "Approved company objectives & department goals"
            : "Approved department goals"
      }
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {department
              ? "Approved company objectives"
              : individual
                ? "Approved company objectives & department goals"
                : `Approved ${departmentName} goals`}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {department
              ? `Link ${departmentName}'s contribution directly to an approved company objective.`
              : individual
                ? "Choose an approved company objective or department goal. Earlier company goal links remain available with their original approved version."
                : "Use an approved goal from this team's or position's department. Each contribution keeps its own target."}
          </p>
        </div>
        <Link
          href="/leadership-excellence/performance-planning/objectives"
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-indigo-700 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          Company objectives <ArrowRight size={13} />
        </Link>
      </div>
      {parents.length ? (
        <div className="divide-y divide-slate-100">
          {parents.map((parent) => {
            const key = JSON.stringify({
              documentId: parent.documentId,
              goalId: parent.goal.id,
              version: parent.version,
              ...(parent.itemKind ? { itemKind: parent.itemKind } : {}),
            });
            const allowed = eligible.has(key);
            // Parent summaries intentionally contain only shareable linking fields.
            // Show measurement only when the viewer can read that approved snapshot.
            const readableDocument = data.documents.find(
              (document) =>
                document.id === parent.documentId &&
                document.permissions.canRead,
            );
            const approvedSnapshot = readableDocument?.versions.find(
              (version) => version.version === parent.version,
            );
            const measurement = approvedSnapshot
              ? resolveParentGoal(approvedSnapshot.data, {
                  documentId: parent.documentId,
                  goalId: parent.goal.id,
                  version: parent.version,
                  ...(parent.itemKind ? { itemKind: parent.itemKind } : {}),
                })
              : undefined;
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-xs text-slate-500">
                    {!department &&
                      `${parent.kind === "COMPANY" ? "Company" : data.references.departments.find((d) => d.id === parent.scopeId)?.name || "Department unavailable"} · `}
                    {parent.kind === "COMPANY" &&
                      (parent.itemKind === "OBJECTIVE"
                        ? "Objective · "
                        : "Earlier goal · ")}
                    {parent.goal.code} · Approved v{parent.version}
                    {parent.effectiveDate > today
                      ? ` · Effective ${parent.effectiveDate}`
                      : ""}
                  </p>
                  <h3 className="mt-1 break-words text-sm font-semibold">
                    {parent.goal.title ||
                      (parent.itemKind === "OBJECTIVE"
                        ? "Untitled objective"
                        : "Untitled goal")}
                  </h3>
                  {measurement && (
                    <p className="mt-2 break-words text-xs leading-5 text-slate-500">
                      {measurement.measure || "Measure not set"} · Baseline{" "}
                      {measurement.baseline ?? "Not set"} → Target{" "}
                      {measurement.target ?? "Not set"} {measurement.unit}
                    </p>
                  )}
                  {department && (
                    <p className="mt-1 text-xs text-slate-500">
                      Contributing departments:{" "}
                      {parent.goal.departmentIds
                        .map(
                          (id) =>
                            data.references.departments.find((d) => d.id === id)
                              ?.name || "Unavailable department",
                        )
                        .join(", ") || "Not assigned"}
                    </p>
                  )}
                </div>
                {allowed && canLink ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onLink(parent)}
                  >
                    <Link2 size={14} />{" "}
                    {parent.itemKind === "OBJECTIVE"
                      ? "Link objective"
                      : "Link goal"}
                  </Button>
                ) : (
                  <p className="max-w-sm text-xs leading-5 text-slate-500">
                    {!allowed
                      ? parent.retainedFor
                        ? "Already assigned to an existing contribution. Open that contribution to edit its link."
                        : parent.kind === "COMPANY" &&
                            parent.itemKind !== "OBJECTIVE"
                          ? "Earlier company goal retained for existing contribution links. New contributions link directly to a measurable company objective."
                          : `${departmentName} is not a contributing department.`
                      : "Read only. Open a draft or dated revision to add a contribution."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-500">
          {department
            ? `No company objectives are approved for ${planningPeriodLabel(child.cycle)} yet.`
            : individual
              ? `No approved company objectives or department goals are available to you for ${planningPeriodLabel(child.cycle)}.`
              : `No approved department goal is available for ${departmentName} in ${planningPeriodLabel(child.cycle)}.`}{" "}
          You can still prepare and save a draft.
        </p>
      )}
    </section>
  );
}
