"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  PauseCircle,
  Play,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import { useAssets } from "../AssetsProvider";
import { useHealthCheckups } from "./HealthCheckupsProvider";
import { HealthCheckupTabs } from "./HealthCheckupTabs";
import {
  HEALTH_FREQUENCIES,
  healthToday,
  validateAssignmentInput,
  type AssignmentInput,
} from "./health-checkup-preview";
import { useAuthStore } from "@/store/auth.store";

function dateLabel(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export function HealthSchedule() {
  const {
    assignments,
    standards,
    loading,
    error,
    retry,
    setAssignmentStatus,
  } = useHealthCheckups();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Active");
  const today = healthToday(useAuthStore.getState().user?.organizationTimeZone);

  if (loading || error)
    return (
      <div className="hc-empty" role={error ? "alert" : "status"}>
        <CalendarClock size={30} />
        <h2>{error ? "Could not load schedule" : "Loading schedule…"}</h2>
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

  const visible = assignments
    .filter((item) => {
      const needle = search.trim().toLowerCase();
      return (
        (!status || item.status === status) &&
        (!needle ||
          `${item.code} ${item.standardName} ${item.assetName} ${item.assetCode} ${item.assigneeName} ${item.machineType}`
            .toLowerCase()
            .includes(needle))
      );
    })
    .sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt));

  const dueSoon = assignments.filter(
    (item) =>
      item.status === "Active" && item.nextDueAt && item.nextDueAt <= today,
  ).length;

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <h1>
            Assign & schedule{" "}
            <span className="tpm-count">{assignments.length}</span>
          </h1>
          <p>
            Select which machines use a standard, who performs the checkup, and
            when it is due.
          </p>
        </div>
        <Link
          href="/tpm/health-checkups/schedule/new"
          className="tpm-button primary"
          aria-disabled={
            !standards.some((item) => item.status === "Published")
          }
        >
          <Plus size={17} /> Assign standard
        </Link>
      </header>
      <HealthCheckupTabs />
      <section className="hc-metrics" aria-label="Schedule summary">
        <div className="hc-metric">
          <span className="hc-metric-icon blue">
            <CalendarClock size={18} />
          </span>
          <div>
            <strong>
              {assignments.filter((item) => item.status === "Active").length}
            </strong>
            <span>Active assignments</span>
          </div>
        </div>
        <div className="hc-metric">
          <span className="hc-metric-icon amber">
            <CalendarClock size={18} />
          </span>
          <div>
            <strong>{dueSoon}</strong>
            <span>Due today or overdue</span>
          </div>
        </div>
        <div className="hc-metric">
          <span className="hc-metric-icon purple">
            <UserRound size={18} />
          </span>
          <div>
            <strong>
              {new Set(assignments.map((item) => item.assigneeName)).size}
            </strong>
            <span>Assignees</span>
          </div>
        </div>
        <div className="hc-metric">
          <span className="hc-metric-icon green">
            <Play size={18} />
          </span>
          <div>
            <strong>
              {standards.filter((item) => item.status === "Published").length}
            </strong>
            <span>Published standards</span>
          </div>
        </div>
      </section>
      <div className="hc-toolbar">
        <label className="hc-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assignments…"
            aria-label="Search assignments"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="Active">Active</option>
          <option value="Paused">Paused</option>
          <option value="">All</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <div className="hc-empty">
          <CalendarClock size={30} />
          <h2>No assignments yet</h2>
          <p>
            Publish a standard first, then assign it to machines with an owner
            and due date.
          </p>
          <Link
            href="/tpm/health-checkups/schedule/new"
            className="tpm-button primary"
          >
            <Plus size={16} /> Assign standard
          </Link>
        </div>
      ) : (
        <div className="hc-table-wrap">
          <table className="hc-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Standard</th>
                <th>Assignee</th>
                <th>Frequency</th>
                <th>Next due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <strong>{assignment.assetName}</strong>
                    <div style={{ color: "#697f9a", marginTop: 4 }}>
                      {assignment.assetCode}
                      {assignment.assetLocation
                        ? ` · ${assignment.assetLocation}`
                        : ""}
                    </div>
                  </td>
                  <td>
                    {assignment.standardName}
                    <div style={{ color: "#697f9a", marginTop: 4 }}>
                      {assignment.machineType} · {assignment.standardCode}
                    </div>
                  </td>
                  <td>{assignment.assigneeName || "—"}</td>
                  <td>{assignment.frequency}</td>
                  <td>
                    {dateLabel(assignment.nextDueAt)}
                    {assignment.status === "Active" &&
                      assignment.nextDueAt <= today && (
                        <div style={{ marginTop: 4 }}>
                          <span className="hc-badge attention">Due</span>
                        </div>
                      )}
                  </td>
                  <td>
                    <span
                      className={`hc-badge ${assignment.status.toLowerCase()}`}
                    >
                      {assignment.status}
                    </span>
                  </td>
                  <td>
                    <div className="hc-row-actions">
                      <Link
                        className="tpm-button primary"
                        href={`/tpm/health-checkups/checkups/new?assignment=${encodeURIComponent(assignment.id)}`}
                      >
                        <Play size={14} /> Start checkup
                      </Link>
                      <button
                        type="button"
                        className="tpm-button"
                        onClick={() => {
                          const next =
                            assignment.status === "Active"
                              ? "Paused"
                              : "Active";
                          try {
                            setAssignmentStatus(assignment.id, next);
                            toast(
                              next === "Paused"
                                ? "Assignment paused"
                                : "Assignment resumed",
                              "success",
                            );
                          } catch (cause) {
                            toast(
                              cause instanceof Error
                                ? cause.message
                                : "Could not update assignment.",
                              "error",
                            );
                          }
                        }}
                      >
                        <PauseCircle size={14} />{" "}
                        {assignment.status === "Active" ? "Pause" : "Resume"}
                      </button>
                    </div>
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

export function HealthScheduleEditor() {
  const { standards, saveAssignments, loading, error, retry } =
    useHealthCheckups();
  const assets = useAssets();
  const { toast } = useToast();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const published = standards.filter((item) => item.status === "Published");
  const machines = useMemo(
    () =>
      assets.assets.filter(
        (item) => item.stage === "Registered" && item.usage !== "Retired",
      ),
    [assets.assets],
  );
  const [form, setForm] = useState<AssignmentInput>({
    standardId: published[0]?.id ?? "",
    assetIds: [],
    assigneeName: user?.name ?? "",
    assigneeId: user?.userId ?? "",
    frequency: "Monthly",
    nextDueAt: healthToday(user?.organizationTimeZone),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (loading || assets.loading || error || assets.error)
    return (
      <div className="hc-empty" role={error || assets.error ? "alert" : "status"}>
        <CalendarClock size={30} />
        <h2>
          {error || assets.error
            ? "Could not load assignment form"
            : "Loading…"}
        </h2>
        {(error || assets.error) && (
          <>
            <p>{error || assets.error}</p>
            <button
              type="button"
              className="tpm-button"
              onClick={() => {
                retry();
                assets.retry();
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    );

  function toggleAsset(id: string) {
    setForm((current) => ({
      ...current,
      assetIds: current.assetIds.includes(id)
        ? current.assetIds.filter((item) => item !== id)
        : [...current.assetIds, id],
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateAssignmentInput(form);
    setErrors(validation);
    if (Object.keys(validation).length) {
      toast(Object.values(validation)[0], "error");
      return;
    }
    try {
      const created = saveAssignments(form);
      toast(
        created.length === 1
          ? "Standard assigned to 1 machine"
          : `Standard assigned to ${created.length} machines`,
        "success",
      );
      router.push("/tpm/health-checkups/schedule");
    } catch (cause) {
      toast(
        cause instanceof Error ? cause.message : "Could not save assignment.",
        "error",
      );
    }
  }

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <Link href="/tpm/health-checkups/schedule" className="tpm-eyebrow">
            <ArrowLeft size={14} /> Back to schedule
          </Link>
          <h1>Assign standard</h1>
          <p>
            Choose the standard, the machines that use it, who performs the
            checkup, and when it is due.
          </p>
        </div>
      </header>
      <HealthCheckupTabs />
      {published.length === 0 ? (
        <div className="hc-empty">
          <h2>Publish a standard first</h2>
          <p>Only published standards can be assigned to machines.</p>
          <Link href="/tpm/health-checkups/standards/new" className="tpm-button primary">
            Create standard
          </Link>
        </div>
      ) : (
        <form className="hc-panel" onSubmit={submit}>
          <div className="hc-form-grid">
            <div className="tpm-field">
              <label htmlFor="hc-asn-standard">Standard</label>
              <select
                id="hc-asn-standard"
                value={form.standardId}
                onChange={(event) =>
                  setForm({ ...form, standardId: event.target.value })
                }
                aria-invalid={!!errors.standardId}
              >
                {published.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.machineType})
                  </option>
                ))}
              </select>
              {errors.standardId && (
                <p className="hc-error">{errors.standardId}</p>
              )}
            </div>
            <div className="tpm-field">
              <label htmlFor="hc-asn-frequency">Frequency</label>
              <select
                id="hc-asn-frequency"
                value={form.frequency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    frequency: event.target
                      .value as AssignmentInput["frequency"],
                  })
                }
              >
                {HEALTH_FREQUENCIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="tpm-field">
              <label htmlFor="hc-asn-assignee">Who performs</label>
              <input
                id="hc-asn-assignee"
                value={form.assigneeName}
                onChange={(event) =>
                  setForm({ ...form, assigneeName: event.target.value })
                }
                aria-invalid={!!errors.assigneeName}
                maxLength={200}
              />
              {errors.assigneeName && (
                <p className="hc-error">{errors.assigneeName}</p>
              )}
            </div>
            <div className="tpm-field">
              <label htmlFor="hc-asn-due">Next due</label>
              <input
                id="hc-asn-due"
                type="date"
                value={form.nextDueAt}
                onChange={(event) =>
                  setForm({ ...form, nextDueAt: event.target.value })
                }
                aria-invalid={!!errors.nextDueAt}
              />
              {errors.nextDueAt && (
                <p className="hc-error">{errors.nextDueAt}</p>
              )}
            </div>
            <div className="tpm-field full">
              <label>Machines</label>
              {errors.assetIds && (
                <p className="hc-error">{errors.assetIds}</p>
              )}
              <div className="hc-asset-picker" role="group" aria-label="Machines">
                {machines.length === 0 ? (
                  <p style={{ margin: 0, color: "#697f9a" }}>
                    No registered machines available.
                  </p>
                ) : (
                  machines.map((asset) => (
                    <label key={asset.id}>
                      <input
                        type="checkbox"
                        checked={form.assetIds.includes(asset.id)}
                        onChange={() => toggleAsset(asset.id)}
                      />
                      <span className="hc-asset-picker-text">
                        <strong>{asset.name}</strong>
                        <span className="hc-asset-picker-meta">
                          {asset.code}
                          {asset.location ? ` · ${asset.location}` : ""}
                          {asset.category ? ` · ${asset.category}` : ""}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="hc-bottom-actions">
            <Link href="/tpm/health-checkups/schedule" className="tpm-button">
              Cancel
            </Link>
            <button type="submit" className="tpm-button primary">
              Save assignment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
