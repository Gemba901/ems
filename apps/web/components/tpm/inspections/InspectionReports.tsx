"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Factory,
  FileCheck2,
  ListChecks,
  MapPin,
  Play,
  Plus,
  Save,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import { useAuthStore } from "@/store/auth.store";
import { useAssets } from "../AssetsProvider";
import { useInspections } from "./InspectionsProvider";
import {
  getInspectionProgress,
  inspectionItemHasIssue,
  inspectionToday,
  isValidInspectionDate,
  validateInspection,
  type InspectionAnswer,
  type InspectionReport,
} from "./inspection-preview";
import "./inspection-reports.css";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function inspectorRoleLabel(role: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    MANAGEMENT: "Management",
    HR: "HR",
    HOD: "Head of Department",
    EMPLOYEE: "Employee",
  };
  return labels[role] ?? (role ? role.replaceAll("_", " ") : "Not recorded");
}

function inspectionDateLabel(value: string) {
  if (!isValidInspectionDate(value)) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function ReportTabs() {
  return (
    <nav className="insp-tabs" aria-label="Inspection sections">
      <Link href="/tpm/inspections">
        <ListChecks size={16} />
        Checklists
      </Link>
      <Link href="/tpm/inspection-reports" aria-current="page">
        <FileCheck2 size={16} />
        Reports
      </Link>
    </nav>
  );
}

function ReportState({
  error,
  retry,
}: {
  error?: string | null;
  retry?: () => void;
}) {
  return (
    <div className="tpm-empty" role={error ? "alert" : "status"}>
      <ClipboardCheck size={30} />
      <h2>{error ? "Unable to load inspections" : "Loading inspections…"}</h2>
      {error && (
        <>
          <p>{error}</p>
          <button className="tpm-button" onClick={retry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: InspectionReport["status"] }) {
  return (
    <span
      className={`insp-report-status ${status === "Completed" ? "complete" : "progress"}`}
    >
      {status === "Completed" ? (
        <CheckCircle2 size={13} />
      ) : (
        <Clock3 size={13} />
      )}
      {status}
    </span>
  );
}

export function InspectionReports() {
  const { reports, loading, error, retry } = useInspections();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  if (loading || error) return <ReportState error={error} retry={retry} />;
  const needle = search.trim().toLowerCase();
  const filtered = reports
    .filter(
      (report) =>
        (!status || report.status === status) &&
        (!needle ||
          `${report.code} ${report.checklistName} ${report.assetName} ${report.assetCode} ${report.inspectorName}`
            .toLowerCase()
            .includes(needle)),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const summaries = [
    {
      label: "Total inspections",
      value: reports.length,
      Icon: ClipboardCheck,
      tone: "blue",
    },
    {
      label: "In progress",
      value: reports.filter((report) => report.status === "In progress").length,
      Icon: Clock3,
      tone: "amber",
    },
    {
      label: "Completed",
      value: reports.filter((report) => report.status === "Completed").length,
      Icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "With issues",
      value: reports.filter(
        (report) => getInspectionProgress(report).issues > 0,
      ).length,
      Icon: TriangleAlert,
      tone: "red",
    },
  ];
  return (
    <div className="insp-report-workspace">
      <header className="tpm-page-heading">
        <div>
          <h1>
            Inspection reports{" "}
            <span className="tpm-count">{reports.length}</span>
          </h1>
          <p>Inspect your assets and keep a record of every check.</p>
        </div>
        <Link href="/tpm/inspection-reports/new" className="tpm-button primary">
          <Plus size={17} />
          New inspection
        </Link>
      </header>
      <ReportTabs />
      <div className="insp-report-summaries">
        {summaries.map(({ label, value, Icon, tone }) => (
          <div className="insp-report-summary" key={label}>
            <span className={`insp-report-summary-icon ${tone}`}>
              <Icon size={19} />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>
      <section
        className="insp-panel insp-report-filters"
        aria-label="Find inspection reports"
      >
        <div className="insp-report-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Search inspection reports"
            placeholder="Search checklist, asset, report code or inspector…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Inspection status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          <option>In progress</option>
          <option>Completed</option>
        </select>
      </section>
      {filtered.length ? (
        <>
          <p className="insp-report-result-count">
            Showing {filtered.length} of {reports.length} inspections
          </p>
          <div className="insp-report-list">
            {filtered.map((report) => {
              const progress = getInspectionProgress(report);
              return (
                <Link
                  href={`/tpm/inspection-reports/${report.id}`}
                  className="insp-report-row"
                  key={report.id}
                >
                  <span className="insp-report-row-icon">
                    <ClipboardCheck size={21} />
                  </span>
                  <div className="insp-report-row-main">
                    <span className="insp-report-eyebrow">
                      {report.code} · {report.kind} · {report.frequency}
                    </span>
                    <h2>{report.checklistName}</h2>
                    <span>
                      <Factory size={13} />
                      {report.assetName} <small>{report.assetCode}</small>
                    </span>
                  </div>
                  <div className="insp-report-row-person">
                    <span>
                      <UserRound size={13} />
                      {report.inspectorName}
                    </span>
                    <small>{inspectorRoleLabel(report.inspectorRole)}</small>
                    <small>
                      Inspection date:{" "}
                      {inspectionDateLabel(report.inspectionDate)}
                    </small>
                  </div>
                  <div className="insp-report-row-result">
                    <StatusBadge status={report.status} />
                    <span className={progress.issues ? "has-issues" : ""}>
                      {progress.issues
                        ? `${progress.issues} issue${progress.issues === 1 ? "" : "s"}`
                        : report.status === "Completed"
                          ? "No issues recorded"
                          : `${progress.answered}/${progress.total} answered`}
                    </span>
                  </div>
                  <ChevronRight size={18} className="insp-report-chevron" />
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <div className="insp-panel insp-report-empty">
          <span className="insp-report-empty-icon">
            <ClipboardCheck size={30} />
          </span>
          <h2>
            {reports.length
              ? "No matching inspections"
              : "Your first inspection starts here"}
          </h2>
          <p>
            {reports.length
              ? "Try a different search or status."
              : "Choose a checklist and an asset, then record your findings as you inspect."}
          </p>
          {reports.length ? (
            <button
              className="tpm-button"
              onClick={() => {
                setSearch("");
                setStatus("");
              }}
            >
              Clear filters
            </button>
          ) : (
            <Link
              href="/tpm/inspection-reports/new"
              className="tpm-button primary"
            >
              <Play size={15} />
              Start an inspection
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function NewInspection({ checklistId }: { checklistId?: string }) {
  const { checklists, loading, error, retry, startInspection } =
    useInspections();
  const assetsContext = useAssets();
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const [selectedChecklist, setSelectedChecklist] = useState(checklistId ?? "");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [inspectionDate, setInspectionDate] = useState(() =>
    inspectionToday(user?.organizationTimeZone),
  );
  const [saveError, setSaveError] = useState("");
  const [starting, setStarting] = useState(false);
  if (loading || assetsContext.loading || error || assetsContext.error)
    return (
      <ReportState
        error={error || assetsContext.error}
        retry={() => {
          retry();
          assetsContext.retry();
        }}
      />
    );
  const published = checklists.filter(
    (checklist) => checklist.status === "Published",
  );
  const eligibleAssets = assetsContext.assets
    .filter(
      (asset) => asset.stage === "Registered" && asset.usage !== "Retired",
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const checklist = published.find((item) => item.id === selectedChecklist);
  const asset = eligibleAssets.find((item) => item.id === selectedAsset);
  function start(event: FormEvent) {
    event.preventDefault();
    if (!checklist || !asset || starting) return;
    setStarting(true);
    setSaveError("");
    try {
      const report = startInspection(checklist.id, asset.id, inspectionDate);
      router.push(`/tpm/inspection-reports/${report.id}`);
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not start this inspection. Please try again.",
      );
      setStarting(false);
    }
  }
  return (
    <div className="insp-report-workspace">
      <Link href="/tpm/inspection-reports" className="insp-report-back">
        <ArrowLeft size={16} />
        Inspection reports
      </Link>
      <header className="tpm-page-heading">
        <div>
          <h1>New inspection</h1>
          <p>
            Choose your checklist and asset, then confirm the inspector details.
          </p>
        </div>
      </header>
      <ReportTabs />
      {!published.length || !eligibleAssets.length ? (
        <div className="insp-panel insp-report-empty">
          <span className="insp-report-empty-icon">
            <ListChecks size={30} />
          </span>
          <h2>
            {!published.length
              ? "Publish a checklist first"
              : "Add an asset to get started"}
          </h2>
          <p>
            {!published.length
              ? "Create an AM or PM checklist and publish it so your team can use it for inspections."
              : "Inspections need a registered asset. Draft and retired assets cannot be selected."}
          </p>
          <Link
            className="tpm-button primary"
            href={!published.length ? "/tpm/inspections" : "/tpm/assets"}
          >
            {!published.length ? "Go to checklists" : "Go to assets"}
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <form className="insp-report-start-layout" onSubmit={start}>
          <section className="insp-panel insp-report-start-form">
            <div className="insp-report-section-heading">
              <span className="insp-report-summary-icon blue">
                <ClipboardCheck size={21} />
              </span>
              <div>
                <h2>Inspection details</h2>
                <p>One checklist, one asset, a clear inspection record.</p>
              </div>
            </div>
            <div className="tpm-field">
              <label htmlFor="inspection-checklist">
                Checklist <span aria-label="required">*</span>
              </label>
              <select
                id="inspection-checklist"
                value={checklist?.id ?? ""}
                onChange={(event) => {
                  setSelectedChecklist(event.target.value);
                  setSaveError("");
                }}
                required
              >
                <option value="">Select a published checklist</option>
                {published.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.kind} · {item.frequency}
                  </option>
                ))}
              </select>
              <small>
                Only published checklists are available for inspection.
              </small>
            </div>
            <div className="tpm-field">
              <label htmlFor="inspection-asset">
                Asset <span aria-label="required">*</span>
              </label>
              <select
                id="inspection-asset"
                value={asset?.id ?? ""}
                onChange={(event) => {
                  setSelectedAsset(event.target.value);
                  setSaveError("");
                }}
                required
              >
                <option value="">Select an asset</option>
                {eligibleAssets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.code}
                  </option>
                ))}
              </select>
            </div>
            {asset && (
              <div className="insp-report-selected-asset">
                <Factory size={21} />
                <div>
                  <strong>{asset.name}</strong>
                  <span>
                    {asset.code} · {asset.level}
                  </span>
                  <span>
                    <MapPin size={13} />
                    {asset.location || "Location not set"}
                  </span>
                </div>
                <span className="insp-report-asset-usage">{asset.usage}</span>
              </div>
            )}
            <fieldset className="insp-report-inspector-fields">
              <legend>
                <UserRound size={17} /> Inspector details
              </legend>
              <p>
                Your signed-in name and role will be saved with this inspection.
              </p>
              <div className="insp-report-inspector-grid">
                <div className="tpm-field">
                  <label htmlFor="inspection-inspector-name">
                    Inspector name
                  </label>
                  <input
                    id="inspection-inspector-name"
                    value={user?.name ?? ""}
                    readOnly
                  />
                </div>
                <div className="tpm-field">
                  <label htmlFor="inspection-inspector-role">Role</label>
                  <input
                    id="inspection-inspector-role"
                    value={inspectorRoleLabel(user?.roleLevel ?? "")}
                    readOnly
                  />
                </div>
                <div className="tpm-field">
                  <label htmlFor="inspection-date">
                    Inspection date <span aria-label="required">*</span>
                  </label>
                  <input
                    id="inspection-date"
                    type="date"
                    value={inspectionDate}
                    max={inspectionToday(user?.organizationTimeZone)}
                    required
                    onChange={(event) => {
                      setInspectionDate(event.target.value);
                      setSaveError("");
                    }}
                  />
                </div>
              </div>
            </fieldset>
            {saveError && (
              <p className="insp-report-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="insp-report-start-actions">
              <Link href="/tpm/inspection-reports" className="tpm-button">
                Cancel
              </Link>
              <button
                className="tpm-button primary"
                type="submit"
                disabled={!checklist || !asset || starting}
              >
                <Play size={16} />
                {starting ? "Starting…" : "Start inspection"}
              </button>
            </div>
          </section>
          <aside
            className="insp-panel insp-report-template-preview"
            aria-label="Selected checklist preview"
          >
            <span className="insp-report-eyebrow">CHECKLIST PREVIEW</span>
            {checklist ? (
              <>
                <h2>{checklist.name}</h2>
                <p>
                  {checklist.description ||
                    "Follow each check and record your findings."}
                </p>
                <div className="insp-report-preview-tags">
                  <span>
                    {checklist.kind === "AM"
                      ? "Autonomous maintenance"
                      : "Preventive maintenance"}
                  </span>
                  <span>{checklist.frequency}</span>
                </div>
                <p className="insp-report-preview-count">
                  <ListChecks size={16} />
                  {checklist.items.length} checks · Version {checklist.version}
                </p>
                <ol>
                  {checklist.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.section || "General"} · {item.responseType}
                        {item.required ? " · Required" : ""}
                      </span>
                    </li>
                  ))}
                </ol>
                <small>
                  You can save your progress and finish the inspection later.
                </small>
              </>
            ) : (
              <div className="insp-report-preview-placeholder">
                <ListChecks size={35} />
                <p>Select a checklist to see its checks here.</p>
              </div>
            )}
          </aside>
        </form>
      )}
    </div>
  );
}

export function InspectionReportPage({ id }: { id: string }) {
  const { reports, loading, error, retry } = useInspections();
  if (loading || error) return <ReportState error={error} retry={retry} />;
  const report = reports.find((item) => item.id === id);
  if (!report)
    return (
      <div className="tpm-empty">
        <h1>Inspection not found</h1>
        <p>This inspection is no longer available in your workspace.</p>
        <Link href="/tpm/inspection-reports" className="tpm-button">
          Back to reports
        </Link>
      </div>
    );
  return (
    <InspectionRunner
      key={`${report.id}:${report.updatedAt}`}
      report={report}
    />
  );
}

function InspectionRunner({ report }: { report: InspectionReport }) {
  const { saveInspection } = useInspections();
  const router = useRouter();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, InspectionAnswer>>(() =>
    Object.fromEntries(
      Object.entries(report.answers).map(([id, answer]) => [id, { ...answer }]),
    ),
  );
  const [notes, setNotes] = useState(report.notes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const complete = report.status === "Completed";
  const dirty =
    !complete &&
    (JSON.stringify(answers) !== JSON.stringify(report.answers) ||
      notes !== report.notes);
  const current = { ...report, answers, notes };
  const progress = getInspectionProgress(current);
  const sections: {
    name: string;
    start: number;
    items: typeof report.items;
  }[] = [];
  report.items.forEach((item, index) => {
    const name = item.section || "General";
    const previous = sections.at(-1);
    if (previous?.name === name) previous.items.push(item);
    else sections.push({ name, start: index, items: [item] });
  });
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  function back() {
    if (!dirty || window.confirm("Discard your unsaved inspection answers?"))
      router.push("/tpm/inspection-reports");
  }
  function update(id: string, key: keyof InspectionAnswer, value: string) {
    if (complete) return;
    setAnswers((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? { value: "", note: "" }), [key]: value },
    }));
    setErrors((previous) => ({ ...previous, [id]: "", [`${id}.note`]: "" }));
    setSaveError("");
  }
  function save(finish: boolean) {
    if (saving || complete) return;
    const nextErrors = validateInspection(current, finish);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setSaveError(
        finish
          ? "Complete the required checks and add a note for each issue before completing this inspection."
          : "Check the highlighted fields before saving.",
      );
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>(
            "[aria-invalid=true], [data-invalid=true]",
          )
          ?.focus(),
      );
      return;
    }
    setSaving(true);
    try {
      saveInspection(report.id, answers, notes, finish);
      toast(
        finish
          ? "Inspection completed successfully"
          : "Inspection progress saved",
        "success",
      );
      setSaveError("");
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save this inspection. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="insp-report-workspace">
      <button type="button" className="insp-report-back" onClick={back}>
        <ArrowLeft size={16} />
        Inspection reports
      </button>
      <header className="tpm-page-heading">
        <div>
          <div className="insp-report-heading-meta">
            <span className="insp-report-eyebrow">{report.code}</span>
            <StatusBadge status={report.status} />
          </div>
          <h1>{report.checklistName}</h1>
          <p>
            {report.kind === "AM"
              ? "Autonomous maintenance"
              : "Preventive maintenance"}{" "}
            · {report.frequency} · Checklist version {report.checklistVersion}
          </p>
        </div>
        {!complete && (
          <div className="tpm-actions">
            <button
              className="tpm-button"
              type="button"
              disabled={saving}
              onClick={() => save(false)}
            >
              <Save size={16} />
              Save progress
            </button>
            <button
              className="tpm-button primary"
              type="button"
              disabled={saving}
              onClick={() => save(true)}
            >
              <Check size={17} />
              Complete inspection
            </button>
          </div>
        )}
      </header>
      <div className="insp-panel insp-report-asset-header">
        <span className="insp-report-row-icon">
          <Factory size={25} />
        </span>
        <div>
          <strong>{report.assetName}</strong>
          <span>
            {report.assetCode}
            {report.assetLocation && <> · {report.assetLocation}</>}
          </span>
        </div>
        <div className="insp-report-inspector">
          <UserRound size={16} />
          <div>
            <strong>{report.inspectorName}</strong>
            <span>{inspectorRoleLabel(report.inspectorRole)}</span>
            <span>
              Inspection date: {inspectionDateLabel(report.inspectionDate)}
            </span>
          </div>
        </div>
      </div>
      {complete && (
        <div
          className={`insp-report-completion ${progress.issues ? "with-issues" : ""}`}
          role="status"
        >
          {progress.issues ? (
            <TriangleAlert size={22} />
          ) : (
            <CheckCircle2 size={22} />
          )}
          <div>
            <strong>
              {progress.issues
                ? `Completed with ${progress.issues} issue${progress.issues === 1 ? "" : "s"}`
                : "Inspection completed"}
            </strong>
            <span>
              {report.completedAt ? dateLabel(report.completedAt) : "Completed"}{" "}
              · {progress.answered} of {progress.total} checks answered
              {progress.naCount ? ` · ${progress.naCount} not applicable` : ""}
            </span>
          </div>
        </div>
      )}
      <form
        className="insp-report-run-layout"
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
      >
        <div className="insp-report-checks">
          {saveError && (
            <div
              className="insp-report-error insp-report-error-banner"
              role="alert"
            >
              <TriangleAlert size={18} />
              {saveError}
            </div>
          )}
          {sections.map((section) => (
            <section
              className="insp-report-check-section"
              key={`${section.start}:${section.name}`}
              aria-label={section.name}
            >
              <div className="insp-report-check-section-heading">
                <h2>{section.name}</h2>
                <span>{section.items.length} checks</span>
              </div>
              {section.items.map((item, index) => {
                const answer = answers[item.id] ?? { value: "", note: "" };
                const issue = inspectionItemHasIssue(item, answer);
                const number = section.start + index + 1;
                const error = errors[item.id];
                const noteError = errors[`${item.id}.note`];
                const controlId = `inspection-answer-${item.id}`;
                return (
                  <article
                    key={item.id}
                    className={`insp-panel insp-report-check ${issue ? "has-issue" : ""}`}
                  >
                    <div className="insp-report-check-title">
                      <span className="insp-report-check-number">
                        {String(number).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 id={`${controlId}-label`}>
                          {item.title}
                          {item.required && (
                            <span className="insp-report-required">
                              Required
                            </span>
                          )}
                        </h3>
                        {item.instructions && (
                          <p id={`${controlId}-instructions`}>
                            {item.instructions}
                          </p>
                        )}
                      </div>
                      {issue && (
                        <span className="insp-report-issue-label">
                          <TriangleAlert size={13} />
                          Issue
                        </span>
                      )}
                    </div>
                    {complete ? (
                      <div
                        className={`insp-report-read-answer ${issue ? "has-issue" : ""}`}
                      >
                        <span>Result</span>
                        <strong>
                          {answer.value === "NA"
                            ? "Not applicable"
                            : answer.value
                              ? `${answer.value}${item.responseType === "Number" && item.unit ? ` ${item.unit}` : ""}`
                              : "Not answered"}
                        </strong>
                      </div>
                    ) : item.responseType === "Pass / Fail" ? (
                      <div
                        role="radiogroup"
                        aria-labelledby={`${controlId}-label`}
                        aria-describedby={
                          error ? `${controlId}-error` : undefined
                        }
                        className="insp-report-response-choices"
                      >
                        {["Pass", "Fail", ...(item.allowNa ? ["NA"] : [])].map(
                          (value) => (
                            <label
                              key={value}
                              className={`insp-report-response-choice ${answer.value === value ? "selected" : ""} ${value.toLowerCase()}`}
                            >
                              <input
                                type="radio"
                                name={controlId}
                                value={value}
                                checked={answer.value === value}
                                onChange={() => update(item.id, "value", value)}
                                data-invalid={!!error}
                                aria-describedby={
                                  error ? `${controlId}-error` : undefined
                                }
                              />
                              {value === "Pass" ? (
                                <Check size={15} />
                              ) : value === "Fail" ? (
                                <TriangleAlert size={15} />
                              ) : null}
                              {value === "NA" ? "N/A" : value}
                            </label>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="tpm-field insp-report-answer-field">
                        <label
                          className="insp-report-sr-only"
                          htmlFor={controlId}
                        >
                          {item.title}
                        </label>
                        {item.responseType === "Number" ? (
                          <div className="insp-report-number">
                            <input
                              id={controlId}
                              type="number"
                              step="any"
                              value={answer.value === "NA" ? "" : answer.value}
                              disabled={answer.value === "NA"}
                              onChange={(event) =>
                                update(item.id, "value", event.target.value)
                              }
                              placeholder="Enter reading"
                              aria-invalid={!!error}
                              aria-describedby={[
                                error ? `${controlId}-error` : "",
                                `${controlId}-range`,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            />
                            {item.unit && <span>{item.unit}</span>}
                          </div>
                        ) : (
                          <textarea
                            id={controlId}
                            rows={3}
                            value={answer.value === "NA" ? "" : answer.value}
                            disabled={answer.value === "NA"}
                            onChange={(event) =>
                              update(item.id, "value", event.target.value)
                            }
                            placeholder="Enter your observation"
                            aria-invalid={!!error}
                            aria-describedby={
                              error ? `${controlId}-error` : undefined
                            }
                            maxLength={4000}
                          />
                        )}
                        {item.allowNa && (
                          <label className="insp-report-na-toggle">
                            <input
                              type="checkbox"
                              checked={answer.value === "NA"}
                              onChange={(event) =>
                                update(
                                  item.id,
                                  "value",
                                  event.target.checked ? "NA" : "",
                                )
                              }
                              aria-label={`Not applicable for ${item.title}`}
                            />
                            Mark as not applicable
                          </label>
                        )}
                      </div>
                    )}
                    {item.responseType === "Number" && (
                      <p
                        id={`${controlId}-range`}
                        className="insp-report-range"
                      >
                        {item.min !== "" && item.max !== ""
                          ? `Expected range: ${item.min}–${item.max}`
                          : item.min !== ""
                            ? `Minimum: ${item.min}`
                            : item.max !== ""
                              ? `Maximum: ${item.max}`
                              : "Record the measured value"}
                        {item.unit ? ` ${item.unit}` : ""}
                      </p>
                    )}
                    {error && (
                      <p
                        id={`${controlId}-error`}
                        className="insp-report-error"
                      >
                        {error}
                      </p>
                    )}
                    {complete ? (
                      answer.note && (
                        <div className="insp-report-read-note">
                          <span>Note</span>
                          <p>{answer.note}</p>
                        </div>
                      )
                    ) : (
                      <div className="tpm-field insp-report-note-field">
                        <label htmlFor={`${controlId}-note`}>
                          {issue ? "Issue note" : "Note"}
                          <span>
                            {issue ? "Required to complete" : "Optional"}
                          </span>
                        </label>
                        <textarea
                          id={`${controlId}-note`}
                          rows={2}
                          value={answer.note}
                          onChange={(event) =>
                            update(item.id, "note", event.target.value)
                          }
                          placeholder={
                            issue
                              ? "Describe the issue and any immediate action taken…"
                              : "Add an observation…"
                          }
                          aria-label={`Notes for ${item.title}`}
                          aria-invalid={!!noteError}
                          aria-describedby={
                            noteError ? `${controlId}-note-error` : undefined
                          }
                          maxLength={4000}
                        />
                        {noteError && (
                          <p
                            id={`${controlId}-note-error`}
                            className="insp-report-error"
                          >
                            {noteError}
                          </p>
                        )}
                      </div>
                    )}
                    {complete && issue && (
                      <Link
                        className="tpm-button"
                        href={`/tpm/work-orders/new?report=${encodeURIComponent(report.id)}&item=${encodeURIComponent(item.id)}`}
                      >
                        <Plus size={14} /> Create work order
                      </Link>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
          <section className="insp-panel insp-report-overall-notes">
            <h2>Overall notes</h2>
            {complete ? (
              <p>{notes || "No additional notes."}</p>
            ) : (
              <div className="tpm-field">
                <label
                  className="insp-report-sr-only"
                  htmlFor="inspection-overall-notes"
                >
                  Overall notes
                </label>
                <textarea
                  id="inspection-overall-notes"
                  value={notes}
                  rows={4}
                  onChange={(event) => setNotes(event.target.value)}
                  aria-invalid={!!errors.notes}
                  aria-describedby={
                    errors.notes ? "inspection-overall-notes-error" : undefined
                  }
                  placeholder="Add a handover note or anything else the team should know…"
                  maxLength={4000}
                />
                {errors.notes && (
                  <p
                    id="inspection-overall-notes-error"
                    className="insp-report-error"
                  >
                    {errors.notes}
                  </p>
                )}
              </div>
            )}
          </section>
          {!complete && (
            <div className="insp-report-bottom-actions">
              <span aria-live="polite">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <button type="button" className="tpm-button" onClick={back}>
                Back to reports
              </button>
              <button
                type="button"
                className="tpm-button primary"
                onClick={() => save(true)}
                disabled={saving}
              >
                <Check size={16} />
                Complete inspection
              </button>
            </div>
          )}
        </div>
        <aside className="insp-panel insp-report-run-summary">
          <span className="insp-report-eyebrow">INSPECTION SUMMARY</span>
          <div className="insp-report-progress-number">
            <strong>
              {progress.answered}
              <span> / {progress.total}</span>
            </strong>
            <span>checks answered</span>
          </div>
          <progress
            max={Math.max(progress.total, 1)}
            value={progress.answered}
            aria-label="Inspection progress"
          />
          <dl>
            <div>
              <dt>Inspector</dt>
              <dd>{report.inspectorName}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{inspectorRoleLabel(report.inspectorRole)}</dd>
            </div>
            <div>
              <dt>Inspection date</dt>
              <dd>{inspectionDateLabel(report.inspectionDate)}</dd>
            </div>
            <div>
              <dt>Record started</dt>
              <dd>{dateLabel(report.startedAt)}</dd>
            </div>
            <div>
              <dt>Required checks</dt>
              <dd>
                {progress.requiredAnswered} / {progress.requiredTotal}
              </dd>
            </div>
            <div>
              <dt>Issues found</dt>
              <dd className={progress.issues ? "has-issues" : ""}>
                {progress.issues}
              </dd>
            </div>
            <div>
              <dt>Not applicable</dt>
              <dd>{progress.naCount}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{report.status}</dd>
            </div>
          </dl>
          {!complete && (
            <p>
              Complete required checks and describe any issues. Save your
              progress to continue later.
            </p>
          )}
          {!complete && (
            <button
              className="tpm-button"
              type="button"
              disabled={saving}
              onClick={() => save(false)}
            >
              <Save size={15} />
              Save progress
            </button>
          )}
          {complete && (
            <button type="button" className="tpm-button" onClick={back}>
              <ArrowLeft size={15} />
              Back to reports
            </button>
          )}
        </aside>
      </form>
    </div>
  );
}
