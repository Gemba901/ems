"use client";

import { useState } from "react";
import { PlanningApiError } from "@/services/leadership-excellence/performance-planning.service";
import {
  reviewLibraryRefresh,
  type LibraryOperation,
} from "@/services/leadership-excellence/performance-intelligence/library-conflicts";
import type { KpiDefinition } from "@/services/leadership-excellence/performance-planning/types";
import type {
  LibraryCommand,
  LibraryEntry,
  LibraryView,
} from "@/services/leadership-excellence/performance-intelligence/library";
import { planningFrequencies } from "@/services/leadership-excellence/performance-planning/calendar-options";
import {
  Button,
  control,
  ErrorList,
  Field,
  Modal,
} from "../performance-planning/PlanningUi";

export type LibrarySave = (command: LibraryCommand) => Promise<void>;
export type LibraryRefresh = () => Promise<LibraryView>;

function useLibraryRecovery(
  data: LibraryView,
  entry: LibraryEntry | undefined,
  operation: LibraryOperation,
  refreshLibrary: LibraryRefresh,
) {
  const [view, setView] = useState(data);
  const [review, setReview] = useState(() =>
    reviewLibraryRefresh(entry, data, operation),
  );
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      const latest = await refreshLibrary();
      // Never advance the revision from a failed request or a background cache update.
      setView(latest);
      setReview(reviewLibraryRefresh(entry, latest, operation));
      setNeedsRefresh(false);
      setRefreshed(true);
    } finally {
      setRefreshing(false);
    }
  }
  return {
    view,
    review,
    needsRefresh,
    refreshing,
    refreshed,
    refresh,
    failed: (error: unknown) => {
      if (error instanceof PlanningApiError && error.status === 409)
        setNeedsRefresh(true);
    },
  };
}

function SavedDefinition({
  entry,
  data,
}: {
  entry: LibraryEntry;
  data: LibraryView;
}) {
  const definition = entry.definition;
  const formula =
    definition.formula === "DIRECT"
      ? definition.inputA || "Direct reading"
      : `${definition.inputA || "A"} ÷ ${definition.inputB || "B"}${definition.formula === "PERCENT" ? " × 100" : ""}`;
  const rows = [
    [
      "Responsibility area",
      data.kras.find((kra) => kra.id === definition.kraId)?.name ||
        "Not selected",
    ],
    ["Meaning", definition.meaning],
    ["Calculation", formula],
    ["Unit", definition.unit],
    [
      "Direction",
      {
        HIGHER: "Higher is better",
        LOWER: "Lower is better",
        RANGE: "Within a range",
        ZERO: "Zero",
        MILESTONE: "Milestone achieved",
      }[definition.direction],
    ],
    [
      "Period summary",
      {
        SUM: "Sum of recorded values",
        RATIO: "Combined source figures, then calculate the ratio",
        CLOSING: "Closing value",
        MILESTONE: "Milestone completion",
      }[definition.aggregation],
    ],
    ["Suitable data source", definition.dataSource],
    [
      "Suggested frequency",
      planningFrequencies.find(
        ([frequency]) => frequency === definition.suggestedFrequency,
      )?.[1] || "Choose in the plan",
    ],
    [
      "Approver",
      data.approvers.find((person) => person.id === entry.approverId)?.name ||
        "Not available",
    ],
    ["Effective from", entry.effectiveDate],
    ["Revision reason", entry.revisionReason],
  ];
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-xs text-slate-500">
          Latest saved definition · {definition.code}
        </p>
        <h3 className="mt-1 font-semibold">
          {definition.name || "Untitled definition"}
        </h3>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">
              {value || "Not entered"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RecoveryNotice({
  recovery,
  busy,
  onRefresh,
}: {
  recovery: ReturnType<typeof useLibraryRecovery>;
  busy: boolean;
  onRefresh: () => void;
}) {
  if (!recovery.needsRefresh && !recovery.refreshed) return null;
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p role="status">
        {recovery.needsRefresh
          ? "The library changed while this form was open. Refresh its saved data before continuing. Your entered values will be kept."
          : recovery.review.message}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onRefresh}
        disabled={busy || recovery.refreshing}
      >
        {recovery.refreshing ? "Refreshing…" : "Refresh and keep my entries"}
      </Button>
    </div>
  );
}

type Draft = Omit<KpiDefinition, "id" | "code" | "source"> & {
  kraName: string;
  approverId: string;
};
export function LibraryEditor({
  data,
  entry,
  adapt,
  save,
  refreshLibrary,
  onClose,
}: {
  data: LibraryView;
  entry?: LibraryEntry;
  adapt?: boolean;
  save: LibrarySave;
  refreshLibrary: LibraryRefresh;
  onClose: () => void;
}) {
  const recovery = useLibraryRecovery(
    data,
    entry,
    adapt ? "ADAPT" : "SAVE_DRAFT",
    refreshLibrary,
  );
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [form, setForm] = useState<Draft>(() => ({
    kraId: entry?.definition.kraId || "",
    kraName: "",
    name: entry ? `${entry.definition.name}${adapt ? " (adapted)" : ""}` : "",
    meaning: entry?.definition.meaning || "",
    unit: entry?.definition.unit || "",
    direction: entry?.definition.direction || "LOWER",
    formula: entry?.definition.formula || "DIRECT",
    inputA: entry?.definition.inputA || "",
    inputB: entry?.definition.inputB || "",
    aggregation: entry?.definition.aggregation || "SUM",
    dataSource: entry?.definition.dataSource || "",
    suggestedFrequency: entry?.definition.suggestedFrequency || "",
    approverId: adapt ? "" : entry?.approverId || "",
    adaptedFromId: adapt
      ? entry?.definition.id
      : entry?.definition.adaptedFromId,
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const disabled =
    busy ||
    recovery.refreshing ||
    recovery.needsRefresh ||
    !recovery.review.allowed ||
    (recovery.review.requiresConfirmation && !reviewConfirmed);
  async function refresh() {
    setReviewConfirmed(false);
    setError("");
    try {
      await recovery.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The latest library could not be loaded. Your entries have been kept.",
      );
    }
  }
  const change = (key: keyof Draft, value: string) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const close = () => {
    if (
      !busy &&
      !recovery.refreshing &&
      (!dirty ||
        window.confirm("Discard the unsaved changes to this definition?"))
    )
      onClose();
  };
  const text = (
    key: "name" | "unit" | "inputA" | "inputB" | "kraName" | "dataSource",
    label: string,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <input
        className={control}
        value={form[key] || ""}
        onChange={(event) => change(key, event.target.value)}
      />
    </Field>
  );
  return (
    <Modal
      wide
      title={
        adapt
          ? "Adapt KPI definition"
          : entry
            ? "Edit KPI draft"
            : "Create KPI definition"
      }
      onClose={close}
      description="Save an incomplete draft at any time. Targets, people and reporting calendars are set in the plan."
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={close}
            disabled={busy || recovery.refreshing}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="library-definition-form"
            disabled={disabled}
          >
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </div>
      }
    >
      <form
        id="library-definition-form"
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled) return;
          setBusy(true);
          setError("");
          try {
            await save({
              expectedRevision: recovery.view.revision,
              action: "SAVE_DRAFT",
              definitionId: adapt ? undefined : entry?.definition.id,
              payload: { ...form },
            });
            onClose();
          } catch (cause) {
            recovery.failed(cause);
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not save the definition.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorList error={error} />
        <RecoveryNotice
          recovery={recovery}
          busy={busy}
          onRefresh={() => void refresh()}
        />
        {recovery.review.changed && recovery.review.entry && (
          <SavedDefinition entry={recovery.review.entry} data={recovery.view} />
        )}
        <fieldset
          disabled={busy || recovery.refreshing}
          className="min-w-0 space-y-5"
        >
          {recovery.review.requiresConfirmation && (
            <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-indigo-600"
                checked={reviewConfirmed}
                onChange={(event) => setReviewConfirmed(event.target.checked)}
              />
              <span>
                {adapt
                  ? "I have reviewed the updated source definition and want to save the entered values as a new draft."
                  : "I have reviewed the latest saved definition and want to replace its draft values with the values entered below."}
              </span>
            </label>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsibility area (KRA)">
              <select
                className={control}
                value={form.kraId}
                onChange={(event) => change("kraId", event.target.value)}
              >
                <option value="">Create a responsibility area</option>
                {form.kraId &&
                  !recovery.view.kras.some((kra) => kra.id === form.kraId) && (
                    <option value={form.kraId}>
                      Previously selected KRA (unavailable)
                    </option>
                  )}
                {recovery.view.kras.map((kra) => (
                  <option key={kra.id} value={kra.id}>
                    {kra.name}
                  </option>
                ))}
              </select>
            </Field>
            {!form.kraId ? (
              text("kraName", "New KRA name")
            ) : (
              <div className="self-end pb-3 text-sm text-slate-500">
                A KRA groups measures for one responsibility area.
              </div>
            )}
          </div>
          {text("name", "KPI name")}
          <Field label="What does this KPI measure?">
            <textarea
              className={control}
              rows={3}
              value={form.meaning}
              onChange={(event) => change("meaning", event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {text(
              "unit",
              "Unit",
              "For example %, hours, KES/unit or completed checks.",
            )}
            <Field label="Good performance means">
              <select
                className={control}
                value={form.direction}
                onChange={(event) => change("direction", event.target.value)}
              >
                <option value="HIGHER">Higher is better</option>
                <option value="LOWER">Lower is better</option>
                <option value="RANGE">Within a range</option>
                <option value="ZERO">Zero</option>
                <option value="MILESTONE">Milestone achieved</option>
              </select>
            </Field>
            <Field label="Calculation">
              <select
                className={control}
                value={form.formula}
                onChange={(event) => {
                  setDirty(true);
                  const formula = event.target.value as Draft["formula"];
                  setForm((current) => ({
                    ...current,
                    formula,
                    aggregation: formula === "DIRECT" ? "SUM" : "RATIO",
                  }));
                }}
              >
                <option value="DIRECT">Direct reading</option>
                <option value="RATIO">A ÷ B</option>
                <option value="PERCENT">A ÷ B × 100</option>
              </select>
            </Field>
            <Field label="Combine reporting periods">
              <select
                className={control}
                value={form.aggregation}
                onChange={(event) => change("aggregation", event.target.value)}
              >
                {form.formula !== "DIRECT" ? (
                  <option value="RATIO">
                    Recalculate using combined source figures
                  </option>
                ) : (
                  <>
                    <option value="SUM">Sum of recorded values</option>
                    <option value="CLOSING">Closing value</option>
                    <option value="MILESTONE">Milestone completion</option>
                  </>
                )}
              </select>
            </Field>
            {text(
              "inputA",
              form.formula === "DIRECT"
                ? "Reading name"
                : "Input A / numerator",
            )}
            {form.formula !== "DIRECT" &&
              text("inputB", "Input B / denominator")}
          </div>
          {text(
            "dataSource",
            "Suitable data source",
            "Describe where reliable source figures can be obtained, for example the verified production register.",
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Suggested reporting frequency (optional)"
              hint="A suggestion only. Each plan uses its own approved calendar."
            >
              <select
                className={control}
                value={form.suggestedFrequency || ""}
                onChange={(event) =>
                  change("suggestedFrequency", event.target.value)
                }
              >
                <option value="">No suggestion</option>
                {planningFrequencies.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Approver">
              <select
                className={control}
                value={form.approverId}
                onChange={(event) => change("approverId", event.target.value)}
              >
                <option value="">Select when ready for review</option>
                {form.approverId &&
                  !recovery.view.approvers.some(
                    (person) => person.id === form.approverId,
                  ) && (
                    <option value={form.approverId}>
                      Previously selected approver (unavailable)
                    </option>
                  )}
                {recovery.view.approvers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {adapt && (
            <p className="text-sm text-slate-500">
              Adapted from {entry?.definition.code}. The original definition
              stays unchanged.
            </p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

export function LibraryDecision({
  data,
  entry,
  action,
  save,
  refreshLibrary,
  onClose,
}: {
  data: LibraryView;
  entry: LibraryEntry;
  action: "SUBMIT" | "APPROVE" | "RETURN" | "REVISE";
  save: LibrarySave;
  refreshLibrary: LibraryRefresh;
  onClose: () => void;
}) {
  const recovery = useLibraryRecovery(data, entry, action, refreshLibrary);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [approverId, setApprover] = useState(entry.approverId);
  const latestEntry = recovery.review.entry;
  const previousDate = latestEntry?.versions.at(-1)?.effectiveDate;
  const firstAllowedDate =
    previousDate && previousDate >= recovery.view.today
      ? new Date(Date.parse(`${previousDate}T00:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10)
      : recovery.view.today;
  const [effectiveDate, setEffectiveDate] = useState(
    action === "REVISE" ||
      !entry.effectiveDate ||
      entry.effectiveDate < firstAllowedDate
      ? firstAllowedDate
      : entry.effectiveDate,
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const disabled =
    busy ||
    recovery.refreshing ||
    recovery.needsRefresh ||
    !recovery.review.allowed ||
    (action === "APPROVE"
      ? !confirmed
      : recovery.review.requiresConfirmation && !reviewConfirmed);
  async function refresh() {
    setConfirmed(false);
    setReviewConfirmed(false);
    setError("");
    try {
      await recovery.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The latest library could not be loaded. Your entries have been kept.",
      );
    }
  }
  const labels = {
    SUBMIT: "Send for review",
    APPROVE: "Approve definition",
    RETURN: "Return for changes",
    REVISE: "Create a revision",
  };
  return (
    <Modal
      title={labels[action]}
      onClose={() => {
        if (!busy && !recovery.refreshing) onClose();
      }}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled) return;
          setBusy(true);
          setError("");
          try {
            await save({
              expectedRevision: recovery.view.revision,
              action,
              definitionId: entry.definition.id,
              payload:
                action === "SUBMIT"
                  ? { approverId, effectiveDate }
                  : action === "REVISE"
                    ? { reason, effectiveDate, approverId }
                    : action === "RETURN"
                      ? { reason }
                      : { effectiveDate },
            });
            onClose();
          } catch (cause) {
            recovery.failed(cause);
            setConfirmed(false);
            setReviewConfirmed(false);
            setError(
              cause instanceof Error
                ? cause.message
                : "The change could not be saved.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorList error={error} />
        <RecoveryNotice
          recovery={recovery}
          busy={busy}
          onRefresh={() => void refresh()}
        />
        {latestEntry && (
          <SavedDefinition entry={latestEntry} data={recovery.view} />
        )}
        <fieldset
          disabled={busy || recovery.refreshing}
          className="min-w-0 space-y-4"
        >
          {recovery.review.changed && action !== "APPROVE" && (
            <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-indigo-600"
                checked={reviewConfirmed}
                onChange={(event) => setReviewConfirmed(event.target.checked)}
              />
              <span>
                I have reviewed the latest saved definition before continuing
                with this action.
              </span>
            </label>
          )}
          {(action === "SUBMIT" || action === "REVISE") && (
            <>
              <Field label="Single approver">
                <select
                  className={control}
                  value={approverId}
                  onChange={(event) => setApprover(event.target.value)}
                >
                  <option value="">Select approver</option>
                  {approverId &&
                    !recovery.view.approvers.some(
                      (person) => person.id === approverId,
                    ) && (
                      <option value={approverId}>
                        Previously selected approver (unavailable)
                      </option>
                    )}
                  {recovery.view.approvers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {action !== "RETURN" && (
            <Field
              label="Effective from"
              hint={
                previousDate
                  ? "Choose a date after the previous approved version's effective date."
                  : undefined
              }
            >
              <input
                className={control}
                type="date"
                min={firstAllowedDate}
                value={effectiveDate}
                onChange={(event) => {
                  setEffectiveDate(event.target.value);
                  setConfirmed(false);
                }}
              />
            </Field>
          )}
          {(action === "RETURN" || action === "REVISE") && (
            <Field
              label={
                action === "REVISE"
                  ? "Reason for revision"
                  : "What needs to change?"
              }
            >
              <textarea
                className={control}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          )}
          {action === "REVISE" && (
            <p className="text-sm text-slate-500">
              The previous approved version stays active while the revision is
              prepared. Existing approved plans keep their saved definitions.
            </p>
          )}
          {action === "APPROVE" && (
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-1 accent-indigo-600"
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I have checked the definition, calculation, unit and source.
                Approval locks this version, effective {effectiveDate}.
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || recovery.refreshing}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {busy ? "Saving…" : labels[action]}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
