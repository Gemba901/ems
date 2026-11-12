"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast.context";
import type { useDirectionActions } from "@/hooks/leadership-excellence/useStrategicDirection";
import {
  FIELD_LABELS,
  FIELD_LIMITS,
  PILLAR_TOTAL,
  StrategicDirectionApiError,
  TEXT_FIELDS,
  VALUE_LIMITS,
  weightsTotal,
  type DirectionProblem,
  type PillarWeights,
  type SaveDraftPayload,
  type StrategicDirectionDraft,
  type TextField as Field,
} from "@/services/leadership-excellence/strategic-direction.service";
import { PillarsSection } from "./PillarsSection";
import { ReviewSection } from "./ReviewSection";
import { ConfirmDialog, Guide, Notice, SectionCard, SectionMeta, TextField, formatDate } from "./ui";

type ValueRow = { id: string; name: string; why: string };
type FormState = Record<Field, string> & {
  values: ValueRow[];
  pillarWeights: PillarWeights;
};
type Dialog = "approve" | "return" | "revise" | null;

// The API accepts client-made v4 ids, so new values keep the same id (and field anchors) after saving.
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function toForm(draft: StrategicDirectionDraft): FormState {
  const form = {
    values: draft.values.map((v) => ({ ...v })),
    pillarWeights: { ...draft.pillarWeights },
  } as FormState;
  for (const field of TEXT_FIELDS) form[field] = draft[field] ?? "";
  return form;
}

function toPayload(form: FormState, expectedUpdatedAt?: string): SaveDraftPayload {
  const payload: SaveDraftPayload = {
    values: form.values,
    pillarWeights: form.pillarWeights,
    ...(expectedUpdatedAt && { expectedUpdatedAt }),
  };
  for (const field of TEXT_FIELDS) payload[field] = form[field];
  return payload;
}

/** Labels of every field over its character limit; nothing over the limit can be saved. */
function overLimit(form: FormState): string[] {
  const over = TEXT_FIELDS.filter((f) => form[f].length > FIELD_LIMITS[f]).map((f) => FIELD_LABELS[f]);
  if (form.values.length > VALUE_LIMITS.count) over.push(`More than ${VALUE_LIMITS.count} core values`);
  form.values.forEach((v, i) => {
    if (v.name.length > VALUE_LIMITS.name) over.push(`Value ${i + 1} name`);
    if (v.why.length > VALUE_LIMITS.why) over.push(`Value ${i + 1} explanation`);
  });
  return over;
}

const sameForm = (a: FormState, b: FormState) => JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b));

/**
 * 01.01 for management-level editors. The page remounts it (via `key`) whenever the
 * saved draft changes, so the form always starts from the server copy.
 */
export function CompanyDirectionEditor({
  draft,
  canManageApprovers,
  actions,
  problems,
  setProblems,
}: {
  draft: StrategicDirectionDraft;
  /** ADMIN and SUPER_ADMIN choose who approves. */
  canManageApprovers: boolean;
  actions: ReturnType<typeof useDirectionActions>;
  /** Owned by the page: saving remounts this component, and the list must survive that. */
  problems: DirectionProblem[];
  setProblems: (problems: DirectionProblem[]) => void;
}) {
  const { toast } = useToast();
  const initial = useMemo(() => toForm(draft), [draft]);
  const [form, setForm] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);

  const review = draft.status === "IN_REVIEW";
  const locked = draft.status === "APPROVED";
  const editable = draft.status === "DRAFT";
  const dirty = !sameForm(form, initial);
  const invalid = new Set(problems.map((p) => p.field));
  const busy = Object.values(actions).some((m) => m.isPending);
  const canReview = draft.viewer.canReview;
  const noApprovers = draft.approvers.length === 0;
  const tooLong = overLimit(form);
  const weightTotal = weightsTotal(form.pillarWeights);
  const weightsOff = weightTotal !== PILLAR_TOTAL;

  // Warn before leaving the page with unsaved typing.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setField = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));
  const setValue = (id: string, patch: Partial<ValueRow>) =>
    setForm((f) => ({
      ...f,
      values: f.values.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  const addValue = () =>
    setForm((f) => ({
      ...f,
      values: [...f.values, { id: newId(), name: "", why: "" }],
    }));
  const removeValue = (id: string) => setForm((f) => ({ ...f, values: f.values.filter((v) => v.id !== id) }));

  // Shows the API's missing-field list as the error summary; other failures as a toast.
  async function run(task: () => Promise<unknown>, success: string) {
    try {
      await task();
      setProblems([]);
      setDialog(null);
      toast(success, "success");
    } catch (error) {
      setDialog(null);
      if (error instanceof StrategicDirectionApiError && error.problems.length > 0) {
        setProblems(error.problems);
        requestAnimationFrame(() => document.getElementById("direction-errors")?.focus());
      } else {
        toast(error instanceof Error ? error.message : "Something went wrong.", "error");
      }
    }
  }

  const save = () => actions.save.mutateAsync(toPayload(form, draft.updatedAt));
  // Submitting uses the saved draft, so save unsaved typing first.
  const saveIfDirty = async () => {
    if (dirty) await save();
  };

  const field = (
    name: Field,
    props: {
      multiline?: boolean;
      hint?: string;
      placeholder?: string;
      label?: string;
      required?: boolean;
    },
  ) => (
    <TextField
      id={name}
      label={props.label ?? FIELD_LABELS[name]}
      value={form[name]}
      onChange={setField(name)}
      maxLength={FIELD_LIMITS[name]}
      readOnly={!editable}
      invalid={invalid.has(name)}
      multiline={props.multiline}
      hint={props.hint}
      placeholder={props.placeholder}
      required={props.required}
    />
  );

  return (
    <div className="space-y-5">
      {draft.approved && (
        <Notice tone="success">
          Approved version {draft.approved.version} is live · {formatDate(draft.approved.approvedAt)}
          {draft.approved.approvedByName && ` · ${draft.approved.approvedByName}`}
        </Notice>
      )}

      {review && (
        <Notice>
          Submitted{draft.submittedByName && ` by ${draft.submittedByName}`}
          {draft.submittedAt && ` on ${formatDate(draft.submittedAt)}`}.{" "}
          {canReview
            ? "Review the direction, then approve or return it for changes."
            : draft.viewer.isSubmitter && draft.viewer.isApprover
              ? "You sent this for review, so another approver must approve it. You can withdraw it to make changes."
              : "This draft is read only while the approvers review it. You can withdraw it to make changes."}
        </Notice>
      )}
      {editable && noApprovers && (
        <Notice tone="warning">
          {canManageApprovers
            ? "Choose who approves the company direction in Preview & send before sending it for review."
            : "No approvers are chosen yet. Ask an admin to choose approvers before you send this for review."}
        </Notice>
      )}
      {!review && draft.returnReason && <Notice tone="warning">Changes requested: {draft.returnReason}</Notice>}

      {locked && (
        <Notice
          action={
            <Button variant="outline" onClick={() => setDialog("revise")} disabled={busy}>
              Create revision
            </Button>
          }
        >
          <strong>Approved &amp; locked.</strong> The approved wording is read only. Start a revision when it needs to
          change.
        </Notice>
      )}
      {editable && draft.approved && (
        <Notice>
          You are editing a revision
          {draft.revisionReason && ` (${draft.revisionReason})`}. Employees still see the current approved version until
          this revision is approved.
        </Notice>
      )}

      {editable && tooLong.length > 0 && (
        <Notice tone="warning">Shorten these before saving: {tooLong.join(", ")}.</Notice>
      )}

      {problems.length > 0 && (
        <div
          id="direction-errors"
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm outline-none"
        >
          <p className="font-medium text-destructive">Complete these items first:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problems.map((p) => (
              <li key={p.field}>
                <a
                  href={`#${p.field === "values" ? "values-section" : p.field === "pillarWeights" ? "pillars-section" : p.field}`}
                  className="underline underline-offset-2"
                >
                  {p.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        id="direction-form"
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (editable && tooLong.length === 0) void run(save, "Draft saved.");
        }}
      >
        <SectionCard
          id="organisation"
          number="01"
          label="01.01 · Company direction"
          title="Company & purpose"
          description="Tell us who you are and why your organisation exists."
        >
          <Guide title="How to write your company direction">
            Use the organisation&apos;s official name and describe its business. Purpose explains why the organisation
            exists, whom it serves and the value it creates. Then describe the future in the Vision, daily work in the
            Mission, and expected behaviour in the Values.
          </Guide>
          <div className="grid gap-5 sm:grid-cols-2">
            {field("company", { placeholder: "Enter your organisation name" })}
            {field("business", {
              placeholder: "For example: Furniture manufacturing",
            })}
          </div>
          {field("purpose", {
            label: "Purpose: Why we exist",
            multiline: true,
            placeholder: "Explain why your organisation exists, whom it serves and the value it creates.",
            hint: "Describe your reason for existing, beyond simply earning money.",
          })}
          <SectionMeta stamp={draft.sectionMeta.organisation} />
        </SectionCard>

        <SectionCard
          id="vision-section"
          number="02"
          title="Vision: Our North Star"
          description="What future do we want to create?"
        >
          {field("vision", {
            multiline: true,
            placeholder: "Write your vision here...",
            hint: "Keep the statement short and clear. Use the box below for the explanation.",
          })}
          {field("visionWhy", {
            multiline: true,
            required: true,
            placeholder: "Why have we chosen this vision? How will it guide our future decisions and development?",
            hint: "Help everyone understand why this future matters to the organisation.",
          })}
          <SectionMeta stamp={draft.sectionMeta.vision} />
        </SectionCard>

        <SectionCard
          id="mission-section"
          number="03"
          title="Mission: Our Path"
          description="What do we do every day to move towards our vision?"
        >
          {field("mission", {
            multiline: true,
            placeholder: "Write your mission here...",
            hint: "Describe what you do, whom you serve and how you create value.",
          })}
          {field("missionWhy", {
            multiline: true,
            required: true,
            placeholder:
              "Why is this mission right for us? How will it guide daily work, shape our culture and help us achieve our vision?",
            hint: "Explain the connection between everyday work and your long-term direction.",
          })}
          <SectionMeta stamp={draft.sectionMeta.mission} />
        </SectionCard>

        <SectionCard
          id="values-section"
          number="04"
          title="Core values: How we work"
          description="Give each value a short name, then explain what it means in daily work."
        >
          {form.values.length === 0 && <p className="text-sm text-muted-foreground">No values yet.</p>}
          {form.values.map((v, i) => (
            <div key={v.id} className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Value {i + 1}</span>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove value ${i + 1}`}
                    onClick={() => removeValue(v.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <TextField
                id={`${v.id}-name`}
                label="Value name"
                value={v.name}
                onChange={(name) => setValue(v.id, { name })}
                maxLength={VALUE_LIMITS.name}
                readOnly={!editable}
                invalid={invalid.has(`${v.id}-name`)}
                placeholder="For example: Ownership"
              />
              <TextField
                id={`${v.id}-why`}
                label="What it means in daily work"
                value={v.why}
                onChange={(why) => setValue(v.id, { why })}
                maxLength={VALUE_LIMITS.why}
                readOnly={!editable}
                invalid={invalid.has(`${v.id}-why`)}
                multiline
                rows={3}
              />
            </div>
          ))}
          {editable && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={addValue}
                disabled={form.values.length >= VALUE_LIMITS.count}
              >
                <Plus /> Add value
              </Button>
              <span className="text-xs text-muted-foreground">
                Add the values you need, up to {VALUE_LIMITS.count}.
              </span>
            </div>
          )}
          <SectionMeta stamp={draft.sectionMeta.values} />
        </SectionCard>
      </form>

      <PillarsSection
        number="05"
        weights={form.pillarWeights}
        onChange={(pillarWeights) => setForm((f) => ({ ...f, pillarWeights }))}
        editable={editable}
        invalid={invalid.has("pillarWeights")}
        stamp={draft.sectionMeta.pillars}
      />
      <ReviewSection
        number="06"
        draft={draft}
        content={form}
        dirty={dirty}
        canManageApprovers={canManageApprovers}
        actions={actions}
      />

      {/* Sticky action bar, as the prototype footer. Outside the form so it stays put across the whole page. */}
      <div className="sticky bottom-2 z-20 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-[0_-4px_14px_rgb(21_49_60/0.08)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {actions.save.isPending
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : draft.id
                  ? "All changes saved"
                  : "Ready for you to write"}
          </span>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || noApprovers || tooLong.length > 0 || weightsOff}
                  title={
                    tooLong.length > 0
                      ? "Shorten the fields over their limit first."
                      : weightsOff
                        ? `Pillar weights add up to ${weightTotal}%; they must total ${PILLAR_TOTAL}%.`
                        : undefined
                  }
                  onClick={() =>
                    run(async () => {
                      await saveIfDirty();
                      await actions.submit.mutateAsync();
                    }, "Sent for review.")
                  }
                >
                  Send for review
                </Button>
                <Button type="submit" form="direction-form" disabled={busy || !dirty || tooLong.length > 0}>
                  {actions.save.isPending ? "Saving…" : "Save draft"}
                </Button>
              </>
            )}
            {review && canReview && (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog("return")}>
                  Return for changes
                </Button>
                <Button type="button" disabled={busy} onClick={() => setDialog("approve")}>
                  Approve &amp; lock
                </Button>
              </>
            )}
            {review && !canReview && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => run(() => actions.withdraw.mutateAsync(), "Submission withdrawn. You can edit again.")}
              >
                Withdraw to edit
              </Button>
            )}
            {locked && (
              <Button type="button" disabled={busy} onClick={() => setDialog("revise")}>
                Create revision
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "approve"}
        title="Approve & lock"
        message={`This publishes the direction as version ${(draft.currentVersion ?? 0) + 1}. Everyone in the organisation will see it, and it becomes read only.`}
        confirmLabel="Approve & lock"
        pending={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => run(() => actions.approve.mutateAsync(), "Company direction approved and locked.")}
      />
      <ConfirmDialog
        open={dialog === "return"}
        title="Return for changes"
        message="The draft goes back to its editors with your note."
        confirmLabel="Return draft"
        reasonLabel="What needs to change?"
        reasonPlaceholder="For example: Make the vision shorter and more specific."
        pending={busy}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run(() => actions.returnForChanges.mutateAsync(reason), "Returned for changes.")}
      />
      <ConfirmDialog
        open={dialog === "revise"}
        title="Create revision"
        message="This opens an editable copy of the approved wording. Employees keep seeing the approved version until the revision is approved."
        confirmLabel="Create revision"
        reasonLabel="Reason for the change"
        reasonPlaceholder="Briefly explain why this revision is needed."
        pending={busy}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run(() => actions.startRevision.mutateAsync(reason), "Revision started.")}
      />
    </div>
  );
}
