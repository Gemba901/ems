"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Plus,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth.store";
import {
  calendarsApi,
  type CalendarDetail,
  type CalendarHistory,
  type CalendarIndex,
  type HolidaySuggestion,
} from "@/services/leadership-excellence/rules-calendar.service";
import { CalendarPreview } from "./CalendarPreview";
import { cycleDateIssue, validCycleDate } from "./cycle-dates";
import styles from "./rules-calendar.module.css";
import {
  initialRules,
  FREQUENCIES,
  DIRECTIONS,
  type ApprovedCalendarSnapshot,
  type CalendarException,
  type CalendarRules,
  type Frequency,
} from "./calendar-model";

import { useCalendarPreview } from "./useCalendarPreview";
import {
  FREQUENCY_LABELS as FREQ,
  DAYS,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_HELP,
  responsibilityChoices,
  displayDate,
  suggestedCycleEnd,
  exceptionIssue,
  cycleYears,
  mergeSuggestions,
  acceptedExceptions,
  cycleMonths,
  addDays,
} from "./calendar-editor";

const DIRECTION_LABELS = {
  higher: "Higher is better",
  lower: "Lower is better",
  range: "Within range",
  milestone: "Milestone",
  "zero-target": "Zero-target measure",
};
function Field({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 text-sm">
      <label className="block space-y-2">
        <span className="font-medium">{label}</span>
        {children}
      </label>
      {note && (
        <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-60"
    >
      {options.map(([v, label]) => (
        <option value={v} key={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className={styles.sectionHeader}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}
const failure = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request did not complete. Please try again.";

export function RulesCalendarPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  if (!user?.organizationId || !token)
    return <p role="status">Restoring company access…</p>;
  return (
    <CalendarWorkspace
      key={user.organizationId}
      timeZone={user.organizationTimeZone || "Africa/Nairobi"}
    />
  );
}

function CalendarWorkspace({ timeZone }: { timeZone: string }) {
  const token = useAuthStore((s) => s.accessToken) ?? "";
  const getToken = () => useAuthStore.getState().accessToken ?? "";
  const [index, setIndex] = useState<CalendarIndex | null>(null);
  const [detail, setDetail] = useState<CalendarDetail | null>(null);
  const [draftRules, setRules] = useState<CalendarRules>(() =>
    initialRules(new Date().getFullYear(), timeZone),
  );
  const [saved, setSaved] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const leaving = useRef(false);
  const [step, setStep] = useState(0);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [month, setMonth] = useState("");
  const [monthNotice, setMonthNotice] = useState("");
  const [previewRetry, setPreviewRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<ApprovedCalendarSnapshot | null>(
    null,
  );
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [countries, setCountries] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<HolidaySuggestion[] | null>(
    null,
  );
  const [holidayNote, setHolidayNote] = useState("");
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [holidayError, setHolidayError] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const emptyException = (): CalendarException => ({
    date: "",
    reason: "",
    kind: "NON_WORKING",
    source: "MANUAL",
  });
  const [exception, setException] = useState<CalendarException>(emptyException);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [exceptionError, setExceptionError] = useState("");
  const [duplicateDate, setDuplicateDate] = useState<string | null>(null);
  const [undo, setUndo] = useState<
    { before: CalendarException[]; after: CalendarException[]; label: string }[]
  >([]);
  const [history, setHistory] = useState<CalendarHistory[] | null>(null);
  const [confirm, setConfirm] = useState<
    "approve" | "revise" | "return" | null
  >(null);
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    run: () => void;
  } | null>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const holidayRequest = useRef<AbortController | null>(null);
  const defaults = useRef({ end: true, anchor: true });
  const sectionRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const exceptionRef = useRef<HTMLDivElement>(null);
  const canEdit = !!index?.capabilities.edit;
  const canApprove = !!index?.capabilities.approve;
  const rules = snapshot?.rules ?? draftRules;
  const readonly =
    !canEdit || !!snapshot || (!!detail && detail.status !== "DRAFT");
  const hasDocument = creating || !!detail;
  // Viewing an approved snapshot never discards the draft underneath it.
  const dirty =
    canEdit &&
    (creating || detail?.status === "DRAFT") &&
    JSON.stringify(draftRules) !== saved;
  const dateIssue = cycleDateIssue(rules.start, rules.end, true);
  const completeDateIssue = cycleDateIssue(rules.start, rules.end);
  const invalidExceptions = rules.exceptions.filter((e) =>
    exceptionIssue(rules, e.date),
  );
  const preview = useCalendarPreview(
    rules,
    frequency,
    snapshot,
    hasDocument && step === 2,
    token,
    previewRetry,
  );
  const previewReady = !!preview.value && !preview.busy && !preview.error;
  const months = cycleMonths(rules.start, rules.end);
  const eligibleSuggestions = (suggestions ?? []).filter(
    (e) => !rules.exceptions.some((x) => x.date === e.date),
  );
  const selectedCount = eligibleSuggestions.filter((e) =>
    checked.includes(e.date),
  ).length;
  function focus(ref: { current: HTMLElement | null }) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      ref.current?.focus({ preventScroll: true });
    });
  }
  function moveTo(next: number) {
    setStep(next);
    focus(sectionRef);
  }
  function showDetail(d: CalendarDetail, keepContext = false) {
    setDetail(d);
    setCreating(false);
    setHistory(null);
    setConfirm(null);
    setSuggestions(null);
    setChecked([]);
    setException(emptyException());
    setEditingDate(null);
    setExceptionError("");
    const published = !canEdit || d.status === "APPROVED";
    const r = d.draft ?? d.approved?.snapshot.rules;
    if (r) {
      setRules(r);
      setSaved(JSON.stringify(r));
    }
    setSnapshot(published ? (d.approved?.snapshot ?? null) : null);
    setViewVersion(published ? (d.approved?.version ?? null) : null);
    defaults.current = { end: false, anchor: false };
    setSaveFailed(false);
    if (!keepContext) {
      setUndo([]);
      setStep(published ? 2 : 0);
    }
  }
  async function refreshIndex() {
    const v = await calendarsApi.list(getToken());
    if (alive.current) setIndex(v);
  }
  async function reload(id: string, keepContext = false) {
    const d = await calendarsApi.read(getToken(), id);
    if (alive.current) showDetail(d, keepContext);
  }
  async function task(work: () => Promise<void>): Promise<boolean> {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      return true;
    } catch (e) {
      if (alive.current) setError(failure(e));
      return false;
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function navigate(run: () => void) {
    if (dirty) {
      setPendingNavigation({ run });
      focus(navigationRef);
    } else run();
  }
  function newCycle() {
    const next = initialRules(new Date().getFullYear(), timeZone);
    setDetail(null);
    setSnapshot(null);
    setViewVersion(null);
    setRules(next);
    setSaved(JSON.stringify(next));
    setCreating(true);
    setStep(0);
    setConfirm(null);
    setSuggestions(null);
    setHistory(null);
    setError("");
    setNotice("");
    setSaveFailed(false);
    setUndo([]);
    setException(emptyException());
    setEditingDate(null);
    defaults.current = { end: true, anchor: true };
    focus(sectionRef);
  }
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void calendarsApi
      .list(getToken(), controller.signal)
      .then((v) => {
        if (!controller.signal.aborted) setIndex(v);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(failure(e));
      });
    void calendarsApi
      .countries(getToken(), controller.signal)
      .then((v) => {
        if (!controller.signal.aborted) setCountries(v);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setHolidayError(
            "Country suggestions could not load. Manual dates remain available.",
          );
      });
    return () => {
      alive.current = false;
      controller.abort();
      holidayRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const followLink = (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
        return;
      const anchor = (e.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.getAttribute("href")?.startsWith("#")
      )
        return;
      if (new URL(anchor.href).origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingNavigation({
        run: () => {
          leaving.current = true;
          window.location.assign(anchor.href);
        },
      });
      focus(navigationRef);
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("click", followLink, true);
    };
  }, [dirty]);
  useEffect(() => {
    holidayRequest.current?.abort();
    setHolidayBusy(false);
    setSuggestions(null);
    setChecked([]);
    setHolidayError("");
  }, [rules.start, rules.end, rules.country]);
  useEffect(() => {
    if (month && months.length && !months.includes(month)) {
      setMonth("");
      setMonthNotice(
        "The selected month is outside this cycle. Showing the full cycle.",
      );
    }
  }, [rules.start, rules.end, month]);
  useEffect(() => {
    if (confirm) focus(confirmationRef);
  }, [confirm]);

  function change<K extends keyof CalendarRules>(
    key: K,
    value: CalendarRules[K],
  ) {
    if (readonly || busy) return;
    if (key === "end") defaults.current.end = false;
    if (key === "fortnightAnchor") defaults.current.anchor = false;
    setRules((r) => {
      const next = { ...r, [key]: value };
      if (
        key === "start" &&
        typeof value === "string" &&
        validCycleDate(value)
      ) {
        if (defaults.current.end) next.end = suggestedCycleEnd(value);
        if (defaults.current.anchor) next.fortnightAnchor = value;
      }
      return next;
    });
    setNotice("");
    setSaveFailed(false);
    setAgreed(false);
  }
  function numberField(
    label: string,
    key: "splitDay" | "submissionDays" | "verificationDays" | "reviewDays",
    max: number,
    note: string,
  ) {
    return (
      <Field label={label} note={note}>
        <Input
          type="number"
          min={key === "splitDay" ? 1 : 0}
          max={max}
          value={rules[key]}
          disabled={readonly || busy}
          onChange={(e) =>
            change(key, e.target.value === "" ? 0 : Number(e.target.value))
          }
        />
      </Field>
    );
  }
  async function save(): Promise<boolean> {
    if (cycleDateIssue(draftRules.start, draftRules.end, true)) {
      setError(cycleDateIssue(draftRules.start, draftRules.end, true));
      moveTo(0);
      return false;
    }
    setSaving(true);
    const ok = await task(async () => {
      let id = detail?.id;
      if (!id) id = (await calendarsApi.create(getToken(), draftRules)).id;
      else
        await calendarsApi.mutate(
          getToken(),
          id,
          "save",
          detail?.revision ?? 0,
          draftRules,
        );
      await reload(id, true);
      setNotice("Draft saved. Approval publishes a separate, locked version.");
      // Saving has succeeded even if refreshing the selector subsequently fails.
      try {
        await refreshIndex();
      } catch {
        setNotice(
          "Draft saved. The cycle list could not refresh; reopen the page to refresh it.",
        );
      }
    });
    setSaving(false);
    setSaveFailed(!ok);
    return ok;
  }
  async function act(action: string) {
    if (!detail) return;
    if (action === "approve" && (!previewReady || dirty || !agreed)) return;
    const ok = await task(async () => {
      await calendarsApi.mutate(
        getToken(),
        detail.id,
        action,
        detail.revision ?? 0,
        undefined,
        reason,
      );
      await reload(detail.id, true);
      await refreshIndex();
      setReason("");
      setAgreed(false);
      setNotice(
        (
          {
            approve:
              "Calendar approved. Its exact dates and rules are preserved in this version.",
            submit: "Sent for management review.",
            revise:
              "Draft revision opened. The previous approved version is unchanged.",
            return: "Returned for changes.",
            withdraw: "Draft reopened for editing.",
          } as Record<string, string>
        )[action],
      );
    });
    if (ok)
      moveTo(
        action === "approve"
          ? 2
          : action === "revise" || action === "return" || action === "withdraw"
            ? 0
            : step,
      );
  }
  function updateExceptions(next: CalendarException[], label: string) {
    if (readonly || busy) return;
    setUndo((u) => [
      ...u.slice(-19),
      { before: draftRules.exceptions, after: next, label },
    ]);
    change("exceptions", next);
    setNotice(label);
    setExceptionError("");
    setDuplicateDate(null);
  }
  function undoException() {
    const last = undo.at(-1);
    if (!last || readonly || busy) return;
    if (JSON.stringify(draftRules.exceptions) !== JSON.stringify(last.after)) {
      setUndo([]);
      return;
    }
    change("exceptions", last.before);
    setUndo((u) => u.slice(0, -1));
    setNotice(`Undone: ${last.label}`);
    setException(emptyException());
    setEditingDate(null);
    setExceptionError("");
  }
  function editException(date: string) {
    const existing = draftRules.exceptions.find((e) => e.date === date);
    if (existing) {
      setException({ ...existing });
      setEditingDate(date);
      setExceptionError("");
      setDuplicateDate(null);
      moveTo(0);
      focus(exceptionRef);
    }
  }
  function addException() {
    const date = exception.date || rules.start;
    const problem = exceptionIssue(rules, date);
    if (problem) {
      setExceptionError(problem);
      return;
    }
    if (!exception.reason.trim()) {
      setExceptionError("Add a reason for this date.");
      return;
    }
    const duplicate = rules.exceptions.find(
      (e) => e.date === date && e.date !== editingDate,
    );
    if (duplicate) {
      setDuplicateDate(date);
      setExceptionError(
        `${displayDate(date)} already has an exception: ${duplicate.reason}. Edit the existing entry.`,
      );
      return;
    }
    const next = [
      ...rules.exceptions.filter((e) => e.date !== editingDate),
      {
        ...exception,
        date,
        reason: exception.reason.trim(),
        source: "MANUAL" as const,
      },
    ].sort((a, b) => a.date.localeCompare(b.date));
    updateExceptions(
      next,
      editingDate ? "Date exception updated." : "Date exception added.",
    );
    setException(emptyException());
    setEditingDate(null);
  }
  async function findHolidays() {
    const years = cycleYears(rules.start, rules.end);
    if (!years.length || !rules.country) {
      setHolidayError("Choose a country and valid cycle dates first.");
      return;
    }
    holidayRequest.current?.abort();
    const controller = new AbortController();
    holidayRequest.current = controller;
    setHolidayBusy(true);
    setHolidayError("");
    setSuggestions(null);
    try {
      const results = await Promise.all(
        years.map((year) =>
          calendarsApi.holidays(
            getToken(),
            rules.country,
            year,
            controller.signal,
          ),
        ),
      );
      if (controller.signal.aborted || !alive.current) return;
      const next = mergeSuggestions(
        results.map((r) => r.suggestions),
        rules.start,
        rules.end,
      );
      setSuggestions(next);
      setChecked(
        next
          .filter((h) => !rules.exceptions.some((e) => e.date === h.date))
          .map((h) => h.date),
      );
      setHolidayNote([...new Set(results.map((r) => r.notice))].join(" "));
    } catch (e) {
      if (!controller.signal.aborted && alive.current)
        setHolidayError(failure(e));
    } finally {
      if (!controller.signal.aborted && alive.current) setHolidayBusy(false);
    }
  }
  return (
    <div
      className={`${styles.workspace} mx-auto max-w-6xl space-y-6 pb-20 text-foreground`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
            02.03 · Organisation & performance framework
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Rules & calendar
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Agree when work is scheduled, when results are due and who takes
            responsibility. Each plan chooses its own reporting frequency.
          </p>
        </div>
        {canEdit && (
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => navigate(newCycle)}
          >
            <Plus /> New cycle
          </Button>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
          <div className="mt-2 flex gap-2">
            {!index ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  task(async () => {
                    await refreshIndex();
                  })
                }
              >
                Retry connection
              </Button>
            ) : (
              detail && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    navigate(() => {
                      void task(() => reload(detail.id));
                    });
                  }}
                >
                  Reload saved version
                </Button>
              )
            )}
          </div>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"
        >
          {notice}
        </p>
      )}
      {!readonly && undo.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={undoException}
          title={undo.at(-1)?.label}
        >
          Undo last date change
        </Button>
      )}
      {pendingNavigation && (
        <div
          ref={navigationRef}
          tabIndex={-1}
          className="scroll-mt-24 rounded-lg border border-primary/30 bg-accent p-4 outline-none"
          role="region"
          aria-label="Unsaved changes"
        >
          <p className="font-medium">Save your changes before continuing?</p>
          <p className="mt-1 text-sm">
            Your draft has changes that have not been saved.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={
                busy || !!cycleDateIssue(draftRules.start, draftRules.end, true)
              }
              onClick={async () => {
                const next = pendingNavigation;
                if (await save()) {
                  setPendingNavigation(null);
                  next.run();
                }
              }}
            >
              <Save /> Save and continue
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const next = pendingNavigation;
                setPendingNavigation(null);
                next.run();
              }}
            >
              Discard changes and continue
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPendingNavigation(null);
                focus(sectionRef);
              }}
            >
              Stay here
            </Button>
          </div>
        </div>
      )}
      {!index && !error && <p role="status">Loading calendars…</p>}
      {index && (
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="w-full sm:max-w-md">
            <Field label="Performance cycle">
              <Select
                disabled={busy}
                value={detail?.id ?? ""}
                options={[
                  ["", creating ? "New unsaved cycle" : "Choose a saved cycle"],
                  ...index.calendars.map(
                    (c) =>
                      [
                        c.id,
                        `${c.name} · ${c.status === "DRAFT" ? (c.currentVersion ? `draft revision · approved v${c.currentVersion} retained` : "draft") : c.status === "IN_REVIEW" ? "under review" : `approved v${c.currentVersion}`}`,
                      ] as [string, string],
                  ),
                ]}
                onChange={(id) => {
                  if (id)
                    navigate(() => {
                      void task(async () => {
                        await reload(id);
                        focus(sectionRef);
                      });
                    });
                }}
              />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            Company calendar
            {detail && (
              <>
                {" "}
                ·{" "}
                <strong
                  className={`${styles.statusBadge} ${snapshot ? styles.approved : detail.status === "IN_REVIEW" ? styles.review : styles.draft}`}
                >
                  {snapshot
                    ? `Approved v${viewVersion}`
                    : detail.status === "IN_REVIEW"
                      ? "Under review"
                      : "Draft"}
                </strong>
              </>
            )}
          </p>
        </div>
      )}
      {index && !hasDocument && (
        <Card>
          <CardContent className="py-8 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="font-semibold">
              {index.calendars.length
                ? "Choose a cycle to continue"
                : canEdit
                  ? "Set up your first performance calendar"
                  : "No approved calendar yet"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {canEdit
                ? "Choose a saved cycle above to continue its draft or view its approved calendar. Use New cycle for a new planning year or financial cycle—not for every plan or reporting frequency."
                : "Choose an approved cycle above to see its dates and rules. Management publishes calendars here when they are ready."}
            </p>
          </CardContent>
        </Card>
      )}

      {index && (
        <details className="rounded-lg border border-border bg-accent/40 p-4 text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            How cycles, calendars and plans fit together
          </summary>
          <p className="mt-3">
            A cycle is the planning date range. Its calendar defines working
            days and reporting defaults. Plans can use different reporting
            frequencies within the same cycle.
          </p>
          <p className="mt-2">
            This version supports company calendars with one country and time
            zone each. Branch assignment and cross-country comparisons are not
            connected yet; creating a calendar named after a branch does not
            assign it to that branch.
          </p>
          <p className="mt-2">
            Drafts can be edited by authorised calendar editors. Approval
            preserves a numbered, read-only version. Create a revision to
            propose changes; the approved version stays available while you
            work.
          </p>
        </details>
      )}
      {snapshot && dirty && (
        <p className="rounded-lg bg-accent p-3 text-sm">
          Your unsaved draft is retained. Return to current draft to continue
          editing it.
        </p>
      )}
      {hasDocument && (
        <>
          <nav
            aria-label="Calendar setup sections"
            className="flex flex-wrap gap-2"
          >
            {[
              "Cycle & working days",
              "Periods & responsibilities",
              "Preview & approval",
            ].map((label, i) => (
              <Button
                key={label}
                variant="outline"
                aria-label={`${i + 1}. ${label}`}
                aria-current={step === i ? "step" : undefined}
                className={`${styles.stepTab} ${step === i ? styles.activeStep : ""}`}
                onClick={() => moveTo(i)}
              >
                <span aria-hidden="true" className={styles.stepNumber}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{label}</span>
              </Button>
            ))}
          </nav>
          <div className="flex flex-wrap gap-2 text-sm">
            {detail?.versions.map((v) => (
              <Button
                key={v.version}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void task(async () => {
                    const s = await calendarsApi.version(
                      getToken(),
                      detail.id,
                      v.version,
                    );
                    setSnapshot(s);
                    setViewVersion(v.version);
                    setConfirm(null);
                    moveTo(2);
                  });
                }}
              >
                View approved v{v.version}
              </Button>
            ))}
            {snapshot && canEdit && detail?.status !== "APPROVED" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setSnapshot(null);
                  setViewVersion(null);
                  moveTo(0);
                }}
              >
                Return to current draft
              </Button>
            )}
          </div>
          {detail?.returnReason && !snapshot && (
            <p className="rounded-lg border border-border bg-muted p-3 text-sm">
              Changes requested: {detail.returnReason}
            </p>
          )}
          {detail?.approved && detail.status !== "APPROVED" && !snapshot && (
            <p className="text-sm text-muted-foreground">
              Approved v{detail.approved.version} remains available to plans
              while this revision is prepared. Reason:{" "}
              {detail.revisionReason || "—"}
            </p>
          )}

          {dateIssue && step !== 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <span>{dateIssue}</span>
              <Button variant="outline" onClick={() => moveTo(0)}>
                Correct cycle dates
              </Button>
            </div>
          )}

          <div
            ref={sectionRef}
            tabIndex={-1}
            className="scroll-mt-24 outline-none"
          />
          {step === 0 && (
            <>
              <Section
                title="Performance cycle"
                description="A calendar year or financial year. These dates contain the reporting periods used by plans."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Cycle name">
                    <Input
                      value={rules.name}
                      maxLength={120}
                      placeholder="e.g. Financial year 2027–2028"
                      disabled={readonly || busy}
                      onChange={(e) => change("name", e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Time zone"
                    note="Submission deadlines use this zone, regardless of the viewer’s computer."
                  >
                    <Input
                      value={rules.timeZone}
                      disabled={readonly || busy}
                      onChange={(e) => change("timeZone", e.target.value)}
                    />
                  </Field>
                  <Field label="Cycle starts">
                    <Input
                      type="date"
                      min="1900-01-01"
                      max="2199-12-31"
                      value={rules.start}
                      disabled={readonly || busy}
                      aria-invalid={!!dateIssue}
                      aria-describedby={
                        dateIssue ? "cycle-date-error" : "cycle-date-help"
                      }
                      onChange={(e) => change("start", e.target.value)}
                    />
                  </Field>
                  <Field label="Cycle ends">
                    <Input
                      type="date"
                      min={
                        validCycleDate(rules.start) &&
                        rules.start >= "1900-01-01"
                          ? rules.start
                          : "1900-01-01"
                      }
                      max="2199-12-31"
                      value={rules.end}
                      disabled={readonly || busy}
                      aria-invalid={!!dateIssue}
                      aria-describedby={
                        dateIssue ? "cycle-date-error" : "cycle-date-help"
                      }
                      onChange={(e) => change("end", e.target.value)}
                    />
                  </Field>
                  {dateIssue && (
                    <p
                      id="cycle-date-error"
                      role="alert"
                      className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                      {dateIssue} Correct the dates to save this draft.
                    </p>
                  )}
                  <p
                    id="cycle-date-help"
                    className="sm:col-span-2 text-xs text-muted-foreground"
                  >
                    For a new cycle, the suggested end and 14-day anchor follow
                    the start until you edit them. Saved dates and existing
                    exceptions are never shifted automatically. Complete the
                    dates before preview or approval.
                  </p>
                </div>
              </Section>
              <Section
                title="Working days & exceptions"
                description="Choose the normal week, then add holidays, shutdowns or exceptional working days. These are performance-scheduling rules, not attendance or leave records."
              >
                <fieldset disabled={readonly || busy}>
                  <legend className="mb-3 text-sm font-medium">
                    Normal working week
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <label
                        key={d}
                        className={`${styles.dayChoice} flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm`}
                        data-selected={rules.workdays.includes(d)}
                      >
                        <input
                          type="checkbox"
                          checked={rules.workdays.includes(d)}
                          onChange={(e) =>
                            change(
                              "workdays",
                              e.target.checked
                                ? [...rules.workdays, d]
                                : rules.workdays.filter((x) => x !== d),
                            )
                          }
                        />
                        {DAYS[d].slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {!readonly && (
                  <div
                    ref={exceptionRef}
                    tabIndex={-1}
                    className="scroll-mt-24 space-y-3 rounded-lg border border-border bg-accent/30 p-4 outline-none"
                  >
                    <p className="text-sm font-medium">
                      {editingDate
                        ? `Editing ${displayDate(editingDate)}`
                        : "Add a date exception"}
                    </p>
                    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field
                        label="Exception date"
                        note="Starts at the cycle date. Nothing is added until you choose Add date."
                      >
                        <Input
                          type="date"
                          value={exception.date || rules.start}
                          min={rules.start || "1900-01-01"}
                          max={
                            validCycleDate(rules.end)
                              ? addDays(rules.end, 120)
                              : "2199-12-31"
                          }
                          disabled={busy}
                          aria-invalid={!!exceptionError}
                          aria-describedby={
                            exceptionError ? "exception-error" : undefined
                          }
                          onChange={(e) => {
                            setException((x) => ({
                              ...x,
                              date: e.target.value,
                            }));
                            setExceptionError("");
                            setDuplicateDate(null);
                          }}
                        />
                      </Field>
                      <Field label="Schedule">
                        <Select
                          disabled={busy}
                          value={exception.kind}
                          options={[
                            ["NON_WORKING", "Not scheduled"],
                            ["WORKING", "Working day"],
                          ]}
                          onChange={(v) =>
                            setException((x) => ({
                              ...x,
                              kind: v as CalendarException["kind"],
                            }))
                          }
                        />
                      </Field>
                      <Field label="Exception reason">
                        <Input
                          maxLength={200}
                          disabled={busy}
                          value={exception.reason}
                          placeholder="e.g. Plant shutdown"
                          onChange={(e) => {
                            setException((x) => ({
                              ...x,
                              reason: e.target.value,
                            }));
                            setExceptionError("");
                          }}
                        />
                      </Field>
                      <Button disabled={busy} onClick={addException}>
                        <Plus />
                        {editingDate ? "Update date" : "Add date"}
                      </Button>
                    </div>
                    {editingDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setEditingDate(null);
                          setException(emptyException());
                          setExceptionError("");
                        }}
                      >
                        Cancel date edit
                      </Button>
                    )}
                    {exceptionError && (
                      <div
                        id="exception-error"
                        role="alert"
                        className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                      >
                        <p>{exceptionError}</p>
                        {duplicateDate && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => editException(duplicateDate)}
                          >
                            Edit existing exception
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {invalidExceptions.length > 0 && (
                  <p role="alert" className="text-sm text-destructive">
                    {invalidExceptions.length} date exception(s) need correction
                    before preview or approval. They are marked below.
                  </p>
                )}
                {rules.exceptions.length > 0 ? (
                  <ul className="max-h-80 divide-y divide-border overflow-auto rounded-lg border border-border">
                    {rules.exceptions.map((e) => (
                      <li
                        key={e.date}
                        className={`flex flex-wrap items-start justify-between gap-3 p-3 text-sm ${editingDate === e.date || duplicateDate === e.date ? "bg-accent ring-1 ring-inset ring-primary" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <strong>{displayDate(e.date)}</strong> ·{" "}
                          {e.kind === "WORKING"
                            ? "Working day"
                            : "Not scheduled"}
                          <p className="break-words text-muted-foreground">
                            {e.reason}
                          </p>
                          {exceptionIssue(rules, e.date) && (
                            <p className="mt-1 text-destructive">
                              {exceptionIssue(rules, e.date)}
                            </p>
                          )}
                          {rules.country === "KE" &&
                            e.date >= "2024-04-26" &&
                            /\b(Moi|Huduma|Utamaduni) Day\b/i.test(
                              e.reason,
                            ) && (
                              <p className="mt-1 text-sm text-destructive">
                                This holiday name is outdated. Review it against
                                Mazingira Day and its observed date; existing
                                dates are preserved until you edit them.
                              </p>
                            )}
                        </div>
                        {!readonly && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              aria-label={`Edit exception ${e.date}`}
                              onClick={() => editException(e.date)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              aria-label={`Remove exception ${e.date}`}
                              onClick={() => {
                                updateExceptions(
                                  rules.exceptions.filter(
                                    (x) => x.date !== e.date,
                                  ),
                                  `Removed ${displayDate(e.date)}.`,
                                );
                                if (editingDate === e.date) {
                                  setEditingDate(null);
                                  setException(emptyException());
                                }
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No date exceptions added.
                  </p>
                )}
                {!readonly && (
                  <details className="rounded-lg border border-border p-4" open>
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      Suggest national public holidays
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div className="grid items-end gap-3 sm:grid-cols-2">
                        <Field label="Country">
                          <Select
                            disabled={busy}
                            value={rules.country}
                            options={[
                              ["", "Choose a country"],
                              ...Object.entries(countries).sort((a, b) =>
                                a[1].localeCompare(b[1]),
                              ),
                            ]}
                            onChange={(v) => change("country", v)}
                          />
                        </Field>
                        <Button
                          variant="outline"
                          disabled={
                            busy ||
                            holidayBusy ||
                            !rules.country ||
                            !!completeDateIssue
                          }
                          onClick={() => {
                            void findHolidays();
                          }}
                        >
                          {holidayBusy
                            ? "Finding holidays…"
                            : "Find suggestions"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {completeDateIssue ||
                          `Searches ${displayDate(rules.start)} to ${displayDate(rules.end)}, including every year in the cycle. No need to save first.`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        New suggestions start checked. Untick unwanted dates,
                        then accept. Accepting adds dates to your draft; Save
                        draft saves them.
                      </p>
                      {holidayError && (
                        <p role="alert" className="text-sm text-destructive">
                          {holidayError}
                        </p>
                      )}
                      {suggestions && (
                        <>
                          <p className="text-sm text-muted-foreground">
                            {holidayNote}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span>{selectedCount} new dates selected</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                setChecked(
                                  eligibleSuggestions.map((e) => e.date),
                                )
                              }
                            >
                              Select all
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => setChecked([])}
                            >
                              Clear all
                            </Button>
                          </div>
                          <ul className="max-h-72 space-y-3 overflow-auto rounded-lg border border-border p-3">
                            {suggestions.map((e) => {
                              const existing = rules.exceptions.find(
                                (x) => x.date === e.date,
                              );
                              return (
                                <li key={e.date}>
                                  <label className="flex items-start gap-3 text-sm">
                                    <input
                                      type="checkbox"
                                      className="mt-1"
                                      disabled={busy || !!existing}
                                      checked={
                                        !!existing || checked.includes(e.date)
                                      }
                                      onChange={(event) =>
                                        setChecked((x) =>
                                          event.target.checked
                                            ? [...x, e.date]
                                            : x.filter((v) => v !== e.date),
                                        )
                                      }
                                    />
                                    <span>
                                      <strong>{displayDate(e.date)}</strong> ·{" "}
                                      {e.reason}
                                      {e.note && (
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                          {e.note}
                                        </span>
                                      )}
                                      {existing && (
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                          Already added: {existing.reason}. Its
                                          saved choice will not be overwritten.
                                        </span>
                                      )}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                          {suggestions.length === 0 && (
                            <p className="text-sm">
                              No suggestions were returned within this cycle.
                              You can add dates manually.
                            </p>
                          )}
                          <Button
                            disabled={busy || selectedCount === 0}
                            onClick={() => {
                              const next = acceptedExceptions(
                                rules.exceptions,
                                suggestions,
                                checked,
                              );
                              updateExceptions(
                                next,
                                `${next.length - rules.exceptions.length} holiday dates added to draft.`,
                              );
                              setChecked([]);
                            }}
                          >
                            Accept selected ({selectedCount})
                          </Button>
                        </>
                      )}
                    </div>
                  </details>
                )}
                <p className="text-xs text-muted-foreground">
                  Exceptions after cycle-end can cover submission deadlines for
                  up to 120 days. Dates before the cycle starts must be
                  corrected or removed.
                </p>
              </Section>
            </>
          )}

          {step === 1 && (
            <>
              <Section
                title="Period boundaries"
                description="All eight frequencies remain available. A plan can have daily, weekly and monthly KPIs together; this is not one permanent choice for the whole company."
              >
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Week starts on">
                    <Select
                      value={`${rules.weekStart}`}
                      disabled={readonly || busy}
                      options={DAYS.map((x, i) => [`${i}`, x])}
                      onChange={(v) => change("weekStart", Number(v))}
                    />
                  </Field>
                  <Field
                    label="14-day anchor"
                    note="Repeats every 14 days from this date. Periods can cross month-end."
                  >
                    <Input
                      type="date"
                      value={rules.fortnightAnchor}
                      disabled={readonly || busy}
                      onChange={(e) =>
                        change("fortnightAnchor", e.target.value)
                      }
                    />
                  </Field>
                  {numberField(
                    "Twice-monthly split day",
                    "splitDay",
                    27,
                    "15 means 1–15 and 16–month-end. This is different from every 14 days.",
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Months follow calendar months. Quarters, half-years and years
                  start with the cycle’s first month. Partial cycle boundaries
                  are labelled in the preview.
                </p>
              </Section>
              <Section
                title="Submission, verification & review"
                description="Entry is recording results. Submission sends them for checking. Verification checks their accuracy. A performance review considers outcomes and follow-up actions."
              >
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {numberField(
                    "Submit within",
                    "submissionDays",
                    60,
                    "Days after the measurement period ends. 0 means the period-end date.",
                  )}
                  <Field label="Count submission allowance in">
                    <Select
                      value={rules.submissionDayType}
                      disabled={readonly || busy}
                      options={[
                        ["CALENDAR", "Calendar days"],
                        ["WORKING", "Working days"],
                      ]}
                      onChange={(v) =>
                        change(
                          "submissionDayType",
                          v as CalendarRules["submissionDayType"],
                        )
                      }
                    />
                  </Field>
                  <Field label="If submission falls on a non-working date">
                    <Select
                      value={rules.submissionRoll}
                      disabled={readonly || busy}
                      options={[
                        ["NONE", "Keep the calculated date"],
                        ["NEXT_WORKING", "Move to the next working date"],
                      ]}
                      onChange={(v) =>
                        change(
                          "submissionRoll",
                          v as CalendarRules["submissionRoll"],
                        )
                      }
                    />
                  </Field>
                  <Field label="Submit by · local time">
                    <Input
                      type="time"
                      value={rules.submissionTime}
                      disabled={readonly || busy}
                      onChange={(e) => change("submissionTime", e.target.value)}
                    />
                  </Field>
                  {numberField(
                    "Verify within",
                    "verificationDays",
                    60,
                    "Calendar days after the submission deadline; a completion date, not a one-day meeting.",
                  )}
                  <Field label="Default performance-review frequency">
                    <Select
                      value={rules.reviewFrequency}
                      disabled={readonly || busy}
                      options={FREQUENCIES.map((x) => [x, FREQ[x]])}
                      onChange={(v) =>
                        change("reviewFrequency", v as Frequency)
                      }
                    />
                  </Field>
                  {numberField(
                    "Complete review within",
                    "reviewDays",
                    60,
                    "Calendar days after the review period ends. Meeting arrangements are separate.",
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  These are planning defaults. Actual entry tasks, reminders and
                  review meetings belong to the later execution and review
                  areas. This page does not create them.
                </p>
              </Section>
              <Section
                title="Default responsibility rules"
                description="Set general defaults here. During plan setup, each rule must be matched to confirmed people in the correct department and scope."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  {(
                    [
                      ["owner", "Plan owner"],
                      ["provider", "Data provider"],
                      ["verifier", "Result verifier"],
                      ["approver", "Plan approver"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field
                      key={key}
                      label={label}
                      note={RESPONSIBILITY_HELP[key]}
                    >
                      <Select
                        disabled={readonly || busy}
                        value={rules.responsibilities[key]}
                        options={responsibilityChoices(
                          key,
                          rules.responsibilities[key],
                        )}
                        onChange={(v) =>
                          change("responsibilities", {
                            ...rules.responsibilities,
                            [key]: v,
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  These rules suggest people during planning; they do not assign
                  anyone or change access. Connection to plan assignment is
                  still pending. Vacancies, multiple possible holders and a
                  provider/verifier resolving to the same person must be
                  resolved before approving the particular plan. An approval
                  role does not grant new access rights.
                </p>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Measurement & scoring controls
                  </summary>
                  <fieldset
                    disabled={readonly || busy}
                    className="mt-4 space-y-3"
                  >
                    <legend className="mb-2 text-sm">
                      Available measurement types
                    </legend>
                    <div className="flex flex-wrap gap-4">
                      {DIRECTIONS.map((d) => (
                        <label key={d} className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={rules.directions.includes(d)}
                            onChange={(e) =>
                              change(
                                "directions",
                                e.target.checked
                                  ? [...rules.directions, d]
                                  : rules.directions.filter((x) => x !== d),
                              )
                            }
                          />
                          {DIRECTION_LABELS[d]}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Exact targets, formulas, weights and warning thresholds
                      belong to each KPI in Area 03. No numerical appraisal
                      rating is enabled here. Missing results are not zero.
                    </p>
                  </fieldset>
                </details>
              </Section>
            </>
          )}

          {step === 2 && (
            <Section
              title="Preview & approval"
              description="Check the dates before publishing. Selecting a frequency here only changes the preview, not every plan’s schedule."
            >
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full sm:w-72">
                  <Field label="Preview reporting frequency">
                    <Select
                      value={frequency}
                      options={FREQUENCIES.map((f) => [f, FREQ[f]])}
                      onChange={(v) => {
                        setFrequency(v as Frequency);
                        setAgreed(false);
                      }}
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updates automatically. Each plan chooses its own reporting
                  frequency.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {snapshot
                  ? `Approved version ${viewVersion} · read-only dates preserved at approval.`
                  : "Preview of your current draft, including unsaved changes."}
              </p>
              {monthNotice && (
                <p role="status" className="text-sm text-muted-foreground">
                  {monthNotice}
                </p>
              )}
              {preview.busy && (
                <p role="status" className="rounded-lg bg-accent p-4 text-sm">
                  Updating calendar preview…
                </p>
              )}
              {preview.error && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
                >
                  <p>{preview.error}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        moveTo(0);
                        if (invalidExceptions.length)
                          editException(invalidExceptions[0].date);
                      }}
                    >
                      Review dates & exceptions
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPreviewRetry((n) => n + 1)}
                    >
                      Retry preview
                    </Button>
                  </div>
                </div>
              )}
              {preview.value && !preview.busy && !preview.error && (
                <CalendarPreview
                  preview={preview.value}
                  month={month}
                  onMonthChange={(value) => {
                    setMonth(value);
                    setMonthNotice("");
                  }}
                />
              )}
              {canEdit && detail && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      setHistory(
                        await calendarsApi.history(getToken(), detail.id),
                      );
                    })
                  }
                >
                  <Clock3 /> View change history
                </Button>
              )}
              {history && (
                <div className="max-h-80 space-y-3 overflow-auto border-t border-border pt-3">
                  <h3 className="font-medium">Recent changes</h3>
                  {history.map((h) => (
                    <details
                      key={h.revision}
                      className="rounded-lg border border-border p-3 text-sm"
                    >
                      <summary className="cursor-pointer">
                        {h.action.replaceAll("_", " ")} · revision {h.revision}{" "}
                        · {new Date(h.createdAt).toLocaleString()}
                      </summary>
                      {h.reason && <p className="mt-2">{h.reason}</p>}
                      <p className="mt-2 text-muted-foreground">
                        {h.snapshot.name} · {h.snapshot.start} to{" "}
                        {h.snapshot.end} · {h.snapshot.timeZone}
                      </p>
                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="font-medium">Working week</dt>
                          <dd>
                            {h.snapshot.workdays.map((d) => DAYS[d]).join(", ")}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">Submission</dt>
                          <dd>
                            {h.snapshot.submissionDays}{" "}
                            {h.snapshot.submissionDayType.toLowerCase()} days ·{" "}
                            {h.snapshot.submissionTime}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">Review frequency</dt>
                          <dd>{FREQ[h.snapshot.reviewFrequency]}</dd>
                        </div>
                        <div>
                          <dt className="font-medium">Date exceptions</dt>
                          <dd>{h.snapshot.exceptions.length}</dd>
                        </div>
                        {Object.entries(h.snapshot.responsibilities).map(
                          ([key, value]) => (
                            <div key={key}>
                              <dt className="font-medium capitalize">{key}</dt>
                              <dd>{RESPONSIBILITY_LABELS[value]}</dd>
                            </div>
                          ),
                        )}
                      </dl>
                    </details>
                  ))}
                </div>
              )}
            </Section>
          )}

          {confirm && (
            <div
              ref={confirmationRef}
              tabIndex={-1}
              className="scroll-mt-24 outline-none"
            >
              <Card>
                <CardHeader className={styles.sectionHeader}>
                  <CardTitle>
                    {confirm === "approve"
                      ? "Approve this saved calendar?"
                      : confirm === "revise"
                        ? "Create a revision"
                        : "Return for changes"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {confirm === "approve" ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Approval preserves these exact dates and rules as a
                        numbered version. Changes afterwards require a revision.
                        Calendar adoption in live plans is not available yet.
                        When connected, each plan must select a version and
                        confirm its named owner, provider, verifier and
                        approver; publishing a revision must not silently change
                        existing plans.
                      </p>
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={agreed}
                          disabled={!previewReady || dirty}
                          onChange={(e) => setAgreed(e.target.checked)}
                        />
                        I have checked the calendar preview and default rules.
                      </label>
                    </>
                  ) : (
                    <Field label="Reason">
                      <Input
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        (confirm === "approve"
                          ? !agreed || !!completeDateIssue
                          : !reason.trim())
                      }
                      onClick={() => act(confirm)}
                    >
                      {confirm === "approve"
                        ? "Approve & lock"
                        : confirm === "revise"
                          ? "Create draft revision"
                          : "Return draft"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
            <p role="status" className="text-sm">
              {busy ? (
                saving ? (
                  "Saving…"
                ) : (
                  "Working…"
                )
              ) : dateIssue ? (
                "Correct cycle dates before saving"
              ) : snapshot ? (
                `Approved v${viewVersion} · read only`
              ) : detail?.status === "IN_REVIEW" ? (
                "Waiting for one management review"
              ) : dirty ? (
                saveFailed ? (
                  "Not saved — your changes are retained"
                ) : (
                  "Unsaved changes"
                )
              ) : creating ? (
                "New cycle — not saved yet"
              ) : (
                <>
                  <CheckCircle2
                    className="mr-1 inline h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  Saved
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {step < 2 && (
                <Button variant="outline" onClick={() => moveTo(step + 1)}>
                  Continue <ChevronRight />
                </Button>
              )}
              {!readonly && (
                <Button
                  disabled={busy || !!dateIssue || (!dirty && !!detail)}
                  onClick={() => {
                    void save();
                  }}
                >
                  <Save /> Save draft
                </Button>
              )}
              {!snapshot &&
                detail &&
                detail.status === "DRAFT" &&
                !canApprove &&
                canEdit && (
                  <Button
                    variant="outline"
                    disabled={busy || dirty || !!completeDateIssue}
                    onClick={() => act("submit")}
                  >
                    Send for review
                  </Button>
                )}
              {!snapshot &&
                detail &&
                ["DRAFT", "IN_REVIEW"].includes(detail.status) &&
                canApprove && (
                  <Button
                    disabled={busy || dirty || !!completeDateIssue}
                    onClick={() => {
                      moveTo(2);
                      setConfirm("approve");
                      setAgreed(false);
                    }}
                  >
                    <CheckCircle2 /> Approve…
                  </Button>
                )}
              {!snapshot && detail?.status === "IN_REVIEW" && canApprove && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setConfirm("return");
                    setReason("");
                  }}
                >
                  Return…
                </Button>
              )}
              {!snapshot &&
                detail?.status === "IN_REVIEW" &&
                canEdit &&
                (canApprove ||
                  detail.submittedByUserId ===
                    useAuthStore.getState().user?.userId) && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => act("withdraw")}
                  >
                    Withdraw to edit
                  </Button>
                )}
              {detail?.status === "APPROVED" &&
                canEdit &&
                viewVersion === detail.approved?.version && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setConfirm("revise");
                      setReason("");
                    }}
                  >
                    Create revision…
                  </Button>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
