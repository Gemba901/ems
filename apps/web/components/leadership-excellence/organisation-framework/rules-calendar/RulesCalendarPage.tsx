"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Undo2,
  Clock3,
  Plus,
  Save,
  Copy,
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
import { readCalendarLocation, calendarLocationUrl } from "./calendar-location";
import { TimeZonePicker } from "./TimeZonePicker";
import { CalendarCycleCard } from "./CalendarCycleCard";
import { CalendarAudienceEditor } from "./CalendarAudienceEditor";
import { CalendarComparisonPanel } from "./CalendarComparisonPanel";
import { audienceLabel, emptyAudience } from "./calendar-audience";
import { PeriodSettings } from "./PeriodSettings";
import { CalendarFeedback, CalendarField, FieldFrame } from "./CalendarField";
import {
  calendarIssues,
  fieldId,
  serverIssue,
  type CalendarIssue,
} from "./calendar-issues";
import { DateInput } from "./DateInput";
import { CalendarPreview } from "./CalendarPreview";
import { CountryPicker } from "./CountryPicker";
import { cycleDateIssue, validCycleDate } from "./cycle-dates";
import styles from "./rules-calendar.module.css";
import {
  initialRules,
  enabledFrequencies,
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
  holidayNameUpdate,
  cycleMonths,
  addDays,
  previewCorrection,
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
  field,
}: {
  label: string;
  note?: string;
  children: ReactNode;
  field?: string;
}) {
  return (
    <div className="space-y-2 text-sm">
      <CalendarField field={field} label={label}>
        {children}
      </CalendarField>
      {note && (
        <details className="text-xs leading-relaxed text-muted-foreground">
          <summary className="cursor-pointer">
            About {label.toLowerCase()}
          </summary>
          <p className="mt-2">{note}</p>
        </details>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <select
      {...props}
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
    <Card className={styles.settingsCard}>
      <CardHeader className={styles.sectionHeader}>
        <CardTitle>{title}</CardTitle>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">About this section</summary>
          <p className="mt-2">{description}</p>
        </details>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}
const failure = (error: unknown) =>
  error instanceof Error
    ? error.message.replace(/\b\d{4}-\d{2}-\d{2}\b/g, displayDate)
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
  const [overviewMode, setOverviewMode] = useState<"CYCLES" | "COMPARISON">(
    "CYCLES",
  );
  const [comparisonMonth, setComparisonMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const comparisonVisited = useRef(false);
  const [comparisonMode, setComparisonMode] = useState<"DAY" | "MONTH">(
    "MONTH",
  );
  const [comparisonDay, setComparisonDay] = useState("");
  const [navigationReady, setNavigationReady] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreError, setRestoreError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dateNotice, setDateNotice] = useState("");
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
  const holidayPickerRef = useRef<HTMLDetailsElement>(null);
  const [draftAction, setDraftAction] = useState<{
    id: string;
    name: string;
    revision: number;
    kind: "delete" | "discard-revision";
  } | null>(null);
  const draftActionRef = useRef<HTMLDivElement>(null);
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [holidayError, setHolidayError] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [omissionReasons, setOmissionReasons] = useState<
    Record<string, string>
  >({});
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
    {
      before: CalendarException[];
      after: CalendarException[];
      label: string;
      omissionsBefore?: CalendarRules["holidayOmissions"];
      omissionsAfter?: CalendarRules["holidayOmissions"];
    }[]
  >([]);
  const [history, setHistory] = useState<CalendarHistory[] | null>(null);
  const [confirm, setConfirm] = useState<
    "approve" | "revise" | "return" | null
  >(null);
  const [reason, setReason] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const [activeField, setActiveField] = useState("");
  const [externalIssue, setExternalIssue] = useState<CalendarIssue | null>(
    null,
  );
  const [approvalNotice, setApprovalNotice] = useState<{
    message: string;
    kind?: "SAVE" | "RELOAD";
  } | null>(null);
  const approvalNoticeRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    run: () => void;
  } | null>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const holidayRequest = useRef<AbortController | null>(null);
  const defaults = useRef({ end: true, anchor: true });
  const overviewRef = useRef<HTMLDivElement>(null);
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
  const available = snapshot
    ? (Object.keys(snapshot.periods) as Frequency[])
    : enabledFrequencies(rules);
  const availableKey = available.join(",");
  useEffect(() => {
    if (!navigationReady) return;
    if (!available.includes(frequency) && available[0])
      setFrequency(available[0]);
  }, [availableKey, frequency, navigationReady]);
  const preview = useCalendarPreview(
    rules,
    frequency,
    snapshot,
    hasDocument && step === 2,
    token,
    previewRetry,
  );
  const previewReady = !!preview.value && !preview.busy && !preview.error;
  const currentIssues = calendarIssues(rules, true);
  const fieldIssues = externalIssue
    ? [
        ...currentIssues.filter((i) => i.field !== externalIssue.field),
        externalIssue,
      ]
    : currentIssues;
  function goToIssue(issue: CalendarIssue) {
    setShowIssues(true);
    setActiveField(issue.field);
    setStep(issue.step);
    if (issue.date) editException(issue.date);
    requestAnimationFrame(() => {
      const target = document.getElementById(fieldId(issue.field));
      target?.closest("details")?.setAttribute("open", "");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      const selector = ["customAnchor", "twoMonthAnchor"].includes(issue.field)
        ? "input:not([type=hidden]):not([aria-hidden=true])"
        : "input:not([type=hidden]):not([aria-hidden=true]), select, button";
      (target?.querySelector<HTMLElement>(selector) ?? target)?.focus({
        preventScroll: true,
      });
    });
  }
  function approvalMessage(message: string, kind?: "SAVE" | "RELOAD") {
    setApprovalNotice({ message, kind });
    requestAnimationFrame(() => {
      approvalNoticeRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      approvalNoticeRef.current?.focus({ preventScroll: true });
    });
  }
  function startApproval() {
    if (busy) return;
    setApprovalNotice(null);
    setExternalIssue(null);
    const issue = calendarIssues(draftRules, true)[0];
    if (issue) {
      goToIssue(issue);
      return;
    }
    if (dirty || !detail) {
      approvalMessage("Save your changes before approving.", "SAVE");
      return;
    }
    setStep(2);
    setConfirm("approve");
    setAgreed(false);
    requestAnimationFrame(() => confirmationRef.current?.focus());
  }
  useEffect(() => {
    if (
      !hasDocument ||
      typeof ResizeObserver === "undefined" ||
      !footerRef.current
    )
      return;
    const observer = new ResizeObserver(([entry]) =>
      setFooterHeight(entry.contentRect.height),
    );
    observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, [hasDocument]);
  useEffect(() => {
    if (approvalNotice?.kind === "SAVE" && detail && !dirty)
      setApprovalNotice(null);
  }, [dirty, detail, approvalNotice?.kind]);
  const months = cycleMonths(rules.start, rules.end);
  const eligibleSuggestions = (suggestions ?? []).filter(
    (e) => !rules.exceptions.some((x) => x.date === e.date),
  );
  const omittedSuggestions = eligibleSuggestions.filter(
    (e) => !checked.includes(e.date) && e.category !== "OPTIONAL_CLOSURE",
  );
  const omittedReason = (date: string) =>
    omissionReasons[date] ??
    rules.holidayOmissions?.find(
      (h) => h.date === date && h.country === rules.country,
    )?.reason ??
    "";
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
    setShowIssues(false);
    setActiveField("");
    setExternalIssue(null);
    setApprovalNotice(null);
    setDetail(d);
    setOmissionReasons({});
    setCreating(false);
    setHistory(null);
    setConfirm(null);
    setSuggestions(null);
    setChecked([]);
    setException(emptyException());
    setEditingDate(null);
    setExceptionError("");
    setDuplicateDate(null);
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
      setDateNotice("");
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
  async function task(
    work: () => Promise<void>,
    onFailure?: (message: string) => void,
  ): Promise<boolean> {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      return true;
    } catch (e) {
      if (alive.current) {
        if (onFailure) onFailure(failure(e));
        else setError(failure(e));
      }
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
  function backToCycles() {
    navigate(() => {
      setDetail(null);
      setCreating(false);
      setSnapshot(null);
      setViewVersion(null);
      setSaved(JSON.stringify(draftRules));
      setError("");
      setNotice("");
      setConfirm(null);
      setUndo([]);
      setDateNotice("");
      setPendingNavigation(null);
      focus(overviewRef);
    });
  }
  function openCycle(id: string, approved = false) {
    navigate(() => {
      void task(async () => {
        const d = await calendarsApi.read(getToken(), id);
        if (!alive.current) return;
        showDetail(d);
        if (approved && d.approved) {
          setSnapshot(d.approved.snapshot);
          setViewVersion(d.approved.version);
          setStep(2);
        }
        focus(sectionRef);
      });
    });
  }
  async function prepareDraftAction(id: string) {
    await task(async () => {
      const d =
        detail?.id === id ? detail : await calendarsApi.read(getToken(), id);
      if (d.status !== "DRAFT" || d.revision === undefined)
        throw new Error(
          "Only an editable saved draft can be removed. Reload the calendar first.",
        );
      setDraftAction({
        id,
        name: d.draft?.name || "Untitled cycle",
        revision: d.revision,
        kind: d.approved ? "discard-revision" : "delete",
      });
      requestAnimationFrame(() => focus(draftActionRef));
    });
  }
  async function removeDraft() {
    if (!draftAction) return;
    const action = draftAction;
    await task(async () => {
      await calendarsApi.mutate(
        getToken(),
        action.id,
        action.kind,
        action.revision,
      );
      setDraftAction(null);
      if (detail?.id === action.id) {
        if (action.kind === "discard-revision") await reload(action.id);
        else {
          setDetail(null);
          setCreating(false);
          setSnapshot(null);
          setViewVersion(null);
          setSaved(JSON.stringify(draftRules));
          setConfirm(null);
          setUndo([]);
          setDateNotice("");
        }
      }
      setNotice(
        action.kind === "delete"
          ? "Draft deleted."
          : "Draft revision discarded. The approved version is unchanged.",
      );
      try {
        await refreshIndex();
      } catch {
        setNotice(
          "The action completed. Reload the page to refresh the calendar list.",
        );
      }
      focus(action.kind === "delete" ? overviewRef : sectionRef);
    });
  }
  function copyCycle(id: string) {
    if (!canEdit || busy) return;
    navigate(() => {
      void task(async () => {
        const source = await calendarsApi.read(getToken(), id);
        if (!alive.current) return;
        const original = source.draft ?? source.approved?.snapshot.rules;
        if (!original)
          throw new Error("This calendar has no settings to copy.");
        newCycle();
        const copied = structuredClone(original);
        copied.audience = emptyAudience();
        copied.name = `Copy of ${original.name || "calendar"}`.slice(0, 120);
        setRules(copied);
        setSaved("");
        defaults.current = { end: false, anchor: false };
        setNotice(
          "Settings copied into a new, unsaved draft. Check its name, dates and holidays, and choose who uses it; assignments were cleared. The original calendar and its approved versions are unchanged.",
        );
      });
    });
  }
  function newCycle() {
    setShowIssues(false);
    setActiveField("");
    setExternalIssue(null);
    setApprovalNotice(null);
    const next = initialRules(new Date().getFullYear(), timeZone);
    setDetail(null);
    setSnapshot(null);
    setViewVersion(null);
    setRules(next);
    setSaved(JSON.stringify(next));
    setCreating(true);
    setOmissionReasons({});
    setStep(0);
    setConfirm(null);
    setSuggestions(null);
    setHistory(null);
    setError("");
    setNotice("");
    setSaveFailed(false);
    setUndo([]);
    setDateNotice("");
    setException(emptyException());
    setEditingDate(null);
    setExceptionError("");
    setDuplicateDate(null);
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
    if (!index || navigationReady) return;
    const controller = new AbortController();
    const location = readCalendarLocation(
      window.location.search,
      new Date().toISOString().slice(0, 7),
    );
    setRestoreError("");
    void (async () => {
      if (location.screen === "calendar") {
        const d = await calendarsApi.read(
          getToken(),
          location.calendarId,
          controller.signal,
        );
        const version = location.version
          ? d.approved?.version === location.version
            ? d.approved.snapshot
            : await calendarsApi.version(
                getToken(),
                location.calendarId,
                location.version,
                controller.signal,
              )
          : null;
        if (controller.signal.aborted) return;
        showDetail(d);
        if (version) {
          setSnapshot(version);
          setViewVersion(location.version);
        }
        if (location.step !== null) setStep(location.step);
      } else if (location.screen === "new") {
        if (index.capabilities.edit) {
          newCycle();
          setStep(location.step ?? 0);
        } else setNotice("You do not have permission to create a calendar.");
      } else if (location.screen === "comparison") {
        setOverviewMode("COMPARISON");
        setComparisonMonth(location.comparisonMonth);
        setComparisonMode(location.comparisonMode);
        setComparisonDay(location.comparisonDay);
        comparisonVisited.current = true;
      }
      if (controller.signal.aborted) return;
      setFrequency(location.frequency);
      setMonth(location.month);
      setNavigationReady(true);
    })().catch((e) => {
      if (!controller.signal.aborted) setRestoreError(failure(e));
    });
    return () => controller.abort();
    // One initial view per company mount; retries keep the requested URL intact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!index, navigationReady, restoreAttempt]);
  useEffect(() => {
    if (!navigationReady) return;
    const url = calendarLocationUrl(window.location.href, {
      screen: hasDocument
        ? creating
          ? "new"
          : "calendar"
        : overviewMode === "COMPARISON"
          ? "comparison"
          : "cycles",
      calendarId: detail?.id ?? "",
      step: step as 0 | 1 | 2,
      version: snapshot ? viewVersion : null,
      frequency,
      month,
      comparisonMonth,
      comparisonMode,
      comparisonDay,
    });
    if (
      url !==
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    )
      window.history.replaceState(window.history.state, "", url);
  }, [
    navigationReady,
    hasDocument,
    creating,
    detail?.id,
    overviewMode,
    step,
    snapshot,
    viewVersion,
    frequency,
    month,
    comparisonMonth,
    comparisonMode,
    comparisonDay,
  ]);
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
    setOmissionReasons({});
  }, [rules.start, rules.end, rules.country]);
  useEffect(() => {
    if (!navigationReady) return;
    if (month && months.length && !months.includes(month)) {
      setMonth("");
      setMonthNotice(
        "The selected month is outside this cycle. Showing the full cycle.",
      );
    }
  }, [rules.start, rules.end, month, navigationReady]);
  useEffect(() => {
    if (confirm) focus(confirmationRef);
  }, [confirm]);

  function change<K extends keyof CalendarRules>(
    key: K,
    value: CalendarRules[K],
  ) {
    if (readonly || busy) return;
    setExternalIssue(null);
    setActiveField("");
    setApprovalNotice(null);
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
      setNotice("");
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
    if (action === "approve") {
      const issue = calendarIssues(draftRules, true)[0];
      if (issue) {
        goToIssue(issue);
        return;
      }
      if (dirty) {
        approvalMessage("Save your changes before approving.", "SAVE");
        return;
      }
      if (!previewReady) {
        if (preview.error) {
          const issue =
            calendarIssues(draftRules, false)[0] ?? serverIssue(preview.error);
          setExternalIssue(issue);
          if (issue.field === "approval") approvalMessage(preview.error);
          else goToIssue(issue);
        } else
          approvalMessage(
            "The preview is still updating. Wait for it to finish, then check its dates and rules.",
          );
        return;
      }
      if (!agreed) {
        const issue: CalendarIssue = {
          field: "approvalCheck",
          step: 2,
          message: "Confirm you have checked the preview and default rules.",
        };
        setExternalIssue(issue);
        goToIssue(issue);
        return;
      }
    }
    const ok = await task(
      async () => {
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
      },
      (message) => {
        const issue = serverIssue(message);
        setExternalIssue(issue);
        approvalMessage(
          message,
          /another|changed|stale|reload/i.test(message) ? "RELOAD" : undefined,
        );
        if (issue.field !== "approval") goToIssue(issue);
      },
    );
    if (ok)
      moveTo(
        action === "approve"
          ? 2
          : action === "revise" || action === "return" || action === "withdraw"
            ? 0
            : step,
      );
  }
  function updateExceptions(
    next: CalendarException[],
    label: string,
    omissions = draftRules.holidayOmissions,
  ) {
    if (readonly || busy) return;
    setUndo((u) => [
      ...u.slice(-19),
      {
        before: draftRules.exceptions,
        after: next,
        label,
        omissionsBefore: draftRules.holidayOmissions,
        omissionsAfter: omissions,
      },
    ]);
    setRules((r) => ({ ...r, exceptions: next, holidayOmissions: omissions }));
    setAgreed(false);
    setDateNotice(label);
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
    setRules((r) => ({
      ...r,
      exceptions: last.before,
      holidayOmissions: last.omissionsBefore,
    }));
    setAgreed(false);
    setUndo((u) => u.slice(0, -1));
    setDateNotice(`Undone: ${last.label} Save the draft to keep this change.`);
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
        `${displayDate(date)} already has an entry: ${duplicate.reason}. Edit the existing entry.`,
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
  if (index && !navigationReady)
    return (
      <div className={`${styles.workspace} mx-auto max-w-6xl space-y-4 p-4`}>
        <h1 className="text-2xl font-semibold">Rules & calendar</h1>
        {restoreError ? (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-destructive/30 p-4"
          >
            <p>Could not reopen your calendar view.</p>
            <p>{restoreError}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRestoreAttempt((n) => n + 1)}>
                Retry opening calendar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setRestoreError("");
                  setNavigationReady(true);
                }}
              >
                Back to cycles
              </Button>
            </div>
          </div>
        ) : (
          <p role="status">Reopening your calendar view…</p>
        )}
      </div>
    );
  return (
    <CalendarFeedback.Provider
      value={{
        issues: fieldIssues,
        shown: showIssues || !!externalIssue,
        active: activeField,
      }}
    >
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
                  busy ||
                  !!cycleDateIssue(draftRules.start, draftRules.end, true)
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
        {draftAction && (
          <div
            ref={draftActionRef}
            tabIndex={-1}
            role="region"
            aria-label="Confirm draft removal"
            className="scroll-mt-24 rounded-xl border border-destructive/30 bg-card p-5 space-y-3"
          >
            <h2 className="font-semibold">
              {draftAction.kind === "delete"
                ? "Delete this draft?"
                : "Discard this draft revision?"}
            </h2>
            <p className="text-sm">
              <strong>{draftAction.name}</strong>.{" "}
              {draftAction.kind === "delete"
                ? "This removes the saved draft and its change history permanently. It has no approved version."
                : "This removes the changes in this draft revision. The approved calendar and its versions remain unchanged."}{" "}
              {detail?.id === draftAction.id && dirty
                ? "Your unsaved changes will also be discarded."
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDraftAction(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={removeDraft}
              >
                {draftAction.kind === "delete"
                  ? "Delete draft"
                  : "Discard revision"}
              </Button>
            </div>
          </div>
        )}
        {!index && !error && <p role="status">Loading calendars…</p>}
        {index && hasDocument && (
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <strong>{rules.name.trim() || "New performance cycle"}</strong>
              <p className="mt-1 text-sm text-muted-foreground">
                {displayDate(rules.start)} – {displayDate(rules.end)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {audienceLabel(rules.audience)}
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
              Each calendar uses one holiday country and time zone. Assign a
              company default, selected departments, or a named group of people.
              A branch name alone does not assign anyone; explicitly select the
              people who share that calendar.
            </p>
            <p className="mt-2">
              Drafts can be edited by authorised calendar editors. Approval
              preserves a numbered, read-only version. Create a revision to
              propose changes; the approved version stays available while you
              work.
            </p>
          </details>
        )}
        {index && !hasDocument && (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Calendar overview views"
          >
            <Button
              variant={overviewMode === "CYCLES" ? "default" : "outline"}
              aria-pressed={overviewMode === "CYCLES"}
              onClick={() => setOverviewMode("CYCLES")}
            >
              Calendars
            </Button>
            <Button
              variant={overviewMode === "COMPARISON" ? "default" : "outline"}
              aria-pressed={overviewMode === "COMPARISON"}
              onClick={() => {
                if (!comparisonVisited.current) {
                  const covering = index.calendars.some(
                    (c) =>
                      c.start &&
                      c.end &&
                      c.start.slice(0, 7) <= comparisonMonth &&
                      c.end.slice(0, 7) >= comparisonMonth,
                  );
                  if (!covering) {
                    const starts = index.calendars
                      .map((c) => c.start?.slice(0, 7))
                      .filter((v): v is string => !!v)
                      .sort();
                    if (starts.length)
                      setComparisonMonth(
                        starts.find((v) => v >= comparisonMonth) ??
                          starts.at(-1)!,
                      );
                  }
                  comparisonVisited.current = true;
                }
                setOverviewMode("COMPARISON");
              }}
            >
              Compare calendars
            </Button>
          </div>
        )}
        {index && !hasDocument && (
          <p className="text-sm text-muted-foreground">
            Compare working and non-working days across teams and locations.
          </p>
        )}
        {index && !hasDocument && overviewMode === "COMPARISON" && (
          <CalendarComparisonPanel
            token={token}
            month={comparisonMonth}
            onMonthChange={setComparisonMonth}
            mode={comparisonMode}
            onModeChange={setComparisonMode}
            day={comparisonDay}
            onDayChange={setComparisonDay}
            countries={countries}
            onOpen={(id) => openCycle(id, true)}
            onBack={() => setOverviewMode("CYCLES")}
          />
        )}
        {index && !hasDocument && overviewMode === "CYCLES" && (
          <section
            ref={overviewRef}
            tabIndex={-1}
            aria-label="Saved performance cycles"
            className="space-y-4 outline-none"
          >
            <div>
              <h2 className="text-lg font-semibold">Performance cycles</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Open a calendar to continue its draft or view an approved
                version.
              </p>
            </div>
            {canEdit && index.calendars.length > 0 && (
              <details className={`${styles.calendarNotes} text-sm`}>
                <summary className="cursor-pointer font-medium">
                  About copying calendars
                </summary>
                <p className="mt-2">
                  Start another team, branch or year from an existing calendar.
                  Copy draft uses the current draft; Copy approved uses the
                  named approved version. The copy starts unsaved with no
                  company or group assigned. Review its name, dates, holidays
                  and people; the original stays unchanged.
                </p>
              </details>
            )}
            {index.calendars.length ? (
              <ul className="grid gap-4 md:grid-cols-2">
                {index.calendars.map((c) => (
                  <li key={c.id}>
                    <CalendarCycleCard
                      calendar={c}
                      editable={canEdit}
                      busy={busy}
                      timeZone={timeZone}
                      onOpen={() => openCycle(c.id)}
                      onApproved={() => openCycle(c.id, true)}
                      onCopy={() => copyCycle(c.id)}
                      onRemove={() => prepareDraftAction(c.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <Card className={styles.settingsCard}>
                <CardContent className="py-8">
                  <CalendarDays className="mb-3 h-8 w-8 text-primary" />
                  <h3 className="font-semibold">
                    {canEdit
                      ? "Set up your first performance calendar"
                      : "No approved calendar yet"}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {canEdit
                      ? "Choose New cycle above. Set dates and working days, agree the defaults, then preview and approve. Create a cycle for a planning date range—not for every plan or reporting frequency."
                      : "Management publishes approved calendars here when they are ready."}
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {snapshot && dirty && (
          <p className="rounded-lg bg-accent p-3 text-sm">
            Your unsaved draft is retained. Return to current draft to continue
            editing it.
          </p>
        )}
        {hasDocument && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={backToCycles}
            >
              <ChevronLeft /> Back to cycles
            </Button>
            {canEdit && detail?.status === "DRAFT" && !snapshot && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => prepareDraftAction(detail.id)}
              >
                {detail.approved ? "Discard revision…" : "Delete draft…"}
              </Button>
            )}
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
                <Button
                  variant="outline"
                  onClick={() =>
                    goToIssue(
                      calendarIssues(draftRules, false).find(
                        (i) => i.field === "start" || i.field === "end",
                      ) ?? { field: "end", step: 0, message: dateIssue },
                    )
                  }
                >
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
                <CalendarAudienceEditor
                  rules={rules}
                  calendarId={detail?.id}
                  token={token}
                  readonly={readonly}
                  busy={busy}
                  onChange={(value) => change("audience", value)}
                />
                <Section
                  title="Performance cycle"
                  description="A calendar year or financial year. These dates contain the reporting periods used by plans."
                >
                  <div className={styles.twoFields}>
                    <Field label="Cycle name" field="name">
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
                      field="timeZone"
                      note="Submission deadlines use this zone, regardless of the viewer’s computer."
                    >
                      <TimeZonePicker
                        value={rules.timeZone}
                        companyTimeZone={timeZone}
                        disabled={readonly || busy}
                        onChange={(value) => change("timeZone", value)}
                      />
                    </Field>
                    <Field label="Cycle starts" field="start">
                      <DateInput
                        min="1900-01-01"
                        max="2199-12-31"
                        aria-label="Cycle starts"
                        value={rules.start}
                        disabled={readonly || busy}
                        aria-invalid={!!dateIssue}
                        aria-describedby={
                          dateIssue ? "cycle-date-error" : "cycle-date-help"
                        }
                        onChange={(value) => change("start", value)}
                      />
                    </Field>
                    <Field label="Cycle ends" field="end">
                      <DateInput
                        aria-label="Cycle ends"
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
                        onChange={(value) => change("end", value)}
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
                      For a new cycle, changing the start date updates the
                      suggested end date until you edit it. Saved dates and
                      existing calendar entries are never shifted automatically.
                    </p>
                  </div>
                </Section>
                <Section
                  title="Working week & days off"
                  description="Choose your regular working week, then mark individual dates as working or non-working."
                >
                  <FieldFrame field="workdays">
                    <fieldset disabled={readonly || busy}>
                      <legend className="mb-3 text-sm font-medium">
                        Regular working week
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
                  </FieldFrame>
                  {!readonly && (
                    <div
                      ref={exceptionRef}
                      tabIndex={-1}
                      className="scroll-mt-24 space-y-3 rounded-lg border border-border bg-accent/30 p-4 outline-none"
                    >
                      <p className="text-sm font-medium">
                        {editingDate
                          ? `Editing ${displayDate(editingDate)}`
                          : "Set individual dates"}
                      </p>
                      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Date" field="exceptionDate">
                          <DateInput
                            aria-label="Date"
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
                            onChange={(value) => {
                              setException((x) => ({
                                ...x,
                                date: value,
                              }));
                              setExceptionError("");
                              setDuplicateDate(null);
                            }}
                          />
                        </Field>
                        <Field label="Mark as">
                          <Select
                            disabled={busy}
                            value={exception.kind}
                            options={[
                              ["NON_WORKING", "Non-working day"],
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
                        <Field label="Reason" field="exceptionReason">
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
                          {editingDate ? "Update date" : "Add to calendar"}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setException(emptyException());
                              setEditingDate(null);
                              setExceptionError("");
                              setDuplicateDate(null);
                            }}
                          >
                            Cancel entry
                          </Button>
                          {duplicateDate && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => editException(duplicateDate)}
                            >
                              Edit existing date
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!readonly && (dateNotice || undo.length > 0) && (
                    <div className={styles.dateFeedback}>
                      <p role="status">{dateNotice || undo.at(-1)?.label}</p>
                      {undo.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={undoException}
                          title={undo.at(-1)?.label}
                        >
                          <Undo2 /> Undo last date change
                        </Button>
                      )}
                      <small className="basis-full text-muted-foreground">
                        Undo changes the draft. Save again if the previous
                        change was already saved.
                      </small>
                    </div>
                  )}
                  {invalidExceptions.length > 0 && (
                    <p role="alert" className="text-sm text-destructive">
                      {invalidExceptions.length} calendar date(s) need
                      correction before preview or approval. They are marked
                      below.
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
                              : "Non-working day"}
                            <p className="break-words text-muted-foreground">
                              {e.reason}
                            </p>
                            {exceptionIssue(rules, e.date) && (
                              <p className="mt-1 text-destructive">
                                {exceptionIssue(rules, e.date)}
                              </p>
                            )}
                            {holidayNameUpdate(rules.country, e) && (
                              <div className="mt-1 text-sm">
                                <p className="text-destructive">
                                  This holiday name is outdated.
                                </p>
                                <p>
                                  <strong>
                                    Updated holiday name: Mazingira Day
                                  </strong>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  The date and working-day choice stay
                                  unchanged.
                                </p>
                                {!readonly && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() =>
                                      updateExceptions(
                                        rules.exceptions.map((x) =>
                                          x.date === e.date
                                            ? {
                                                ...x,
                                                reason: holidayNameUpdate(
                                                  rules.country,
                                                  e,
                                                )!,
                                              }
                                            : x,
                                        ),
                                        "Holiday name updated. The date is unchanged.",
                                      )
                                    }
                                  >
                                    Update name
                                  </Button>
                                )}
                              </div>
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
                      No individual dates added.
                    </p>
                  )}
                  {!!rules.holidayOmissions?.length && (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium">
                        Omitted holiday decisions (
                        {rules.holidayOmissions.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {rules.holidayOmissions.map((h, i) => (
                          <li key={`${h.country}:${h.date}:${i}`}>
                            <strong>
                              {displayDate(h.date)} · {h.name}
                            </strong>
                            <p>{h.reason}</p>
                          </li>
                        ))}
                      </ul>
                      {!readonly && (
                        <p className="mt-2 text-muted-foreground">
                          Find suggestions again to revise these choices;
                          selecting a date removes its omission decision.
                        </p>
                      )}
                    </details>
                  )}
                  {!readonly && (
                    <details
                      ref={holidayPickerRef}
                      className="rounded-lg border border-border p-4"
                      open
                    >
                      <summary className="cursor-pointer text-sm font-medium text-primary">
                        Suggest holidays & observed dates
                      </summary>
                      <div className="mt-4 space-y-4">
                        <div className={styles.holidaySearch}>
                          <CountryPicker
                            countries={countries}
                            value={rules.country}
                            disabled={busy}
                            onChange={(value) => change("country", value)}
                          />
                          <Button
                            variant="outline"
                            className={styles.findHolidays}
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
                          New suggestions, including optional closures, start
                          checked. Untick unwanted dates, then accept.
                        </p>
                        {holidayError && !suggestions && (
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
                                        <span className="mt-1 block text-xs font-medium">
                                          {e.category === "OPTIONAL_CLOSURE"
                                            ? "Optional company closure · original date"
                                            : e.category ===
                                                "OBSERVED_PUBLIC_HOLIDAY"
                                              ? "Observed public holiday"
                                              : "Public holiday · actual date"}
                                          {rules.workdays.includes(
                                            new Date(
                                              `${e.date}T00:00:00Z`,
                                            ).getUTCDay(),
                                          )
                                            ? " · normally a working day"
                                            : " · already outside your normal working week"}
                                        </span>
                                        {e.note && (
                                          <span className="mt-1 block text-xs text-muted-foreground">
                                            {e.note}
                                          </span>
                                        )}
                                        {existing && (
                                          <span className="mt-1 block text-xs text-muted-foreground">
                                            Already added: {existing.reason}.
                                            Its saved choice will not be
                                            overwritten.
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
                            {omittedSuggestions.length > 0 && (
                              <FieldFrame field="holidayOmissions">
                                <fieldset
                                  aria-labelledby="omissions-title"
                                  className={`space-y-3 rounded-lg border p-3 ${holidayError ? "border-destructive bg-destructive/5" : "border-border"}`}
                                >
                                  <h3
                                    id="omissions-title"
                                    className="text-sm font-medium"
                                  >
                                    Reasons for omitted holiday suggestions
                                  </h3>
                                  <p className="text-xs text-muted-foreground">
                                    For example, not applicable to this
                                    calendar. These suggestions are not a legal
                                    determination. Optional company closures do
                                    not need a reason.
                                  </p>
                                  {omittedSuggestions.map((h) => (
                                    <Field
                                      key={h.date}
                                      label={`Why omit ${displayDate(h.date)} · ${h.reason}?`}
                                    >
                                      <Input
                                        disabled={busy}
                                        maxLength={300}
                                        id={`holiday-omission-${h.date}`}
                                        aria-invalid={
                                          !!holidayError &&
                                          !omittedReason(h.date).trim()
                                        }
                                        aria-describedby={
                                          holidayError
                                            ? "holiday-choice-error"
                                            : undefined
                                        }
                                        className={
                                          holidayError &&
                                          !omittedReason(h.date).trim()
                                            ? "border-destructive ring-1 ring-destructive"
                                            : ""
                                        }
                                        value={omittedReason(h.date)}
                                        onChange={(e) =>
                                          setOmissionReasons((v) => ({
                                            ...v,
                                            [h.date]: e.target.value,
                                          }))
                                        }
                                      />
                                    </Field>
                                  ))}
                                </fieldset>
                              </FieldFrame>
                            )}
                            {holidayError && (
                              <p
                                id="holiday-choice-error"
                                role="alert"
                                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                              >
                                {holidayError}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3">
                              <Button
                                disabled={
                                  busy ||
                                  (selectedCount === 0 &&
                                    omittedSuggestions.length === 0)
                                }
                                onClick={() => {
                                  if (
                                    omittedSuggestions.some(
                                      (h) => !omittedReason(h.date).trim(),
                                    )
                                  ) {
                                    const missing = omittedSuggestions.filter(
                                      (h) => !omittedReason(h.date).trim(),
                                    );
                                    setHolidayError(
                                      `Enter a reason for ${missing.length === 1 ? "the holiday you left unchecked" : `each of the ${missing.length} holidays you left unchecked`}.`,
                                    );
                                    requestAnimationFrame(() => {
                                      const field = document.getElementById(
                                        `holiday-omission-${missing[0].date}`,
                                      );
                                      field?.scrollIntoView({
                                        block: "center",
                                        behavior: "smooth",
                                      });
                                      field?.focus({ preventScroll: true });
                                    });
                                    return;
                                  }
                                  setHolidayError("");
                                  const decisions = [
                                    ...(rules.holidayOmissions ?? []).filter(
                                      (h) =>
                                        h.country !== rules.country ||
                                        !suggestions.some(
                                          (s) => s.date === h.date,
                                        ),
                                    ),
                                    ...omittedSuggestions.map((h) => ({
                                      date: h.date,
                                      name: h.reason,
                                      country: rules.country,
                                      reason: omittedReason(h.date).trim(),
                                    })),
                                  ];
                                  const next = acceptedExceptions(
                                    rules.exceptions,
                                    suggestions,
                                    checked,
                                  );
                                  updateExceptions(
                                    next,
                                    `${next.length - rules.exceptions.length} holiday dates added; ${omittedSuggestions.length} omission reasons recorded.`,
                                    decisions,
                                  );
                                  setSuggestions(null);
                                  setChecked([]);
                                  setOmissionReasons({});
                                  if (holidayPickerRef.current)
                                    holidayPickerRef.current.open = false;
                                }}
                              >
                                Accept selected ({selectedCount})
                              </Button>
                              {undo.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={undoException}
                                >
                                  <Undo2 /> Undo last date change
                                </Button>
                              )}
                            </div>
                            {dateNotice && (
                              <p role="status" className="text-sm">
                                {dateNotice}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </details>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Individual dates after cycle-end can cover submission
                    deadlines for up to 120 days. Dates before the cycle starts
                    must be corrected or removed.
                  </p>
                </Section>
              </>
            )}

            {step === 1 && (
              <PeriodSettings
                rules={rules}
                disabled={readonly || busy}
                change={change}
              />
            )}

            {step === 2 && (
              <Section
                title="Preview & approval"
                description="Check the dates before publishing. Selecting a frequency here only changes the preview, not every plan’s schedule."
              >
                <div className="rounded-lg border border-border p-3 text-sm">
                  <strong>
                    Calendar assignment: {audienceLabel(rules.audience)}
                  </strong>
                  <p className="mt-1 text-muted-foreground">
                    {rules.audience?.kind === "PEOPLE"
                      ? `${rules.audience.employeeIds.length} selected people.`
                      : rules.audience?.kind === "DEPARTMENTS"
                        ? `${rules.audience.departmentIds.length} selected departments.`
                        : rules.audience?.kind === "COMPANY"
                          ? "Company default where no more specific approved assignment applies."
                          : "No automatic people assignment; available for explicit plan selection."}{" "}
                    Existing plans retain their selected version.
                  </p>
                  {!readonly && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() =>
                        goToIssue({ field: "audience", step: 0, message: "" })
                      }
                    >
                      Review who uses this calendar
                    </Button>
                  )}
                </div>
                <div className={styles.previewControls}>
                  <div>
                    <Field label="Preview reporting frequency">
                      <Select
                        value={frequency}
                        options={available.map((f) => [f, FREQ[f]])}
                        onChange={(v) => {
                          setFrequency(v as Frequency);
                          setAgreed(false);
                        }}
                      />
                    </Field>
                  </div>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      How the preview is used
                    </summary>
                    <p className="mt-2">
                      This selector previews how reporting periods and deadlines
                      would look at each frequency; it does not set a
                      company-wide frequency or change an existing plan. Updates
                      automatically. Each KPI chooses an enabled reporting
                      frequency during planning.
                    </p>
                  </details>
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
                {!rules.name.trim() && !snapshot && (
                  <p className="text-sm text-muted-foreground">
                    You can preview dates now. Give the cycle a name before
                    sending it for review or approval.{" "}
                    <Button
                      size="sm"
                      variant="link"
                      onClick={() =>
                        goToIssue({ field: "name", step: 0, message: "" })
                      }
                    >
                      Enter cycle name
                    </Button>
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
                      {preview.accessError ? (
                        <Button
                          variant="outline"
                          onClick={() =>
                            navigate(() => window.location.reload())
                          }
                        >
                          Reload company access
                        </Button>
                      ) : preview.retryable ? (
                        <Button
                          variant="outline"
                          onClick={() => setPreviewRetry((n) => n + 1)}
                        >
                          Retry preview
                        </Button>
                      ) : (
                          calendarIssues(rules, false)[0] ??
                          serverIssue(preview.error)
                        ).field !== "approval" ? (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const issue =
                              calendarIssues(rules, false)[0] ??
                              serverIssue(preview.error);
                            setExternalIssue(issue);
                            goToIssue(issue);
                          }}
                        >
                          {(calendarIssues(rules, false)[0]?.field ??
                            serverIssue(preview.error).field) === "timeZone"
                            ? "Correct time zone"
                            : "Correct highlighted field"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
                {preview.value && !preview.busy && !preview.error && (
                  <CalendarPreview
                    preview={preview.value}
                    reviewFrequency={rules.reviewFrequency}
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
                          {h.action.replaceAll("_", " ")} · revision{" "}
                          {h.revision} ·{" "}
                          {new Date(h.createdAt).toLocaleString()}
                        </summary>
                        {h.reason && <p className="mt-2">{h.reason}</p>}
                        <p className="mt-2 text-muted-foreground">
                          {h.snapshot.name} · {displayDate(h.snapshot.start)} to{" "}
                          {displayDate(h.snapshot.end)} · {h.snapshot.timeZone}
                        </p>
                        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="font-medium">Working week</dt>
                            <dd>
                              {h.snapshot.workdays
                                .map((d) => DAYS[d])
                                .join(", ")}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium">Submission</dt>
                            <dd>
                              {h.snapshot.submissionDays}{" "}
                              {h.snapshot.submissionDayType.toLowerCase()} days
                              · {h.snapshot.submissionTime}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium">Review frequency</dt>
                            <dd>{FREQ[h.snapshot.reviewFrequency]}</dd>
                          </div>
                          <div>
                            <dt className="font-medium">Individual dates</dt>
                            <dd>{h.snapshot.exceptions.length}</dd>
                          </div>
                          {Object.entries(h.snapshot.responsibilities).map(
                            ([key, value]) => (
                              <div key={key}>
                                <dt className="font-medium capitalize">
                                  {key}
                                </dt>
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
                <Card className={styles.settingsCard}>
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
                          numbered version. Changes afterwards require a
                          revision. Calendar adoption in live plans is not
                          available yet. When connected, each plan must select a
                          version and confirm its named owner, provider,
                          verifier and approver; publishing a revision must not
                          silently change existing plans.
                        </p>
                        {dirty && (
                          <p role="status" className="text-sm">
                            Save your changes before confirming approval.
                          </p>
                        )}
                        {!previewReady && (
                          <p role="status" className="text-sm">
                            {preview.busy
                              ? "Updating the preview. Check it when loading finishes."
                              : "Correct the preview error before confirming approval."}
                          </p>
                        )}
                        <FieldFrame field="approvalCheck">
                          <label className="flex gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={agreed}
                              disabled={!previewReady || dirty}
                              onChange={(e) => {
                                setAgreed(e.target.checked);
                                setExternalIssue(null);
                              }}
                            />
                            I have checked the calendar preview and default
                            rules.
                          </label>
                        </FieldFrame>
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
                          busy || (confirm !== "approve" && !reason.trim())
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

            {approvalNotice && (
              <div
                id={fieldId("approval")}
                ref={approvalNoticeRef}
                tabIndex={-1}
                role="alert"
                className={styles.actionFeedback}
              >
                <p>{approvalNotice.message}</p>
                {approvalNotice.kind === "SAVE" && (
                  <Button disabled={busy} onClick={() => void save()}>
                    Save draft
                  </Button>
                )}
                {approvalNotice.kind === "RELOAD" && detail && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      navigate(() => {
                        void task(() => reload(detail.id));
                      })
                    }
                  >
                    Reload saved version
                  </Button>
                )}
              </div>
            )}
            <div
              className={styles.footerClearance}
              style={{ height: footerHeight }}
              aria-hidden="true"
            />
            <div ref={footerRef} className={styles.footer}>
              <p role="status" className={styles.saveStatus}>
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
              <div className={styles.footerActions}>
                <Button variant="ghost" disabled={busy} onClick={backToCycles}>
                  Back to cycles
                </Button>
                {step > 0 && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => moveTo(step - 1)}
                  >
                    <ChevronLeft /> Previous
                  </Button>
                )}
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
                      disabled={
                        busy ||
                        dirty ||
                        !!completeDateIssue ||
                        !rules.name.trim()
                      }
                      onClick={() => act("submit")}
                    >
                      Send for review
                    </Button>
                  )}
                {!snapshot &&
                  (creating ||
                    (detail &&
                      ["DRAFT", "IN_REVIEW"].includes(detail.status))) &&
                  canApprove && (
                    <Button disabled={busy} onClick={startApproval}>
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
    </CalendarFeedback.Provider>
  );
}
