"use client";

import { useRef, useState } from "react";
import { LockKeyhole, Plus, Trash2 } from "lucide-react";
import {
  PlanningApiError,
  type PlanningDocument,
} from "@/services/leadership-excellence/performance-planning.service";
import {
  findingPriority,
  validFindingWeightage,
} from "@/services/leadership-excellence/performance-planning/finding-weightage";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import { usePlanning } from "./PlanningProvider";
import { PlanningEvidence } from "./PlanningEvidence";
import { FindingWeightage } from "./FindingWeightage";
import { BusinessAlignmentFields } from "./BusinessAlignmentFields";
import {
  Button,
  categories,
  control,
  ErrorList,
  Field,
  Modal,
} from "./PlanningUi";

type Fields = Record<string, unknown>;
type FindingBlock = {
  key: string;
  fields: Fields;
  score: string;
  badScore: boolean;
};

function alignmentValues(fields: Fields): string[] {
  // An explicit array, including an empty one, is the current source of truth.
  // Earlier findings stored one scalar choice; keep that choice when reopening.
  return Array.isArray(fields.alignments)
    ? fields.alignments.filter(
        (value): value is string => typeof value === "string",
      )
    : typeof fields.alignment === "string" && fields.alignment
      ? [fields.alignment]
      : [];
}

function block(key: string, initial: Fields = {}): FindingBlock {
  return {
    key,
    fields: {
      title: "",
      explanation: "",
      impact: "",
      evidence: "",
      sourceUrl: "",
      pillar: "",
      category: "W",
      relatedPillars: [],
      basis: "MANAGEMENT",
      response: "",
      decisionNote: "",
      followupOwnerId: "",
      reviewDate: "",
      alignment: "",
      otherBusinessFocus: "",
      ...initial,
      alignments: alignmentValues(initial),
    },
    score: initial.weightage == null ? "" : String(initial.weightage),
    badScore: false,
  };
}

/** Each block is persisted as its own finding in one atomic request. */
export function PlanningFindingEditor({
  document,
  initial = {},
  onClose,
  onSaved,
}: {
  document: PlanningDocument;
  initial?: Fields;
  onClose: () => void;
  onSaved?: (id: string, continueToGoal: boolean) => void;
}) {
  const { data, run, busy } = usePlanning();
  const [revision, setRevision] = useState(data.revision);
  const [blocks, setBlocks] = useState(() => [block("finding-1", initial)]);
  const nextBlock = useRef(2);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const editing = typeof initial.id === "string" && !!initial.id;
  const permission = data.documents.find(
    (record) => record.id === document.id,
  )?.permissions;
  const reviewed = initial.reviewStatus === "REVIEWED";
  const hasReviewedHistory =
    document.findingReviews?.some(
      (review) => review.finding.id === initial.id,
    ) ||
    document.versions.some((version) =>
      version.data.findings.some((finding) => finding.id === initial.id),
    );
  const editable =
    !!permission?.canEdit && document.status === "DRAFT" && !reviewed;
  const close = () => {
    if (!dirty || window.confirm("Discard your unsaved findings?")) onClose();
  };
  const update = (key: string, name: string, value: unknown) => {
    setDirty(true);
    setBlocks((previous) =>
      previous.map((item) =>
        item.key === key
          ? {
              ...item,
              fields: {
                ...item.fields,
                [name]: value,
                ...(name === "pillar"
                  ? {
                      relatedPillars: (
                        (item.fields.relatedPillars || []) as string[]
                      ).filter((pillar) => pillar !== value),
                    }
                  : {}),
              },
            }
          : item,
      ),
    );
  };
  const add = () => {
    const previous = blocks.at(-1)?.fields;
    const key = `finding-${nextBlock.current++}`;
    setBlocks((items) => [
      ...items,
      block(key, {
        pillar: previous?.pillar || "",
        category: previous?.category || "W",
      }),
    ]);
    setDirty(true);
  };
  async function save() {
    if (!editable || busy) return;
    const issues = blocks.flatMap((item, index) => {
      const messages: string[] = [];
      if (
        item.badScore ||
        (item.score !== "" && !validFindingWeightage(Number(item.score)))
      )
        messages.push(
          `Finding ${index + 1}: use a whole-number weightage from 1 to 10, or leave it blank.`,
        );
      return messages;
    });
    if (issues.length) {
      setError(issues.join("\n"));
      return;
    }
    setError("");
    try {
      const id = await run(
        "SAVE_FINDINGS",
        {
          findings: blocks.map(({ fields, score }) => {
            const alignments = alignmentValues(fields);
            const hasEvidence =
              !!String(fields.explanation || "").trim() &&
              !!String(fields.evidence || "").trim();
            return {
              ...fields,
              alignments,
              alignment: alignments.length === 1 ? alignments[0] : "",
              basis: hasEvidence ? "EVIDENCED" : "NEEDS_CHECKING",
              weightage: score === "" ? null : Number(score),
              priority: findingPriority(score === "" ? null : Number(score)),
              reviewStatus: hasEvidence ? "UNDER_REVIEW" : "NEEDS_EVIDENCE",
            };
          }),
        },
        document.id,
        revision,
      );
      onClose();
      onSaved?.(id, false);
    } catch (cause) {
      setError(
        cause instanceof PlanningApiError && cause.status === 409
          ? "Planning records changed while this form was open. Your entries are still here. Copy them if needed, then close and reopen the form before saving. No finding from this batch was saved."
          : cause instanceof Error
            ? cause.message
            : "Could not save these findings. Your entries are still here.",
      );
    }
  }
  return (
    <Modal
      wide
      title={editing ? "Edit finding" : "Add a SWOT finding"}
      description={`Planning period ${planningPeriodLabel(document.cycle)} · Each block becomes a separate finding.`}
      onClose={close}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {editing
              ? "One finding, one record."
              : `${blocks.length} separate finding${blocks.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={close}
              disabled={busy}
            >
              {editable ? "Cancel" : "Close"}
            </Button>
            {editable && (
              <Button type="button" onClick={() => void save()} disabled={busy}>
                {busy ? "Saving…" : editing ? "Save draft" : "Save draft"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <ErrorList error={error} />
        <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-6 text-slate-700">
          Write one condition in each block. Put supporting facts and proposed
          solutions in their own fields. You can save an incomplete draft.
        </p>
        {!editable && (
          <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <LockKeyhole size={16} className="mt-0.5 shrink-0" />
            {reviewed
              ? "This finding has been reviewed. Reopen it with a reason before changing its evidence or decision."
              : "This assessment is read-only. Use the plan’s revision process to make changes."}
          </p>
        )}
        {blocks.map((item, index) => {
          const text = (name: string) => String(item.fields[name] ?? "");
          const score = item.score === "" ? null : Number(item.score);
          const scoreInvalid =
            item.badScore ||
            (item.score !== "" && !validFindingWeightage(score));
          const area = (name: string, label: string, hint?: string) => (
            <Field label={label} hint={hint}>
              <textarea
                className={control}
                rows={name === "title" ? 3 : 2}
                maxLength={name === "title" ? 350 : 4000}
                value={text(name)}
                onChange={(event) => update(item.key, name, event.target.value)}
              />
            </Field>
          );
          const select = (name: string, label: string, options: string[][]) => (
            <Field label={label}>
              <select
                className={control}
                value={text(name)}
                onChange={(event) => update(item.key, name, event.target.value)}
              >
                <option value="">Select…</option>
                {options.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          );
          return (
            <fieldset
              key={item.key}
              data-finding-block={item.key}
              disabled={busy || !editable}
              className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <legend className="px-2 text-sm font-semibold text-slate-900">
                Finding {index + 1}
                {text("code") ? ` · ${text("code")}` : ""}
              </legend>
              {!editing && blocks.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBlocks((items) =>
                        items.filter((entry) => entry.key !== item.key),
                      );
                      setDirty(true);
                    }}
                    aria-label={`Remove finding ${index + 1}`}
                  >
                    <Trash2 size={14} />
                    Remove block
                  </Button>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {select(
                  "pillar",
                  "Main pillar",
                  data.references.pillars.map((pillar) => [
                    pillar.code,
                    `${pillar.code} · ${pillar.name}`,
                  ]),
                )}
                {select(
                  "category",
                  "SWOT category",
                  Object.entries(categories).map(([id, value]) => [
                    id,
                    value.singular,
                  ]),
                )}
              </div>
              {area(
                "title",
                "What did you find?",
                "Write one finding in this block. Use Add another finding for the next one.",
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {area(
                  "explanation",
                  "Supporting data",
                  "Add facts, observations or figures behind this finding.",
                )}
                {area(
                  "evidence",
                  "Reference / source / period",
                  "Name the source and the period it covers.",
                )}
              </div>
              {area("impact", "Why does this matter to the business?")}
              <BusinessAlignmentFields
                values={alignmentValues(item.fields)}
                businessFocus={text("otherBusinessFocus")}
                onChange={(values) => update(item.key, "alignments", values)}
                onBusinessFocusChange={(value) =>
                  update(item.key, "otherBusinessFocus", value)
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Field
                    label="Importance / weightage (1–10)"
                    hint="1–3 Low · 4–7 Medium · 8–10 High. Optional while drafting."
                  >
                    <input
                      className={control}
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={item.score}
                      aria-invalid={scoreInvalid || undefined}
                      onChange={(event) => {
                        const value = event.target.value,
                          badScore = event.target.validity.badInput;
                        setDirty(true);
                        setBlocks((items) =>
                          items.map((entry) =>
                            entry.key === item.key
                              ? { ...entry, score: value, badScore }
                              : entry,
                          ),
                        );
                      }}
                    />
                  </Field>
                  {scoreInvalid && (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      Use a whole number from 1 to 10.
                    </p>
                  )}
                </div>
                <div className="text-sm font-medium text-slate-700">
                  <p>Priority band</p>
                  <div className="mt-3">
                    <FindingWeightage weightage={score} />
                  </div>
                  <p className="mt-2 text-xs font-normal text-slate-500">
                    Calculated from the importance entered above.
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {reviewed
                  ? "Reviewed finding. Reopen with a reason before making changes."
                  : `${text("explanation").trim() && text("evidence").trim() ? "Will appear in Under review." : "Will appear in Needs evidence."} Saving does not approve this finding.`}
              </p>
            </fieldset>
          );
        })}
        {!editing && editable && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={add}
              disabled={busy || blocks.length >= 50}
            >
              <Plus size={16} />
              Add another finding
            </Button>
            <span className="text-xs text-slate-500">
              Up to 50 separate findings per save.
            </span>
          </div>
        )}
        {editing && (
          <PlanningEvidence
            document={document}
            findingId={String(initial.id)}
            editable={editable && !hasReviewedHistory}
            expectedRevision={revision}
            onUploaded={setRevision}
          />
        )}
        {editing && editable && !hasReviewedHistory && (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Delete this unreviewed finding? Linked records cannot be deleted.",
                )
              )
                return;
              try {
                await run(
                  "DELETE_ITEM",
                  { kind: "finding", id: initial.id },
                  document.id,
                  revision,
                );
                onClose();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not delete this finding.",
                );
              }
            }}
          >
            Delete draft finding
          </Button>
        )}
        {!editing && (
          <p className="text-xs text-slate-500">
            Save first, then open an individual finding to attach supporting
            files.
          </p>
        )}
      </form>
    </Modal>
  );
}
