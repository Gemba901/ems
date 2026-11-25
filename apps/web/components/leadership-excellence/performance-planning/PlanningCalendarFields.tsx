"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { calendarDateLabel } from "@/services/leadership-excellence/calendar-display";
import {
  PerformancePlanningService,
  type PlanningCalendar,
  type PlanningCalendarContext,
  type PlanningCalendarContextResult,
  type PlanningPerson,
  type TargetPeriod,
} from "@/services/leadership-excellence/performance-planning.service";
import {
  calendarDateIssue,
  calendarFrequencyChoices,
  calendarIdentity,
  planningFrequencies,
} from "@/services/leadership-excellence/performance-planning/calendar-options";
import { Button, control, Field } from "./PlanningUi";

export function PlanningCalendarFields({
  calendar,
  context,
  onChange,
  people,
  values,
  onResponsibility,
  disabled = false,
  clearsTargets = false,
}: {
  calendar?: PlanningCalendar;
  context: PlanningCalendarContext;
  onChange?: (calendar: PlanningCalendar) => void;
  people: PlanningPerson[];
  values?: Record<string, unknown>;
  onResponsibility?: (field: string, personId: string) => void;
  disabled?: boolean;
  clearsTargets?: boolean;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const [response, setResponse] = useState<{
    key: string;
    data: PlanningCalendarContextResult;
  }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const query = JSON.stringify({
    ...context,
    ...(calendar?.source === "AREA_02"
      ? { calendarId: calendar.id, calendarVersion: calendar.version }
      : {}),
  });
  const ready =
    !!context.documentId ||
    context.kind === "COMPANY" ||
    context.kind === "SWOT" ||
    (context.kind === "INDIVIDUAL"
      ? !!context.employeeId
      : !!context.departmentId);
  useEffect(() => {
    if (!token || !ready) return;
    const controller = new AbortController();
    void PerformancePlanningService.calendarContext(
      token,
      JSON.parse(query),
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setResponse({ key: query, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setFailure({
            key: query,
            message:
              error instanceof Error
                ? error.message
                : "Could not load approved calendars.",
          });
      });
    return () => controller.abort();
  }, [query, ready, token]);
  const result = response?.key === query ? response.data : undefined;
  const error = failure?.key === query ? failure.message : "";
  const options = (result?.calendars || []).filter(
    (item) => item.source === "AREA_02" && item.approved,
  );
  const currentKey = calendarIdentity(calendar);
  const retained =
    !!calendar &&
    !options.some((item) => calendarIdentity(item) === currentKey);
  const datesIssue = calendarDateIssue(
    calendar,
    context.startDate || "",
    context.endDate || "",
  );
  const labels: Record<string, string> = {
    ownerId: "Accountable owner",
    providerId: "Data provider",
    verifierId: "Independent verifier",
    approverId: "Authorised approver",
  };
  const suggestions = result?.responsibilityDefaults;
  return (
    <section
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
      data-planning-calendar
    >
      <Field
        label="Reporting calendar"
        hint={
          clearsTargets
            ? "Choosing a different approved version clears generated period targets. Generate and review them again before saving."
            : "Choose the approved calendar and version for this plan. Existing approved versions keep their saved calendar."
        }
      >
        <select
          className={control}
          value={currentKey}
          disabled={disabled || !onChange || !ready}
          onChange={(event) => {
            const selected = options.find(
              (item) => calendarIdentity(item) === event.target.value,
            );
            if (selected && calendarIdentity(selected) !== currentKey)
              onChange?.(structuredClone(selected));
          }}
        >
          <option value="">
            {ready
              ? "Select an approved calendar"
              : "Choose the plan scope first"}
          </option>
          {retained && (
            <option value={currentKey}>
              {calendar.name ||
                (calendar.source === "AREA_02"
                  ? "Saved approved calendar"
                  : "Saved Work Settings calendar")}{" "}
              · v{calendar.version}
            </option>
          )}
          {options.map((item) => (
            <option key={calendarIdentity(item)} value={calendarIdentity(item)}>
              {item.name || "Approved calendar"} · v{item.version} ·{" "}
              {calendarDateLabel(item.startDate)} to {calendarDateLabel(item.endDate)}
            </option>
          ))}
        </select>
      </Field>
      {calendar ? (
        <div className="space-y-1 text-xs leading-5 text-slate-600">
          <p>
            {calendar.source === "AREA_02"
              ? "Approved Performance Rules calendar"
              : "Saved organisation Work Settings"}{" "}
            · version {calendar.version} · {calendar.timeZone}
          </p>
          <p>
            {calendarDateLabel(calendar.startDate)} to {calendarDateLabel(calendar.endDate)}
          </p>
          {calendar.source === "AREA_02" && (
            <p>
              Available reporting frequencies:{" "}
              {calendarFrequencyChoices(calendar)
                .map(([, label]) => label)
                .join(", ") || "None"}
              . Periods and deadlines use this approved version.
            </p>
          )}
          {calendar.area02 && (
            <p>
              Assigned to: {calendar.area02.audience.label}. Approved{" "}
              {calendarDateLabel(calendar.area02.approvedAt.slice(0, 10))}.
            </p>
          )}
          {!!calendar.area02?.reviews.length && (
            <details>
              <summary className="cursor-pointer">
                Management review deadlines ·{" "}
                {
                  planningFrequencies.find(
                    ([frequency]) =>
                      frequency === calendar.area02?.reviewFrequency,
                  )?.[1]
                }
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                {calendar.area02.reviews.map((review) => (
                  <li key={`${review.start}/${review.end}`}>
                    {calendarDateLabel(review.start)} to {calendarDateLabel(review.end)}:{" "}
                    {review.completeBy
                      ? `complete by ${calendarDateLabel(review.completeBy)}`
                      : "not scheduled"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <p className="text-xs leading-5 text-slate-600">
          Select a calendar explicitly before approval. Opening this form does
          not replace a saved reporting schedule.
        </p>
      )}
      {ready && !result && !error && (
        <p className="text-xs text-slate-500" role="status">
          Loading calendars for this plan…
        </p>
      )}
      {error && (
        <p className="text-xs text-amber-800" role="alert">
          {error} The saved calendar remains selected.
        </p>
      )}
      {result?.calendarResolution?.message && (
        <p className="text-xs text-slate-600">
          {result.calendarResolution.message}
        </p>
      )}
      {result && !options.length && (
        <p className="text-xs text-slate-600">
          No approved calendars are available for this scope and period. Check
          the calendar’s assignment and dates in Performance Rules.
        </p>
      )}
      {datesIssue && (
        <p className="text-xs text-amber-800" role="alert">
          {datesIssue}
        </p>
      )}
      {calendar?.source === "AREA_02" &&
        suggestions &&
        values &&
        onResponsibility && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <p className="text-xs font-medium text-slate-700">
              Calendar responsibility suggestions
            </p>
            {Object.entries(labels)
              .filter(([field]) => field in values)
              .map(([field, label]) => {
                const id =
                  suggestions[
                    field as
                      | "ownerId"
                      | "providerId"
                      | "verifierId"
                      | "approverId"
                  ];
                const person = people.find((item) => item.id === id);
                if (!person) return null;
                return (
                  <div
                    key={field}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span>
                      {label}: {person.name} · {person.position}
                    </span>
                    {values[field] === person.id ? (
                      <span className="text-slate-500">Selected</span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onResponsibility(field, person.id)}
                      >
                        Use {person.name}
                      </Button>
                    )}
                  </div>
                );
              })}
            {!!suggestions.unresolved?.length && (
              <p className="text-xs text-slate-500">
                Select the responsible people in the plan where a calendar role
                has no confirmed person.
              </p>
            )}
          </div>
        )}
    </section>
  );
}

/** Deadline dates and local times come directly from the approved calendar. */
export function PlanningPeriodDeadlines({ period }: { period: TargetPeriod }) {
  if (period.scheduled === false)
    return <span className="block text-slate-500">Not scheduled</span>;
  return (
    <>
      {period.submissionDate && (
        <span className="block text-slate-500">
          Submit by {calendarDateLabel(period.submissionDate)}
          {period.submissionTime ? ` at ${period.submissionTime}` : ""}
          {period.submissionTimeZone ? ` (${period.submissionTimeZone})` : ""}
        </span>
      )}
      {period.verificationDate && (
        <span className="block text-slate-500">
          Verify by {calendarDateLabel(period.verificationDate)}
        </span>
      )}
      {period.reviewDate && (
        <span className="block text-slate-500">
          Review by {calendarDateLabel(period.reviewDate)}
        </span>
      )}
      {period.verificationPendingSubmission && (
        <span className="block text-slate-500">
          Verification deadline starts after submission.
        </span>
      )}
      {period.partial && (
        <span className="block text-slate-500">Partial reporting period</span>
      )}
    </>
  );
}
