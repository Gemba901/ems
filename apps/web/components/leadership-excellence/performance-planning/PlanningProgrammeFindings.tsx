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
import { usePlanningUrlFilter } from "./PlanningUrlState";
import { findingReviewStatus } from "./PlanningSources";
import { FindingWeightage } from "./FindingWeightage";
import { Button, Empty, categories, responseLabels } from "./PlanningUi";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

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
const panel = "min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5";
const selectClass =
  "min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground";

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
  const [pillar, setPillar] = usePlanningUrlFilter("pillar");
  const [category, setCategory] = usePlanningUrlFilter("category");
  const [status, setStatus] = usePlanningUrlFilter("status");
  const [search, setSearch] = usePlanningUrlFilter("search");
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
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            {reviewOnly
              ? "Review checks the information. Decision chooses the response."
              : "Start with a clear condition and its evidence."}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {reviewOnly
              ? "A high score can lead to maintenance, evidence checking or a department action. It does not automatically create an objective."
              : "Strengths and weaknesses are internal. Opportunities and threats are external. Capture improvement ideas in the response."}
          </p>
        </div>
        {reviewOnly ? (
          canReview && (
            <span className="rounded-md bg-success-subtle px-3 py-1 text-xs font-medium text-success">
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
              <strong className="text-2xl font-semibold text-foreground">
                {value}
              </strong>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}
      <section className={`${panel} space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {reviewOnly ? "Review & management decisions" : "SWOT register"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
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
              <UiButton variant="ghost"
                type="button"
                key={item.code}
                aria-pressed={pillar === item.code}
                className={`h-auto whitespace-normal rounded-full border px-3 py-2 text-xs transition-colors ${pillar === item.code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
                onClick={() => {
                  setPillar(item.code);
                  resetLimit();
                }}
              >
                {item.code ? `${item.code} · ${item.name}` : item.name}
              </UiButton>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
            />
            <Input
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
          <NativeSelect
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
          </NativeSelect>
          {reviewOnly && (
            <NativeSelect
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
            </NativeSelect>
          )}
        </div>
        <div
          className="overflow-x-auto"
          aria-label={
            reviewOnly ? "Pending finding reviews" : "Separate findings"
          }
        >
          <Table className="w-full min-w-[960px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-border bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
                {[
                  ...(reviewOnly ? ["Select"] : []),
                  "Finding / evidence",
                  "Alignment",
                  "SWOT importance",
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
                    className="border-b border-border align-top"
                  >
                    {reviewOnly && (
                      <td className="px-3 py-4">
                        <Checkbox
                          aria-label={`Select ${finding.code}`}
                          disabled={!document.permissions.canApprove || busy}
                          checked={selected.includes(keyOf(row))}
                          onCheckedChange={(checked) => setSelected((values) =>
                              checked
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
                      <p className="text-[10px] text-muted-foreground">
                        {finding.code} · {finding.pillar} ·{" "}
                        {categories[finding.category].singular}
                      </p>
                      <h3 className="mt-1 whitespace-pre-wrap break-words text-[13px] font-semibold leading-5 text-foreground">
                        {finding.title || "Untitled finding"}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-5 text-muted-foreground">
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
                            className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground"
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
                        className={`inline-block rounded-md px-2 py-1 text-[10px] ${current === "REVIEWED" ? "bg-success-subtle text-success" : current === "NEEDS_EVIDENCE" ? "bg-warning-subtle text-warning" : "bg-primary/10 text-primary"}`}
                      >
                        {reviewNames[current]}
                      </span>
                      {current === "NEEDS_EVIDENCE" && <p className="mt-2 max-w-52 whitespace-pre-wrap text-xs leading-5 text-warning">{finding.decisionNote || "Open the review to describe the missing evidence."}<br />For: {data.references.people.find((person) => person.id === finding.followupOwnerId)?.name || "Owner not assigned"}{finding.reviewDate ? ` · By ${finding.reviewDate}` : ""}<br />Add evidence through Edit finding.</p>}
                    </td>
                    <td className="px-3 py-4">
                      <p className="max-w-36 text-foreground">
                        {responseLabels[finding.response] || "Not decided"}
                      </p>
                      {current !== "REVIEWED" && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
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
                              <UiButton variant="ghost"
                                type="button"
                                title={link.objective.title}
                                className="text-left text-xs text-primary hover:underline h-auto whitespace-normal"
                                onClick={() =>
                                  onAction({
                                    action: "objective",
                                    documentId: link.documentId,
                                    objectiveId: link.objective.id,
                                  })
                                }
                              >
                                {link.objective.code}
                              </UiButton>
                              {link.historical && (
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  Earlier approved link · v{link.version}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not linked</span>
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
                            <UiButton variant="ghost"
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline h-auto whitespace-normal"
                              onClick={() =>
                                onAction({ action: "follow", ...row })
                              }
                            >
                              {finding.response === "OBJECTIVE" &&
                              objectives.length
                                ? "Create another objective"
                                : "Next action"}{" "}
                              <ArrowRight size={12} />
                            </UiButton>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {!filtered.length && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {reviewOnly
                ? "No findings awaiting review. Reviewed findings remain in the SWOT register."
                : "No matching findings. Change the filters or add a finding."}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {reviewOnly
              ? "Reviewed findings leave this queue and remain in the SWOT register."
              : "Review the evidence before deciding the response."}
          </p>
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
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
