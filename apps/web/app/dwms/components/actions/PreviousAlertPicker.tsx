"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React, { useId, useState } from "react";
import { Info, Loader2, Search } from "lucide-react";
import type { DwmsAlertItem } from "@/services/dwms.service";
import { formatOrganizationDate } from "../../utils/organizationDate";
import DwmsSelectDropdown from "../DwmsSelectDropdown";

function occurrenceTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestRaise(alert: DwmsAlertItem) {
  return Math.max(
    occurrenceTime(alert.createdAt),
    ...(alert.occurrences ?? []).map((item) => occurrenceTime(item.raisedAt)),
  );
}

export function repeatAlertMessage(alert: DwmsAlertItem) {
  const nextCount = alert.raiseCount + 1;
  if (!alert.isAbnormality && nextCount >= 3) {
    return `Raise count: ${alert.raiseCount} → ${nextCount}. Raising again will mark this alert as an abnormality.`;
  }
  return `Raise count: ${alert.raiseCount} → ${nextCount}. ${alert.isAbnormality ? "This alert remains an abnormality." : "A new occurrence will be added to this alert's history."}`;
}

export default function PreviousAlertPicker({
  alerts,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  timeZone,
}: {
  alerts: DwmsAlertItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  timeZone?: string;
}) {
  const searchId = useId();
  const radioName = useId();
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const query = search.trim().toLocaleLowerCase();
  const sorted = [...alerts].sort((a, b) => latestRaise(b) - latestRaise(a));
  const matches = sorted.filter(
    (alert) =>
      (severity === "ALL" || alert.severity === severity) &&
      `${alert.title} ${alert.description}`.toLocaleLowerCase().includes(query),
  );
  const selected = sorted.find((alert) => alert.id === selectedId);
  const selectedOutsideFilter =
    selected && !matches.some((alert) => alert.id === selectedId);
  const visible = selectedOutsideFilter ? [selected, ...matches] : matches;

  function dateLabel(value: string | Date) {
    return (
      formatOrganizationDate(value, timeZone, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) ?? "Date unavailable"
    );
  }

  if (loading)
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading previous alerts…
      </p>
    );
  if (error)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-danger bg-danger-subtle p-4 text-sm text-danger"
      >
        <p>{error}</p>
        <Button
          variant="ghost"
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl border border-danger bg-card px-4 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
        >
          Try again
        </Button>
      </div>
    );
  if (!alerts.length)
    return (
      <div
        role="status"
        className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground"
      >
        <p className="font-semibold text-foreground">
          No previous alerts for this recipient
        </p>
        <p className="mt-1 leading-6">
          Choose New alert to describe the issue.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <label
            htmlFor={searchId}
            className="mb-2 block text-xs font-medium text-muted-foreground"
          >
            Search previous alerts
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title or details"
              className="min-h-11 w-full rounded-xl border border-border bg-card py-3 pl-9 pr-3 text-sm outline-none focus:border-info focus:ring-1 focus:ring-info/20"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Severity</p>
          <DwmsSelectDropdown
            ariaLabel="Filter previous alerts by severity"
            placeholder="All severities"
            value={severity}
            onChange={setSeverity}
            options={[
              { value: "ALL", label: "All severities" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
              { value: "CRITICAL", label: "Critical" },
            ]}
            triggerClassName="min-h-11 rounded-xl border-border bg-card px-3 py-3 text-sm sm:rounded-xl"
          />
        </div>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {matches.length} of {alerts.length} previous alerts · Most recently
        raised first
      </p>
      {selectedOutsideFilter && (
        <p className="text-xs text-info">
          Your selected alert stays visible below, even though it does not match
          these filters.
        </p>
      )}
      {!matches.length && (
        <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          <p>No alerts match your search and severity filter.</p>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setSearch("");
              setSeverity("ALL");
            }}
            className="mt-2 min-h-11 rounded-lg px-2 font-semibold text-info hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
          >
            Clear filters
          </Button>
        </div>
      )}
      <fieldset className="min-w-0 space-y-3">
        <legend className="sr-only">Select the alert to raise again</legend>
        {visible.map((alert) => {
          const isSelected = alert.id === selectedId;
          const occurrences = [...(alert.occurrences ?? [])]
            .sort(
              (a, b) => occurrenceTime(b.raisedAt) - occurrenceTime(a.raisedAt),
            )
            .slice(0, 3);
          const severityClass =
            alert.severity === "CRITICAL"
              ? "bg-danger-subtle text-danger"
              : alert.severity === "HIGH"
                ? "bg-warning-subtle text-warning"
                : "bg-muted text-muted-foreground";
          return (
            <div
              key={alert.id}
              data-previous-alert={alert.id}
              className={`overflow-hidden rounded-2xl border ${isSelected ? "border-info bg-info-subtle/60" : "border-border bg-card"}`}
            >
              <label className="flex min-h-20 cursor-pointer items-start gap-3 p-4">
                <Input
                  type="radio"
                  name={radioName}
                  value={alert.id}
                  checked={isSelected}
                  onChange={() => onSelect(alert.id)}
                  aria-label={alert.title}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                      {alert.title}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${severityClass}`}
                    >
                      {alert.severity.charAt(0) +
                        alert.severity.slice(1).toLowerCase()}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                    Last raised {dateLabel(new Date(latestRaise(alert)))} ·
                    Raised {alert.raiseCount}{" "}
                    {alert.raiseCount === 1 ? "time" : "times"}
                    {alert.isAbnormality ? " · Abnormality" : ""}
                  </span>
                </span>
              </label>
              {isSelected && (
                <div className="px-4 pb-4">
                  <div className="grid gap-4 rounded-xl bg-card p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-foreground">
                        Original details
                      </h4>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                        {alert.description}
                      </p>
                    </div>
                    <div className="min-w-0 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                      <h4 className="text-xs font-semibold text-foreground">
                        Recent raises
                      </h4>
                      <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                        {occurrences.length ? (
                          occurrences.map((occurrence) => (
                            <li key={occurrence.id}>
                              {dateLabel(occurrence.raisedAt)} ·{" "}
                              {occurrence.acknowledgedAt
                                ? "Acknowledged"
                                : "Awaiting acknowledgement"}
                            </li>
                          ))
                        ) : (
                          <li>Occurrence details are unavailable.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  <div
                    className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-xs leading-5 ${!alert.isAbnormality && alert.raiseCount + 1 >= 3 ? "bg-warning-subtle text-warning" : "bg-info-subtle text-info"}`}
                  >
                    <Info
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <p>{repeatAlertMessage(alert)}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
