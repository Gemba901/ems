"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldFrame } from "./CalendarField";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarsApi } from "@/services/leadership-excellence/rules-calendar.service";
import {
  audienceLabel,
  emptyAudience,
  MAX_AUDIENCE_MEMBERS,
} from "./calendar-audience";
import type {
  CalendarAudience,
  CalendarDirectory,
  AudiencePreview,
} from "./calendar-audience.types";
import type { CalendarRules } from "./calendar-model";
import { displayDate } from "./calendar-editor";
import styles from "./rules-calendar.module.css";

export function CalendarAudienceEditor({
  rules,
  calendarId,
  token,
  readonly,
  busy,
  onChange,
}: {
  rules: CalendarRules;
  calendarId?: string;
  token: string;
  readonly: boolean;
  busy: boolean;
  onChange: (value: CalendarAudience) => void;
}) {
  const a = rules.audience ?? emptyAudience();
  const [directory, setDirectory] = useState<CalendarDirectory | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState(""),
    [branch, setBranch] = useState(""),
    [selectedOnly, setSelectedOnly] = useState(false),
    [limit, setLimit] = useState(50);
  const [previous, setPrevious] = useState<CalendarAudience | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewError, setPreviewError] = useState("");
  const seq = useRef(0);
  const previewKey = JSON.stringify([
    a,
    rules.start,
    rules.end,
    calendarId,
    retry,
  ]);
  useEffect(() => {
    if (readonly) return;
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
              : "Could not load assignment choices.",
          );
      });
    return () => controller.abort();
  }, [readonly, token, retry]);
  useEffect(() => {
    const id = ++seq.current;
    if (readonly) return;
    setPreview(null);
    setPreviewError("");
    setPreviewBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void calendarsApi
        .assignmentPreview(token, rules, calendarId, controller.signal)
        .then((p) => {
          if (!controller.signal.aborted && seq.current === id) setPreview(p);
        })
        .catch((e) => {
          if (!controller.signal.aborted && seq.current === id)
            setPreviewError(
              e instanceof Error
                ? e.message
                : "Could not check these assignments.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted && seq.current === id)
            setPreviewBusy(false);
        });
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // Only assignment/date changes affect this check, not unrelated frequency controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, readonly, token]);
  useEffect(() => {
    setLimit(50);
  }, [search, department, branch, selectedOnly]);
  const disabled = readonly || busy;
  const departments = new Map(
    directory?.departments.map((d) => [d.id, d.name]) ?? [],
  );
  const branches = [
    ...new Set(
      directory?.people.map((p) => p.branch).filter((v): v is string => !!v) ??
        [],
    ),
  ].sort();
  const filtered = (directory?.people ?? []).filter(
    (p) =>
      (p.active || a.employeeIds.includes(p.id)) &&
      (!selectedOnly || a.employeeIds.includes(p.id)) &&
      (!department || p.departmentId === department) &&
      (!branch || p.branch === branch) &&
      `${p.name} ${p.code ?? ""} ${p.jobTitle ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const missing =
    a.kind === "PEOPLE"
      ? a.employeeIds.filter(
          (id) => !directory?.people.some((p) => p.id === id),
        )
      : a.departmentIds.filter((id) => !departments.has(id));
  function selection(next: CalendarAudience) {
    setPrevious(a);
    onChange(next);
  }
  const filteredActive = filtered.filter((p) => p.active).map((p) => p.id);
  const allFiltered = [...new Set([...a.employeeIds, ...filteredActive])];
  return (
    <FieldFrame field="audience">
      <Card className={styles.settingsCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle>Who uses this calendar?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {readonly ? (
            <>
              <p className="font-medium">{audienceLabel(a)}</p>
              <p className="text-sm text-muted-foreground">
                {a.kind === "UNASSIGNED"
                  ? "Available for explicit plan selection; no automatic people assignment."
                  : a.kind === "COMPANY"
                    ? "Company default where no more specific approved calendar applies."
                    : a.kind === "DEPARTMENTS"
                      ? `${a.departmentIds.length} recorded department(s). Matching follows current department membership.`
                      : `${a.employeeIds.length} explicitly selected people. Membership does not change automatically when someone joins a branch.`}
              </p>
            </>
          ) : (
            <>
              <div className={styles.assignmentFields}>
                <label className={`${styles.formField} text-sm`}>
                  <span className="font-medium">Calendar assignment</span>
                  <select
                    className="h-9 w-full rounded-lg border border-input bg-background px-2"
                    disabled={busy}
                    value={a.kind}
                    onChange={(e) => {
                      setPrevious(null);
                      onChange({
                        ...emptyAudience(),
                        kind: e.target.value as CalendarAudience["kind"],
                      });
                    }}
                  >
                    <option value="UNASSIGNED">
                      Leave unassigned · choose explicitly in a plan
                    </option>
                    <option value="COMPANY">Company default</option>
                    <option value="DEPARTMENTS">Selected departments</option>
                    <option value="PEOPLE">
                      Named group · Office, Operations or a branch
                    </option>
                  </select>
                </label>
                {a.kind !== "UNASSIGNED" && (
                  <FieldFrame field="audienceLabel">
                    <label className={`${styles.formField} text-sm`}>
                      <span className="font-medium">
                        {a.kind === "PEOPLE"
                          ? "Group name"
                          : "Assignment label (optional)"}
                      </span>
                      <Input
                        value={a.label}
                        disabled={busy}
                        maxLength={80}
                        placeholder={
                          a.kind === "PEOPLE"
                            ? "e.g. Nairobi Operations"
                            : "e.g. Company working calendar"
                        }
                        onChange={(e) =>
                          onChange({ ...a, label: e.target.value })
                        }
                      />
                    </label>
                  </FieldFrame>
                )}
              </div>
              {error && (
                <div role="alert" className="text-sm text-destructive">
                  {error}{" "}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRetry((n) => n + 1)}
                  >
                    Retry assignment choices
                  </Button>
                </div>
              )}
              {!directory && !error && (
                <p role="status" className="text-sm">
                  Loading company departments and people…
                </p>
              )}
              {directory && a.kind === "DEPARTMENTS" && (
                <FieldFrame field="audienceDepartments">
                  <fieldset
                    disabled={busy}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <legend className="mb-2 text-sm">
                      Choose departments · {a.departmentIds.length} selected
                    </legend>
                    {directory.departments.map((d) => (
                      <label
                        key={d.id}
                        className="flex gap-2 rounded-lg border border-border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={a.departmentIds.includes(d.id)}
                          onChange={(e) =>
                            selection({
                              ...a,
                              departmentIds: e.target.checked
                                ? [...a.departmentIds, d.id]
                                : a.departmentIds.filter((id) => id !== d.id),
                            })
                          }
                        />
                        <span>{d.name}</span>
                      </label>
                    ))}
                    {!directory.departments.length && (
                      <p className="text-sm">
                        No recorded departments are available.
                      </p>
                    )}
                  </fieldset>
                </FieldFrame>
              )}
              {directory && a.kind === "PEOPLE" && (
                <FieldFrame field="audiencePeople">
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className={`${styles.formField} text-sm`}>
                        <span>Find people</span>
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Name, job title or employee code"
                        />
                      </label>
                      <label className={`${styles.formField} text-sm`}>
                        <span>Filter department</span>
                        <select
                          className="h-9 w-full rounded-lg border border-input bg-background px-2"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                        >
                          <option value="">All departments</option>
                          {directory.departments.map((d) => (
                            <option value={d.id} key={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={`${styles.formField} text-sm`}>
                        <span>Filter branch / site</span>
                        <select
                          className="h-9 w-full rounded-lg border border-input bg-background px-2"
                          value={branch}
                          onChange={(e) => setBranch(e.target.value)}
                        >
                          <option value="">All branches / sites</option>
                          {branches.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <strong>{a.employeeIds.length} selected</strong>
                      <span>{filtered.length} match filters</span>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedOnly}
                          onChange={(e) => setSelectedOnly(e.target.checked)}
                        />
                        Selected people only
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          busy ||
                          !filteredActive.length ||
                          allFiltered.length > MAX_AUDIENCE_MEMBERS
                        }
                        onClick={() =>
                          selection({ ...a, employeeIds: allFiltered })
                        }
                      >
                        Select all {filteredActive.length} matching active
                        people
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          busy ||
                          !filtered.some((p) => a.employeeIds.includes(p.id))
                        }
                        onClick={() =>
                          selection({
                            ...a,
                            employeeIds: a.employeeIds.filter(
                              (id) => !filtered.some((p) => p.id === id),
                            ),
                          })
                        }
                      >
                        Remove filtered selection
                      </Button>
                    </div>
                    {allFiltered.length > MAX_AUDIENCE_MEMBERS && (
                      <p className="text-sm text-destructive">
                        A group supports up to {MAX_AUDIENCE_MEMBERS} people.
                        Narrow the filters or use department assignment.
                      </p>
                    )}
                    <ul className="max-h-80 space-y-2 overflow-auto rounded-lg border border-border p-3">
                      {filtered.slice(0, limit).map((p) => (
                        <li key={p.id}>
                          <label className="flex items-start gap-3 rounded-md p-2 text-sm hover:bg-accent">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={a.employeeIds.includes(p.id)}
                              disabled={
                                busy ||
                                (!a.employeeIds.includes(p.id) &&
                                  (!p.active ||
                                    a.employeeIds.length >=
                                      MAX_AUDIENCE_MEMBERS))
                              }
                              onChange={(e) =>
                                selection({
                                  ...a,
                                  employeeIds: e.target.checked
                                    ? [...a.employeeIds, p.id]
                                    : a.employeeIds.filter((id) => id !== p.id),
                                })
                              }
                            />
                            <span>
                              <strong>{p.name}</strong> ·{" "}
                              {p.code || "No employee code"}
                              <span className="block text-muted-foreground">
                                {[
                                  p.jobTitle,
                                  departments.get(p.departmentId ?? ""),
                                  p.branch,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Work details not recorded"}
                                {!p.active &&
                                  " · Inactive; not counted in current assignments"}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                      {!filtered.length && (
                        <li className="p-2 text-sm">
                          No people match these filters. Existing selections are
                          retained.
                        </li>
                      )}
                    </ul>
                    {filtered.length > limit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLimit((n) => n + 50)}
                      >
                        Show 50 more people
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Branch filters help you choose people. Membership is the
                      people you select; new starters and transfers do not
                      automatically change this named group.
                    </p>
                  </div>
                </FieldFrame>
              )}
              {directory && missing.length > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 p-3 text-sm"
                >
                  <p>
                    {missing.length} recorded selections are no longer available
                    in this company.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      selection(
                        a.kind === "PEOPLE"
                          ? {
                              ...a,
                              employeeIds: a.employeeIds.filter(
                                (id) => !missing.includes(id),
                              ),
                            }
                          : {
                              ...a,
                              departmentIds: a.departmentIds.filter(
                                (id) => !missing.includes(id),
                              ),
                            },
                      )
                    }
                  >
                    Remove unavailable selections
                  </Button>
                </div>
              )}
              {previous && previous.kind === a.kind && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    onChange({
                      ...a,
                      departmentIds: previous.departmentIds,
                      employeeIds: previous.employeeIds,
                    });
                    setPrevious(null);
                  }}
                >
                  Undo selection change
                </Button>
              )}
              {previewBusy && (
                <p role="status" className="text-sm">
                  Checking assignment coverage…
                </p>
              )}
              {previewError && (
                <p role="alert" className="text-sm text-destructive">
                  {previewError}{" "}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRetry((n) => n + 1)}
                  >
                    Retry assignment check
                  </Button>
                </p>
              )}
              {preview && (
                <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
                  <p>
                    <strong>
                      {preview.matchingActive} active people match this
                      selection.
                    </strong>
                    {preview.inactiveMembers > 0 &&
                      ` ${preview.inactiveMembers} inactive members are not counted.`}
                  </p>
                  <p className="text-muted-foreground">
                    This is draft coverage. Publishing applies the assignment; a
                    more specific calendar may override this one.
                  </p>
                  {preview.issues.map((issue) => (
                    <p key={issue} role="alert" className="text-destructive">
                      {issue}
                    </p>
                  ))}
                  {preview.conflicts.map((c) => (
                    <p
                      key={c.calendarId}
                      role="alert"
                      className="text-destructive"
                    >
                      Overlaps “{c.name}” v{c.version}: {displayDate(c.start)}–
                      {displayDate(c.end)}. {c.message}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          <details
            className={`${styles.calendarNotes} rounded-lg border border-border p-3 text-sm`}
          >
            <summary className="cursor-pointer font-medium">
              How assignments work · learn by example
            </summary>
            <div className="mt-3 space-y-2">
              <p>
                A named group takes precedence over a department assignment,
                then the company default. The most specific matching calendar
                applies even when it says the day is non-working.
              </p>
              <p>
                Office can use Monday–Friday while Operations works Saturdays.
                Put people with the same working week, holidays and time zone
                together. For branches in different countries, copy a calendar
                and set the appropriate country, time zone and members.
              </p>
              <p>
                Two calendars at the same level cannot cover the same people or
                departments on overlapping dates. Revise the existing calendar
                or separate their coverage.
              </p>
              <p>
                Department matching uses current employee records. Named groups
                use explicit membership. These lookups do not reconstruct
                historical postings. Plans already using an approved version
                keep that version until an authorised change.
              </p>
              <p>
                Unassigned calendars remain available for explicit plan
                selection. A name alone does not assign a calendar.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>
    </FieldFrame>
  );
}
