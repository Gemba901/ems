"use client";
import { useEffect, useState } from "react";
import type {
  CalendarAudience,
  CalendarDirectory,
} from "./calendar-audience.types";
import type { CalendarRules } from "./calendar-model";
import { emptyAudience } from "./calendar-audience";
import { calendarsApi } from "@/services/leadership-excellence/rules-calendar.service";
import { Button } from "@/components/ui/button";
import styles from "./rules-calendar.module.css";

export function AudienceDescription({
  audience: a,
}: {
  audience: CalendarAudience;
}) {
  return (
    <>
      {a.kind === "COMPANY"
        ? "For everyone in the company, except people covered by a separate department or selected-people calendar."
        : a.kind === "DEPARTMENTS"
          ? "Applies to the current employees in these departments, including new starters. You do not need to select each person."
          : a.kind === "PEOPLE"
            ? "Applies to the people you select. New starters and replacements must be added to this list."
            : "No employees are assigned automatically. Choose this calendar for a plan during planning."}
    </>
  );
}

export function CalendarAudienceSummary({
  rules,
  token,
  allowDirectory,
  onChange,
}: {
  rules: CalendarRules;
  token: string;
  allowDirectory: boolean;
  onChange?: () => void;
}) {
  const a = rules.audience ?? emptyAudience();
  const [directory, setDirectory] = useState<CalendarDirectory | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!allowDirectory || a.kind === "UNASSIGNED") return;
    const controller = new AbortController();
    setError("");
    setDirectory(null);
    void calendarsApi
      .assignmentDirectory(token, controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setDirectory(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load the selected departments and people.",
          );
      });
    return () => controller.abort();
  }, [allowDirectory, token, a.kind, retry]);
  const matches = directory?.people.filter(
    (p) =>
      p.active &&
      (a.kind === "COMPANY" ||
        (a.kind === "DEPARTMENTS"
          ? a.departmentIds.includes(p.departmentId ?? "")
          : a.employeeIds.includes(p.id))),
  );
  const names = !directory
    ? []
    : a.kind === "DEPARTMENTS"
      ? a.departmentIds.map(
          (id) =>
            directory.departments.find((d) => d.id === id)?.name ??
            "Department no longer available",
        )
      : a.kind === "PEOPLE"
        ? a.employeeIds.map((id) => {
            const p = directory.people.find((p) => p.id === id);
            return p
              ? [p.name, p.jobTitle, p.code].filter(Boolean).join(" · ")
              : "Person no longer available";
          })
        : [];
  const label = {
    COMPANY: "Whole company",
    DEPARTMENTS: "Selected departments",
    PEOPLE: "Selected people",
    UNASSIGNED: "Choose separately for each plan",
  }[a.kind];
  return (
    <div className={`${styles.assignmentSummary} space-y-2 text-sm`}>
      <strong>
        Who uses this calendar: {a.label ? `${a.label} · ${label}` : label}
      </strong>
      <p>
        <AudienceDescription audience={a} />
      </p>
      {matches && (
        <p>
          <strong>{matches.length} active people match this selection.</strong>{" "}
          This includes probation; leave does not change membership.
        </p>
      )}
      {matches && (
        <p className="text-xs text-muted-foreground">
          Based on current employee records. A more specific calendar may take
          priority.
        </p>
      )}
      {names.length > 0 && (
        <details>
          <summary>
            View {names.length} selected{" "}
            {a.kind === "DEPARTMENTS" ? "departments" : "people"}
          </summary>
          <ul className={styles.selectionList}>
            {names.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </details>
      )}
      {!directory && a.kind === "DEPARTMENTS" && (
        <p>{a.departmentIds.length} departments selected.</p>
      )}
      {!directory && a.kind === "PEOPLE" && (
        <p>{a.employeeIds.length} people selected.</p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry selection summary
          </Button>
        </p>
      )}
      {onChange && (
        <Button variant="link" size="sm" onClick={onChange}>
          Change who uses this calendar
        </Button>
      )}
    </div>
  );
}
