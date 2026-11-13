"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
import type {
  Finding,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";
import { compareFindingWeightage } from "@/services/leadership-excellence/performance-planning/finding-weightage";
import { businessAlignmentLabels } from "@/services/leadership-excellence/performance-planning/business-alignment";
import { linkedFindingObjectives } from "@/services/leadership-excellence/performance-planning/finding-objectives";
import { usePlanning } from "./PlanningProvider";
import { findingReviewStatus } from "./PlanningSources";
import { FindingWeightage } from "./FindingWeightage";
import { Button, Empty, categories, responseLabels } from "./PlanningUi";

export type ProgrammeFinding = {
  document: PlanningView["documents"][number];
  finding: Finding;
};
export type ProgrammeFindingAction =
  | { action: "add" | "guide" }
  | ({ action: "open" | "review" | "follow" } & ProgrammeFinding)
  | { action: "objective"; documentId: string; objectiveId: string }
  | { action: "bulk-review"; findings: ProgrammeFinding[] };

const reviewNames = {
  UNDER_REVIEW: "Under review",
  NEEDS_EVIDENCE: "Needs evidence",
  REVIEWED: "Reviewed",
};
const panel = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
const selectClass =
  "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";

/** The programme register keeps one identity and one visible row per finding. */
export function PlanningProgrammeFindings({
  cycle,
  reviewOnly = false,
  onAction,
}: {
  cycle: string;
  reviewOnly?: boolean;
  onAction: (event: ProgrammeFindingAction) => void;
}) {
  const { data, busy } = usePlanning();
  const [pillar, setPillar] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const documents = data.documents.filter(
    (document) =>
      document.kind === "SWOT" &&
      document.cycle === cycle &&
      document.permissions.canRead,
  );
  const canCreate = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(
    data.actor.role,
  );
  const canEdit =
    canCreate || documents.some((document) => document.permissions.canEdit);
  const canCreateObjective =
    canCreate ||
    data.documents.some(
      (document) =>
        document.kind === "COMPANY" &&
        document.cycle === cycle &&
        document.permissions.canEdit,
    );
  const canReview = documents.some(
    (document) => document.permissions.canApprove,
  );
  const all = documents.flatMap((document) =>
    document.data.findings.map((finding) => ({ document, finding })),
  );
  const keyOf = ({ document, finding }: ProgrammeFinding) =>
    `${document.id}/${finding.id}`;
  const linkedObjectives = ({ document, finding }: ProgrammeFinding) =>
    linkedFindingObjectives(data.documents, cycle, {
      documentId: document.id,
      findingId: finding.id,
    });
  const pending = all.filter(
    ({ document, finding }) =>
      findingReviewStatus(finding, document) !== "REVIEWED",
  );
  const filtered = all
    .filter(({ document, finding }) => {
      const current = findingReviewStatus(finding, document);
      return (
        (!reviewOnly || current !== "REVIEWED") &&
        (!pillar ||
          finding.pillar === pillar ||
          finding.relatedPillars.includes(pillar as Finding["pillar"])) &&
        (!category || finding.category === category) &&
        (!reviewOnly || !status || current === status) &&
        (!search.trim() ||
          `${finding.code} ${finding.title} ${finding.explanation}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()))
      );
    })
    .sort((a, b) => compareFindingWeightage(a.finding, b.finding));
  const selectedRows = pending.filter(
    (row) =>
      row.document.permissions.canApprove && selected.includes(keyOf(row)),
  );
  const linkedCount = all.filter(
    (row) => linkedObjectives(row).length > 0,
  ).length;
  const resetLimit = () => setLimit(20);

  if (!documents.length && !canCreate)
    return (
      <Empty title="Confidential management assessment">
        Only authorised management and invited contributors can access SWOT
        findings. Approved company objectives remain available to permitted
        readers.
      </Empty>
    );

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {reviewOnly
              ? "Review checks the information. Decision chooses the response."
              : "Start with a clear condition and its evidence."}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {reviewOnly
              ? "A high score can lead to maintenance, evidence checking or a department action. It does not automatically create an objective."
              : "Strengths and weaknesses are internal. Opportunities and threats are external. Capture improvement ideas in the response."}
          </p>
        </div>
        {reviewOnly ? (
          canReview && (
            <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Authorised reviewer
            </span>
          )
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction({ action: "guide" })}
          >
            How it works
          </Button>
        )}
      </section>
      {!reviewOnly && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [all.length, "Saved findings"],
            [
              all.filter(({ finding }) => (finding.weightage ?? -1) >= 8)
                .length,
              "High importance",
            ],
            [all.length - pending.length, "Reviewed findings"],
            [linkedCount, "Linked to objectives"],
          ].map(([value, label]) => (
            <div key={label} className={panel}>
              <strong className="text-2xl font-semibold text-slate-900">
                {value}
              </strong>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      )}
      <section className={`${panel} space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {reviewOnly ? "Review & management decisions" : "SWOT register"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {reviewOnly
                ? `${pending.filter(({ document, finding }) => findingReviewStatus(finding, document) === "UNDER_REVIEW").length} under review · ${pending.filter(({ document, finding }) => findingReviewStatus(finding, document) === "NEEDS_EVIDENCE").length} need evidence · only pending findings appear here.`
                : "One finding, one identity. Choose a main pillar; avoid copying the same issue."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reviewOnly ? (
              <Button
                size="sm"
                disabled={!selectedRows.length || !canReview || busy}
                onClick={() =>
                  onAction({ action: "bulk-review", findings: selectedRows })
                }
              >
                Review selected ({selectedRows.length})
              </Button>
            ) : (
              canEdit && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onAction({ action: "add" })}
                >
                  <Plus size={14} /> Add finding
                </Button>
              )
            )}
          </div>
        </div>
        <div
          className="flex flex-wrap gap-2"
          aria-label="Filter findings by pillar"
        >
          {[{ code: "", name: "All pillars" }, ...data.references.pillars].map(
            (item) => (
              <button
                type="button"
                key={item.code}
                aria-pressed={pillar === item.code}
                className={`rounded-full border px-3 py-2 text-xs transition-colors ${pillar === item.code ? "border-[#52618a] bg-[#52618a] text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                onClick={() => {
                  setPillar(item.code);
                  resetLimit();
                }}
              >
                {item.code ? `${item.code} · ${item.name}` : item.name}
              </button>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-3 text-slate-400"
            />
            <input
              aria-label="Search findings"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetLimit();
              }}
              placeholder="Search findings, IDs or supporting data…"
              className={`${selectClass} w-full pl-9`}
            />
          </div>
          <select
            aria-label="Filter category"
            value={category}
            className={selectClass}
            onChange={(event) => {
              setCategory(event.target.value);
              resetLimit();
            }}
          >
            <option value="">All categories</option>
            {Object.entries(categories).map(([value, entry]) => (
              <option key={value} value={value}>
                {entry.label}
              </option>
            ))}
          </select>
          {reviewOnly && (
            <select
              aria-label="Filter review status"
              value={status}
              className={selectClass}
              onChange={(event) => {
                setStatus(event.target.value);
                resetLimit();
              }}
            >
              <option value="">All pending statuses</option>
              <option value="NEEDS_EVIDENCE">Needs evidence</option>
              <option value="UNDER_REVIEW">Under review</option>
            </select>
          )}
        </div>
        <div
          className="overflow-x-auto"
          aria-label={
            reviewOnly ? "Pending finding reviews" : "Separate findings"
          }
        >
          <table className="w-full min-w-[960px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                {[
                  ...(reviewOnly ? ["Select"] : []),
                  "Finding / evidence",
                  "Alignment",
                  "SWOT priority",
                  "Review",
                  "Management decision",
                  "Linked objectives",
                  "",
                ].map((label, index) => (
                  <th key={index} className="px-3 py-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((row) => {
                const { document, finding } = row;
                const current = findingReviewStatus(finding, document);
                const objectives = linkedObjectives(row);
                return (
                  <tr
                    key={keyOf(row)}
                    data-finding-id={finding.id}
                    className="border-b border-slate-100 align-top"
                  >
                    {reviewOnly && (
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${finding.code}`}
                          disabled={!document.permissions.canApprove || busy}
                          checked={selected.includes(keyOf(row))}
                          onChange={(event) =>
                            setSelected((values) =>
                              event.target.checked
                                ? [...values, keyOf(row)]
                                : values.filter(
                                    (value) => value !== keyOf(row),
                                  ),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="w-[35%] min-w-64 px-3 py-4">
                      <p className="text-[10px] text-slate-500">
                        {finding.code} · {finding.pillar} ·{" "}
                        {categories[finding.category].singular}
                      </p>
                      <h3 className="mt-1 whitespace-pre-wrap break-words text-[13px] font-semibold leading-5 text-slate-900">
                        {finding.title || "Untitled finding"}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-5 text-slate-500">
                        {finding.explanation ||
                          "Supporting data not added yet."}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(businessAlignmentLabels(finding).length
                          ? businessAlignmentLabels(finding)
                          : ["Not set"]
                        ).map((label) => (
                          <span
                            key={label}
                            className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <FindingWeightage weightage={finding.weightage} />
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`inline-block rounded-md px-2 py-1 text-[10px] ${current === "REVIEWED" ? "bg-emerald-50 text-emerald-700" : current === "NEEDS_EVIDENCE" ? "bg-amber-50 text-amber-800" : "bg-indigo-50 text-indigo-700"}`}
                      >
                        {reviewNames[current]}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <p className="max-w-36 text-slate-700">
                        {responseLabels[finding.response] || "Not decided"}
                      </p>
                      {current !== "REVIEWED" && (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Proposed response
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      {objectives.length ? (
                        <div className="space-y-2">
                          {objectives.map((link) => (
                            <div
                              key={`${link.documentId}/${link.objective.id}`}
                            >
                              <button
                                type="button"
                                title={link.objective.title}
                                className="text-left text-xs text-indigo-700 hover:underline"
                                onClick={() =>
                                  onAction({
                                    action: "objective",
                                    documentId: link.documentId,
                                    objectiveId: link.objective.id,
                                  })
                                }
                              >
                                {link.objective.code}
                              </button>
                              {link.historical && (
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  Earlier approved link · v{link.version}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">Not linked</span>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex min-w-28 flex-col items-start gap-2">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            onAction({
                              action: reviewOnly ? "review" : "open",
                              ...row,
                            })
                          }
                        >
                          {reviewOnly
                            ? document.permissions.canApprove
                              ? "Review finding"
                              : "View review"
                            : current === "REVIEWED"
                              ? "View finding"
                              : "Open finding"}
                        </Button>
                        {current === "REVIEWED" &&
                          (finding.response !== "OBJECTIVE" ||
                            canCreateObjective) && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline"
                              onClick={() =>
                                onAction({ action: "follow", ...row })
                              }
                            >
                              {finding.response === "OBJECTIVE" &&
                              objectives.length
                                ? "Create another objective"
                                : "Next action"}{" "}
                              <ArrowRight size={12} />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="py-12 text-center text-sm text-slate-500">
              {reviewOnly
                ? "No findings awaiting review. Reviewed findings remain in the SWOT register."
                : "No matching findings. Change the filters or add a finding."}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Showing {Math.min(limit, filtered.length)} of {filtered.length}{" "}
            findings
          </p>
          {filtered.length > limit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLimit((value) => value + 20)}
            >
              Show 20 more
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            {reviewOnly
              ? "Reviewed findings leave this queue and remain in the SWOT register."
              : "Review the evidence before deciding the response."}
          </p>
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            href={`/leadership-excellence/performance-planning/${reviewOnly ? "objectives" : "review-findings"}`}
          >
            {reviewOnly ? "Company objectives" : "Review & decide"}
            <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </div>
  );
}
