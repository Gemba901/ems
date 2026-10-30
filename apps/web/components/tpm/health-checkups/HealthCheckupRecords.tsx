"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileHeart,
  Plus,
  Save,
  Search,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import { useAuthStore } from "@/store/auth.store";
import { useAssets } from "../AssetsProvider";
import { useHealthCheckups } from "./HealthCheckupsProvider";
import {
  HealthCheckupTabs,
  HealthOutcomeBadge,
} from "./HealthCheckupTabs";
import {
  HEALTH_CONDITIONS,
  evaluateHealthReport,
  getCheckupProgress,
  healthItemHasIssue,
  healthToday,
  isValidHealthDate,
  previousCheckupsForAsset,
  validateCheckup,
  type HealthAnswer,
  type HealthCheckup,
} from "./health-checkup-preview";

function dateLabel(value: string) {
  if (!isValidHealthDate(value)) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function LoadingState({
  error,
  retry,
  label = "checkups",
}: {
  error?: string | null;
  retry?: () => void;
  label?: string;
}) {
  return (
    <div className="hc-empty" role={error ? "alert" : "status"}>
      <ClipboardCheck size={30} />
      <h2>{error ? `Could not load ${label}` : `Loading ${label}…`}</h2>
      {error && (
        <>
          <p>{error}</p>
          <button type="button" className="tpm-button" onClick={retry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

export function HealthCheckupList() {
  const { checkups, loading, error, retry } = useHealthCheckups();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  if (loading || error)
    return <LoadingState error={error} retry={retry} />;

  const visible = checkups
    .filter((item) => {
      const needle = search.trim().toLowerCase();
      return (
        (!status || item.status === status) &&
        (!needle ||
          `${item.code} ${item.standardName} ${item.assetName} ${item.assetCode} ${item.technicianName} ${item.healthStatus ?? ""}`
            .toLowerCase()
            .includes(needle))
      );
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <h1>
            Record results <span className="tpm-count">{checkups.length}</span>
          </h1>
          <p>
            Technicians enter readings, condition ratings, comments, and photos.
            Previous results stay visible for comparison.
          </p>
        </div>
        <Link
          href="/tpm/health-checkups/checkups/new"
          className="tpm-button primary"
        >
          <Plus size={17} /> Start checkup
        </Link>
      </header>
      <HealthCheckupTabs />
      <section className="hc-metrics" aria-label="Checkup summary">
        {[
          {
            label: "Total checkups",
            value: checkups.length,
            tone: "blue",
            icon: ClipboardCheck,
          },
          {
            label: "In progress",
            value: checkups.filter((item) => item.status === "In progress")
              .length,
            tone: "amber",
            icon: Save,
          },
          {
            label: "Needs follow-up",
            value: checkups.filter(
              (item) => item.status === "Pending verification",
            ).length,
            tone: "red",
            icon: TriangleAlert,
          },
          {
            label: "Healthy",
            value: checkups.filter((item) => item.healthStatus === "Healthy")
              .length,
            tone: "green",
            icon: CheckCircle2,
          },
        ].map((metric) => (
          <div key={metric.label} className="hc-metric">
            <span className={`hc-metric-icon ${metric.tone}`}>
              <metric.icon size={18} />
            </span>
            <div>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          </div>
        ))}
      </section>
      <div className="hc-toolbar">
        <label className="hc-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search checkups…"
            aria-label="Search checkups"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="In progress">In progress</option>
          <option value="Pending verification">Pending verification</option>
          <option value="Completed">Completed</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <div className="hc-empty">
          <ClipboardCheck size={30} />
          <h2>No checkups recorded</h2>
          <p>Start from a scheduled assignment or pick a standard and machine.</p>
          <Link
            href="/tpm/health-checkups/checkups/new"
            className="tpm-button primary"
          >
            <Plus size={16} /> Start checkup
          </Link>
        </div>
      ) : (
        <div className="hc-table-wrap">
          <table className="hc-table">
            <thead>
              <tr>
                <th>Checkup</th>
                <th>Machine</th>
                <th>Technician</th>
                <th>Date</th>
                <th>Health</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((checkup) => (
                <tr key={checkup.id}>
                  <td>
                    <Link href={`/tpm/health-checkups/checkups/${checkup.id}`}>
                      {checkup.code}
                    </Link>
                    <div style={{ color: "#697f9a", marginTop: 4 }}>
                      {checkup.standardName}
                    </div>
                  </td>
                  <td>
                    {checkup.assetName}
                    <div style={{ color: "#697f9a", marginTop: 4 }}>
                      {checkup.assetCode}
                    </div>
                  </td>
                  <td>{checkup.technicianName}</td>
                  <td>{dateLabel(checkup.checkupDate)}</td>
                  <td>
                    <HealthOutcomeBadge status={checkup.healthStatus} />
                    {checkup.score != null && (
                      <div style={{ color: "#697f9a", marginTop: 4 }}>
                        Score {checkup.score}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`hc-badge ${
                        checkup.status === "Completed"
                          ? "completed"
                          : checkup.status === "Pending verification"
                            ? "pending"
                            : "progress"
                      }`}
                    >
                      {checkup.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NewHealthCheckup() {
  const {
    standards,
    assignments,
    checkups,
    startCheckup,
    loading,
    error,
    retry,
  } = useHealthCheckups();
  const assets = useAssets();
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const user = useAuthStore((state) => state.user);
  const assignmentId = params.get("assignment") ?? "";
  const verifiesId = params.get("verify") ?? "";
  const assignment = assignments.find((item) => item.id === assignmentId);
  const original = checkups.find((item) => item.id === verifiesId);
  const published = standards.filter((item) => item.status === "Published");
  const machines = assets.assets.filter(
    (item) => item.stage === "Registered" && item.usage !== "Retired",
  );
  const [standardId, setStandardId] = useState(
    assignment?.standardId ?? original?.standardId ?? published[0]?.id ?? "",
  );
  const [assetId, setAssetId] = useState(
    assignment?.assetId ?? original?.assetId ?? "",
  );
  const [checkupDate, setCheckupDate] = useState(
    healthToday(user?.organizationTimeZone),
  );

  if (loading || assets.loading || error || assets.error)
    return (
      <LoadingState
        error={error || assets.error}
        retry={() => {
          retry();
          assets.retry();
        }}
      />
    );

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const checkup = startCheckup({
        standardId,
        assetId,
        checkupDate,
        assignmentId: assignment?.id,
        verifiesCheckupId: original?.id,
      });
      toast(
        original ? "Verification checkup started" : "Checkup started",
        "success",
      );
      router.push(`/tpm/health-checkups/checkups/${checkup.id}`);
    } catch (cause) {
      toast(
        cause instanceof Error ? cause.message : "Could not start checkup.",
        "error",
      );
    }
  }

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <Link href="/tpm/health-checkups/checkups" className="tpm-eyebrow">
            <ArrowLeft size={14} /> Back to checkups
          </Link>
          <h1>
            {original ? "Verify after repair" : "Start health checkup"}
          </h1>
          <p>
            {original
              ? `Re-check ${original.assetName} after corrective work before updating the health result.`
              : "Choose the standard and machine, then record readings against the accepted ranges."}
          </p>
        </div>
      </header>
      <HealthCheckupTabs />
      <form className="hc-panel" onSubmit={submit}>
        <div className="hc-form-grid">
          <div className="tpm-field">
            <label htmlFor="hc-new-standard">Standard</label>
            <select
              id="hc-new-standard"
              value={standardId}
              onChange={(event) => setStandardId(event.target.value)}
              disabled={!!assignment || !!original}
            >
              {published.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.machineType})
                </option>
              ))}
            </select>
          </div>
          <div className="tpm-field">
            <label htmlFor="hc-new-asset">Machine</label>
            <select
              id="hc-new-asset"
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              disabled={!!assignment || !!original}
            >
              <option value="">Select a machine</option>
              {machines.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </div>
          <div className="tpm-field">
            <label htmlFor="hc-new-date">Checkup date</label>
            <input
              id="hc-new-date"
              type="date"
              value={checkupDate}
              max={healthToday(user?.organizationTimeZone)}
              onChange={(event) => setCheckupDate(event.target.value)}
            />
          </div>
        </div>
        <div className="hc-bottom-actions">
          <Link href="/tpm/health-checkups/checkups" className="tpm-button">
            Cancel
          </Link>
          <button type="submit" className="tpm-button primary">
            Start checkup
          </button>
        </div>
      </form>
    </div>
  );
}

export function HealthCheckupDetail({ id }: { id: string }) {
  const { checkups, saveCheckup, loading, error, retry } = useHealthCheckups();
  const checkup = checkups.find((item) => item.id === id);
  const { toast } = useToast();
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, HealthAnswer>>({});
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!checkup) return;
    setAnswers(
      Object.fromEntries(
        checkup.items.map((item) => [
          item.id,
          checkup.answers[item.id] ?? { value: "", note: "", photo: "" },
        ]),
      ),
    );
    setNotes(checkup.notes);
    setDirty(false);
    setErrors({});
  }, [checkup]);

  const previous = useMemo(() => {
    if (!checkup) return [];
    return previousCheckupsForAsset(
      checkups,
      checkup.assetId,
      checkup.standardId,
      checkup.id,
    ).slice(0, 3);
  }, [checkups, checkup]);

  if (loading || error)
    return <LoadingState error={error} retry={retry} />;
  if (!checkup)
    return (
      <div className="hc-empty" role="alert">
        <h2>Checkup not found</h2>
        <Link href="/tpm/health-checkups/checkups" className="tpm-button">
          Back to checkups
        </Link>
      </div>
    );

  const locked =
    checkup.status === "Completed" ||
    checkup.status === "Pending verification";
  const live = evaluateHealthReport({ ...checkup, answers, notes });
  const progress = getCheckupProgress({ ...checkup, answers, notes });

  function update(itemId: string, patch: Partial<HealthAnswer>) {
    setDirty(true);
    setAnswers((current) => ({
      ...current,
      [itemId]: { ...current[itemId], ...patch },
    }));
  }

  function persist(complete = false) {
    const draft = { ...checkup!, answers, notes };
    const validation = validateCheckup(draft, complete);
    setErrors(validation);
    if (Object.keys(validation).length) {
      toast(Object.values(validation)[0], "error");
      return;
    }
    try {
      const saved = saveCheckup(checkup!.id, answers, notes, complete);
      setDirty(false);
      toast(
        complete
          ? saved.healthStatus === "Healthy"
            ? "Checkup completed — Healthy"
            : saved.status === "Pending verification"
              ? "Checkup saved — corrective work needed"
              : `Checkup completed — ${saved.healthStatus}`
          : "Progress saved",
        "success",
      );
      if (complete) router.push(`/tpm/health-checkups/reports/${saved.id}`);
    } catch (cause) {
      toast(
        cause instanceof Error ? cause.message : "Could not save checkup.",
        "error",
      );
    }
  }

  async function onPhoto(itemId: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Choose an image file.", "error");
      return;
    }
    if (file.size > 900_000) {
      toast("Keep photos under about 900 KB for this preview.", "error");
      return;
    }
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read photo."));
      reader.readAsDataURL(file);
    });
    update(itemId, { photo: dataUrl });
  }

  const sections = [...new Set(checkup.items.map((item) => item.section))];

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <Link href="/tpm/health-checkups/checkups" className="tpm-eyebrow">
            <ArrowLeft size={14} /> Back to checkups
          </Link>
          <h1>
            {checkup.code}{" "}
            <HealthOutcomeBadge
              status={locked ? checkup.healthStatus : live.healthStatus}
            />
          </h1>
          <p>
            {checkup.assetName} · {checkup.standardName} ·{" "}
            {dateLabel(checkup.checkupDate)}
            {checkup.verifiesCheckupId
              ? " · Verification after repair"
              : ""}
          </p>
        </div>
        {!locked && (
          <div className="hc-row-actions">
            <button
              type="button"
              className="tpm-button"
              onClick={() => persist(false)}
            >
              <Save size={15} /> Save progress
            </button>
            <button
              type="button"
              className="tpm-button primary"
              onClick={() => persist(true)}
            >
              <Check size={15} /> Complete checkup
            </button>
          </div>
        )}
      </header>
      <HealthCheckupTabs />

      <section className="hc-report-hero" aria-label="Live health summary">
        <div className="hc-score-card">
          <span className="hc-badge progress">
            {progress.answered}/{progress.total} checks answered
          </span>
          <div className={`hc-score ${(locked ? checkup.healthStatus : live.healthStatus) === "Healthy" ? "healthy" : (locked ? checkup.healthStatus : live.healthStatus) === "Needs Attention" ? "attention" : (locked ? checkup.healthStatus : live.healthStatus) === "Critical" ? "critical" : "incomplete"}`}>
            {locked ? (checkup.score ?? 0) : live.score}
          </div>
          <HealthOutcomeBadge
            status={locked ? checkup.healthStatus : live.healthStatus}
          />
          <p style={{ margin: "10px 0 0", color: "#697f9a" }}>
            Missing checks show as Incomplete — never Healthy.
          </p>
        </div>
        <div className="hc-panel" style={{ margin: 0 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Problems found</h2>
          {(locked ? checkup.problems : live.problems).length === 0 ? (
            <p style={{ margin: 0, color: "#697f9a" }}>No problems recorded yet.</p>
          ) : (
            <ul className="hc-problems">
              {(locked ? checkup.problems : live.problems).map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {previous.length > 0 && (
        <div className="hc-compare" aria-label="Previous results">
          <strong>Previous results for comparison</strong>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {previous.map((item) => (
              <div key={item.id}>
                {dateLabel(item.checkupDate)} · {item.code} ·{" "}
                {item.healthStatus ?? "—"}
                {item.score != null ? ` · score ${item.score}` : ""}
                {" · "}
                <Link href={`/tpm/health-checkups/reports/${item.id}`}>
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {sections.map((section) => (
        <section key={section || "general"} className="hc-check-list">
          <h2 style={{ margin: "4px 0 0", fontSize: 15 }}>
            {section || "General"}
          </h2>
          {checkup.items
            .filter((item) => item.section === section)
            .map((item) => {
              const answer = answers[item.id] ?? {
                value: "",
                note: "",
                photo: "",
              };
              const issue = healthItemHasIssue(item, answer);
              const prev = previous[0]?.answers[item.id];
              return (
                <article
                  key={item.id}
                  className={`hc-check-card${issue ? " is-issue" : ""}`}
                >
                  <header>
                    <div>
                      <h3>
                        {item.title}
                        {item.required ? " *" : ""}
                      </h3>
                      {item.instructions && <p>{item.instructions}</p>}
                      {prev && (
                        <p>
                          Previous: {prev.value || "—"}
                          {prev.note ? ` · ${prev.note}` : ""}
                        </p>
                      )}
                    </div>
                    {issue && (
                      <span className="hc-badge attention">Issue</span>
                    )}
                  </header>

                  {item.responseType === "Pass / Fail" ||
                  item.responseType === "Condition" ? (
                    <div className="hc-choice-row" role="radiogroup">
                      {(item.responseType === "Pass / Fail"
                        ? ["Pass", "Fail"]
                        : HEALTH_CONDITIONS
                      ).map((value) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name={`answer-${item.id}`}
                            value={value}
                            checked={answer.value === value}
                            disabled={locked}
                            onChange={() => update(item.id, { value })}
                          />
                          {value}
                        </label>
                      ))}
                    </div>
                  ) : item.responseType === "Number" ? (
                    <div>
                      <div className="hc-number-row">
                        <input
                          type="number"
                          step="any"
                          value={answer.value}
                          disabled={locked}
                          onChange={(event) =>
                            update(item.id, { value: event.target.value })
                          }
                          aria-invalid={!!errors[item.id]}
                        />
                        {item.unit && <span>{item.unit}</span>}
                      </div>
                      <p style={{ margin: "6px 0 0", color: "#697f9a" }}>
                        Acceptable:{" "}
                        {item.min && item.max
                          ? `${item.min}–${item.max}`
                          : item.min
                            ? `min ${item.min}`
                            : `max ${item.max}`}
                        {item.unit ? ` ${item.unit}` : ""}
                      </p>
                    </div>
                  ) : (
                    <textarea
                      rows={3}
                      value={answer.value}
                      disabled={locked}
                      onChange={(event) =>
                        update(item.id, { value: event.target.value })
                      }
                      maxLength={4000}
                    />
                  )}
                  {errors[item.id] && (
                    <p className="hc-error">{errors[item.id]}</p>
                  )}

                  <div className="tpm-field">
                    <label htmlFor={`note-${item.id}`}>
                      {issue ? "Problem comment (required)" : "Comment"}
                    </label>
                    <textarea
                      id={`note-${item.id}`}
                      rows={2}
                      value={answer.note}
                      disabled={locked}
                      onChange={(event) =>
                        update(item.id, { note: event.target.value })
                      }
                      maxLength={4000}
                    />
                    {errors[`${item.id}.note`] && (
                      <p className="hc-error">{errors[`${item.id}.note`]}</p>
                    )}
                  </div>

                  <div className="hc-photo-preview">
                    {answer.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={answer.photo} alt={`Photo for ${item.title}`} />
                    ) : null}
                    {!locked && (
                      <label className="tpm-button">
                        <Camera size={14} />{" "}
                        {answer.photo ? "Replace photo" : "Add photo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hc-sr-only"
                          onChange={(event) =>
                            void onPhoto(
                              item.id,
                              event.target.files?.[0] ?? null,
                            )
                          }
                        />
                      </label>
                    )}
                    {!locked && answer.photo && (
                      <button
                        type="button"
                        className="tpm-button"
                        onClick={() => update(item.id, { photo: "" })}
                      >
                        Remove photo
                      </button>
                    )}
                  </div>

                  {locked && issue && (
                    <Link
                      className="tpm-button"
                      href={`/tpm/work-orders/new?checkup=${encodeURIComponent(checkup.id)}&item=${encodeURIComponent(item.id)}`}
                    >
                      <Wrench size={14} /> Create corrective work order
                    </Link>
                  )}
                </article>
              );
            })}
        </section>
      ))}

      <section className="hc-panel">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Overall notes</h2>
        {locked ? (
          <p style={{ margin: 0 }}>{notes || "No additional notes."}</p>
        ) : (
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => {
              setDirty(true);
              setNotes(event.target.value);
            }}
            maxLength={4000}
          />
        )}
      </section>

      {(checkup.status === "Pending verification" ||
        (locked &&
          (checkup.healthStatus === "Needs Attention" ||
            checkup.healthStatus === "Critical"))) && (
        <div className="hc-panel">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>
            Corrective work & re-check
          </h2>
          <p style={{ color: "#697f9a" }}>
            Raise or link a work order for problems. After repairs, verify the
            condition before the health result can return to Healthy.
          </p>
          <div className="hc-row-actions">
            <Link
              className="tpm-button"
              href={`/tpm/work-orders/new?checkup=${encodeURIComponent(checkup.id)}`}
            >
              <Plus size={14} /> Raise work order
            </Link>
            <Link
              className="tpm-button primary"
              href={`/tpm/health-checkups/checkups/new?verify=${encodeURIComponent(checkup.id)}`}
            >
              <CheckCircle2 size={14} /> Verify condition
            </Link>
          </div>
          {checkup.workOrderIds.length > 0 && (
            <p style={{ marginTop: 12, color: "#697f9a" }}>
              Linked work orders: {checkup.workOrderIds.join(", ")}
            </p>
          )}
        </div>
      )}

      {!locked && (
        <div className="hc-bottom-actions">
          <span aria-live="polite">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="hc-row-actions">
            <button
              type="button"
              className="tpm-button"
              onClick={() => persist(false)}
            >
              Save progress
            </button>
            <button
              type="button"
              className="tpm-button primary"
              onClick={() => persist(true)}
            >
              Complete checkup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HealthReports() {
  const { checkups, loading, error, retry } = useHealthCheckups();
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  if (loading || error)
    return <LoadingState error={error} retry={retry} label="reports" />;

  const reports = checkups.filter(
    (item) =>
      item.status === "Completed" || item.status === "Pending verification",
  );
  const visible = reports
    .filter((item) => {
      const needle = search.trim().toLowerCase();
      return (
        (!outcome || item.healthStatus === outcome) &&
        (!needle ||
          `${item.code} ${item.assetName} ${item.standardName} ${item.healthStatus ?? ""}`
            .toLowerCase()
            .includes(needle))
      );
    })
    .sort((a, b) => b.checkupDate.localeCompare(a.checkupDate));

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <h1>
            Health reports <span className="tpm-count">{reports.length}</span>
          </h1>
          <p>
            Healthy, Needs Attention, or Critical — with a score and the
            problems found. Incomplete when checks are missing.
          </p>
        </div>
      </header>
      <HealthCheckupTabs />
      <section className="hc-metrics" aria-label="Health report summary">
        {(
          [
            ["Healthy", "green", CheckCircle2],
            ["Needs Attention", "amber", TriangleAlert],
            ["Critical", "red", TriangleAlert],
            ["Incomplete", "purple", FileHeart],
          ] as const
        ).map(([label, tone, Icon]) => (
          <div key={label} className="hc-metric">
            <span className={`hc-metric-icon ${tone}`}>
              <Icon size={18} />
            </span>
            <div>
              <strong>
                {
                  reports.filter((item) => item.healthStatus === label)
                    .length
                }
              </strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </section>
      <div className="hc-toolbar">
        <label className="hc-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports…"
            aria-label="Search health reports"
          />
        </label>
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          aria-label="Filter by health outcome"
        >
          <option value="">All outcomes</option>
          <option value="Healthy">Healthy</option>
          <option value="Needs Attention">Needs Attention</option>
          <option value="Critical">Critical</option>
          <option value="Incomplete">Incomplete</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <div className="hc-empty">
          <FileHeart size={30} />
          <h2>No health reports yet</h2>
          <p>Complete a checkup to generate a scored health report.</p>
        </div>
      ) : (
        <div className="hc-table-wrap">
          <table className="hc-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Machine</th>
                <th>Outcome</th>
                <th>Score</th>
                <th>Problems</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((report) => (
                <tr key={report.id}>
                  <td>
                    <Link href={`/tpm/health-checkups/reports/${report.id}`}>
                      {report.code}
                    </Link>
                    <div style={{ color: "#697f9a", marginTop: 4 }}>
                      {report.standardName}
                    </div>
                  </td>
                  <td>{report.assetName}</td>
                  <td>
                    <HealthOutcomeBadge status={report.healthStatus} />
                  </td>
                  <td>{report.score ?? "—"}</td>
                  <td>{report.problems.length}</td>
                  <td>{dateLabel(report.checkupDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function HealthReportDetail({ id }: { id: string }) {
  const { checkups, loading, error, retry } = useHealthCheckups();
  const checkup = checkups.find((item) => item.id === id);
  if (loading || error)
    return <LoadingState error={error} retry={retry} label="report" />;
  if (!checkup)
    return (
      <div className="hc-empty" role="alert">
        <h2>Report not found</h2>
        <Link href="/tpm/health-checkups/reports" className="tpm-button">
          Back to reports
        </Link>
      </div>
    );

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <Link href="/tpm/health-checkups/reports" className="tpm-eyebrow">
            <ArrowLeft size={14} /> Back to reports
          </Link>
          <h1>
            {checkup.code}{" "}
            <HealthOutcomeBadge status={checkup.healthStatus} />
          </h1>
          <p>
            {checkup.assetName} · {checkup.standardName} · score{" "}
            {checkup.score ?? "—"}
          </p>
        </div>
        <Link
          href={`/tpm/health-checkups/checkups/${checkup.id}`}
          className="tpm-button"
        >
          Open checkup record
        </Link>
      </header>
      <HealthCheckupTabs />
      <section className="hc-report-hero">
        <div className="hc-score-card">
          <div className={`hc-score ${checkup.healthStatus === "Healthy" ? "healthy" : checkup.healthStatus === "Needs Attention" ? "attention" : checkup.healthStatus === "Critical" ? "critical" : "incomplete"}`}>{checkup.score ?? 0}</div>
          <HealthOutcomeBadge status={checkup.healthStatus} />
          <p style={{ margin: "10px 0 0", color: "#697f9a" }}>
            Status: {checkup.status}
            {checkup.verifiedAt
              ? ` · Verified ${new Date(checkup.verifiedAt).toLocaleString()}`
              : ""}
          </p>
        </div>
        <div className="hc-panel" style={{ margin: 0 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Problems found</h2>
          {checkup.problems.length === 0 ? (
            <p style={{ margin: 0, color: "#697f9a" }}>No problems found.</p>
          ) : (
            <ul className="hc-problems">
              {checkup.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <div className="hc-panel">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Check details</h2>
        <div className="hc-check-list">
          {checkup.items.map((item) => {
            const answer = checkup.answers[item.id];
            const issue = healthItemHasIssue(item, answer);
            return (
              <article
                key={item.id}
                className={`hc-check-card${issue ? " is-issue" : ""}`}
              >
                <header>
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {answer?.value || "Not answered"}
                      {item.unit && answer?.value ? ` ${item.unit}` : ""}
                    </p>
                    {answer?.note && <p>{answer.note}</p>}
                  </div>
                  {issue && <span className="hc-badge attention">Issue</span>}
                </header>
                {answer?.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={answer.photo}
                    alt={`Photo for ${item.title}`}
                    style={{
                      width: 120,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                )}
                {issue && (
                  <Link
                    className="tpm-button"
                    href={`/tpm/work-orders/new?checkup=${encodeURIComponent(checkup.id)}&item=${encodeURIComponent(item.id)}`}
                  >
                    <Wrench size={14} /> Create corrective work order
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {(checkup.healthStatus === "Needs Attention" ||
        checkup.healthStatus === "Critical" ||
        checkup.status === "Pending verification") && (
        <div className="hc-panel">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Next step</h2>
          <div className="hc-row-actions">
            <Link
              className="tpm-button"
              href={`/tpm/work-orders/new?checkup=${encodeURIComponent(checkup.id)}`}
            >
              Raise work order
            </Link>
            <Link
              className="tpm-button primary"
              href={`/tpm/health-checkups/checkups/new?verify=${encodeURIComponent(checkup.id)}`}
            >
              Verify after repair
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
