"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarFeedback, FieldFrame } from "./CalendarField";
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
import {
  suggestedSelection,
  SUGGESTED_SELECTION_LABELS,
  type SuggestedSelection,
} from "./calendar-selection";
import {
  CalendarAudienceSummary,
  AudienceDescription,
} from "./CalendarAudienceSummary";
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
  const feedback = useContext(CalendarFeedback);
  const suggestionPanel = useRef<HTMLDetailsElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [suggestionKind, setSuggestionKind] =
    useState<SuggestedSelection>("OFFICE");
  const [suggestion, setSuggestion] = useState<{
    kind: SuggestedSelection;
    departmentIds: string[];
    employeeIds: string[];
  } | null>(null);
  const [includeManagers, setIncludeManagers] = useState(false),
    [includeSupervisors, setIncludeSupervisors] = useState(false);
  useEffect(() => {
    if (["audienceDepartments", "audiencePeople"].includes(feedback.active))
      setChoosing(true);
  }, [feedback.active]);
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
  const selectedCount =
    a.kind === "DEPARTMENTS" ? a.departmentIds.length : a.employeeIds.length;
  const matchingDepartments = (directory?.departments ?? []).filter((d) =>
    d.name.toLowerCase().includes(departmentSearch.trim().toLowerCase()),
  );
  const suggestionPool =
    directory && suggestion
      ? suggestedSelection(
          directory,
          suggestion.kind,
          includeManagers,
          includeSupervisors,
        )
      : { departmentIds: [], employeeIds: [] };
  const allMatchingDepartments = [
    ...new Set([...a.departmentIds, ...matchingDepartments.map((d) => d.id)]),
  ];
  const undoButton = previous && (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => {
        onChange(previous);
        setPrevious(null);
        setSuggestion(null);
      }}
    >
      Undo selection change
    </Button>
  );
  const reviewSelected = () => {
    setSearch("");
    setDepartment("");
    setBranch("");
    setSelectedOnly(true);
    setChoosing(true);
  };
  return (
    <FieldFrame field="audience">
      <Card className={styles.settingsCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle>Who uses this calendar?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {readonly ? (
            <CalendarAudienceSummary
              rules={rules}
              token={token}
              allowDirectory={false}
            />
          ) : (
            <>
              <div className={styles.assignmentFields}>
                <label className={`${styles.formField} text-sm`}>
                  <span className="font-medium">Calendar assignment</span>
                  <select
                    id="calendar-assignment-kind"
                    name="calendar-assignment-kind"
                    className={styles.assignmentSelect}
                    disabled={busy}
                    value={a.kind}
                    onChange={(e) => {
                      selection({
                        ...emptyAudience(),
                        kind: e.target.value as CalendarAudience["kind"],
                      });
                      setChoosing(true);
                      setSuggestion(null);
                      setSelectedOnly(false);
                    }}
                  >
                    <option value="UNASSIGNED">
                      Choose separately for each plan
                    </option>
                    <option value="COMPANY">Whole company</option>
                    <option value="DEPARTMENTS">Selected departments</option>
                    <option value="PEOPLE">Selected people</option>
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
                        id="calendar-assignment-label"
                        name="calendar-assignment-label"
                        autoComplete="off"
                        value={a.label}
                        disabled={busy}
                        maxLength={80}
                        placeholder={
                          a.kind === "PEOPLE"
                            ? "e.g. Nairobi site team"
                            : "e.g. Office teams"
                        }
                        onChange={(e) =>
                          onChange({ ...a, label: e.target.value })
                        }
                      />
                    </label>
                  </FieldFrame>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                <AudienceDescription audience={a} />
              </p>
              {a.kind === "PEOPLE" && (
                <p className="text-xs text-muted-foreground">
                  A group name is needed before approval. You can save an
                  unnamed draft.
                </p>
              )}
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
              {directory && (
                <details
                  ref={suggestionPanel}
                  className={styles.selectionSuggestions}
                >
                  <summary>Suggest a selection</summary>
                  <p className="mt-2 text-sm">
                    Start with departments or job titles already recorded in
                    your company. Check the suggestions before using them.
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className={`${styles.formField} text-sm`}>
                      <span>Suggest for</span>
                      <select
                        className={styles.assignmentSelect}
                        value={suggestionKind}
                        disabled={busy}
                        onChange={(e) => {
                          setSuggestionKind(
                            e.target.value as SuggestedSelection,
                          );
                          setSuggestion(null);
                        }}
                      >
                        {Object.entries(SUGGESTED_SELECTION_LABELS).map(
                          ([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setSuggestion({
                          kind: suggestionKind,
                          ...suggestedSelection(
                            directory,
                            suggestionKind,
                            includeManagers,
                            includeSupervisors,
                          ),
                        })
                      }
                    >
                      Show suggestions
                    </Button>
                  </div>
                  {suggestionKind === "LEADERSHIP" && (
                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                      <label>
                        <input
                          type="checkbox"
                          checked={includeManagers}
                          disabled={busy}
                          onChange={(e) => {
                            setIncludeManagers(e.target.checked);
                            setSuggestion(null);
                          }}
                        />{" "}
                        Include managers
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={includeSupervisors}
                          disabled={busy}
                          onChange={(e) => {
                            setIncludeSupervisors(e.target.checked);
                            setSuggestion(null);
                          }}
                        />{" "}
                        Include supervisors
                      </label>
                    </div>
                  )}
                  {suggestion && (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm">
                        {suggestion.kind === "LEADERSHIP"
                          ? "Suggested from titles such as Chief, CEO, Director and Head of Department. Confirm the people you want; this does not create an automatically updated leadership group."
                          : `Suggested from department names for ${SUGGESTED_SELECTION_LABELS[suggestion.kind].toLowerCase()}. Uncheck any that use a different calendar.`}
                      </p>
                      <ul className={styles.selectionList}>
                        {(suggestion.kind === "LEADERSHIP"
                          ? directory.people
                              .filter((p) =>
                                suggestionPool.employeeIds.includes(p.id),
                              )
                              .map((p) => ({
                                id: p.id,
                                name: p.name,
                                detail: [
                                  p.jobTitle,
                                  departments.get(p.departmentId ?? ""),
                                  p.branch,
                                  p.code,
                                ]
                                  .filter(Boolean)
                                  .join(" · "),
                              }))
                          : directory.departments
                              .filter((d) =>
                                suggestionPool.departmentIds.includes(d.id),
                              )
                              .map((d) => ({ ...d, detail: "Department" }))
                        ).map((item) => (
                          <li key={item.id}>
                            <label className={styles.selectionChoice}>
                              <input
                                type="checkbox"
                                disabled={busy}
                                checked={(suggestion.kind === "LEADERSHIP"
                                  ? suggestion.employeeIds
                                  : suggestion.departmentIds
                                ).includes(item.id)}
                                onChange={(e) => {
                                  const key =
                                    suggestion.kind === "LEADERSHIP"
                                      ? "employeeIds"
                                      : "departmentIds";
                                  setSuggestion({
                                    ...suggestion,
                                    [key]: e.target.checked
                                      ? [...suggestion[key], item.id]
                                      : suggestion[key].filter(
                                          (id) => id !== item.id,
                                        ),
                                  });
                                }}
                              />
                              <span>
                                <strong>{item.name}</strong>
                                <small className="block text-muted-foreground">
                                  {item.detail}
                                </small>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm">
                        {suggestion.departmentIds.length +
                          suggestion.employeeIds.length}{" "}
                        selected suggestions. You can add others after using
                        this selection.
                      </p>
                      <Button
                        disabled={
                          busy ||
                          !(
                            suggestion.departmentIds.length +
                            suggestion.employeeIds.length
                          ) ||
                          suggestion.employeeIds.length +
                            suggestion.departmentIds.length >
                            MAX_AUDIENCE_MEMBERS
                        }
                        onClick={() => {
                          selection({
                            kind:
                              suggestion.kind === "LEADERSHIP"
                                ? "PEOPLE"
                                : "DEPARTMENTS",
                            label: SUGGESTED_SELECTION_LABELS[suggestion.kind],
                            departmentIds: suggestion.departmentIds,
                            employeeIds: suggestion.employeeIds,
                          });
                          setChoosing(false);
                          if (suggestionPanel.current)
                            suggestionPanel.current.open = false;
                          setSuggestion(null);
                          setSearch("");
                          setDepartment("");
                          setBranch("");
                          setSelectedOnly(false);
                        }}
                      >
                        Use reviewed selection
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setSuggestion(null)}
                      >
                        Cancel suggestions
                      </Button>
                    </div>
                  )}
                </details>
              )}
              {directory && ["DEPARTMENTS", "PEOPLE"].includes(a.kind) && (
                <FieldFrame
                  field={
                    a.kind === "DEPARTMENTS"
                      ? "audienceDepartments"
                      : "audiencePeople"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">
                      {selectedCount} selected
                    </strong>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-expanded={choosing}
                      onClick={() => setChoosing(!choosing)}
                    >
                      {choosing
                        ? "Done choosing"
                        : selectedCount
                          ? "Edit selection"
                          : a.kind === "DEPARTMENTS"
                            ? "Choose departments"
                            : "Choose people"}
                    </Button>
                    {a.kind === "PEOPLE" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !selectedCount}
                        onClick={reviewSelected}
                      >
                        Review all selected people ({selectedCount})
                      </Button>
                    )}
                    {undoButton}
                  </div>
                  {!choosing && (
                    <div className="mt-3">
                      <SelectionSummary audience={a} directory={directory} />
                    </div>
                  )}
                  {choosing && a.kind === "DEPARTMENTS" && (
                    <div className="mt-3 space-y-3">
                      <label className={`${styles.formField} text-sm`}>
                        <span>Find departments</span>
                        <Input
                          id="calendar-department-search"
                          name="calendar-department-search"
                          autoComplete="off"
                          value={departmentSearch}
                          disabled={busy}
                          onChange={(e) => setDepartmentSearch(e.target.value)}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            busy ||
                            !matchingDepartments.length ||
                            allMatchingDepartments.length > MAX_AUDIENCE_MEMBERS
                          }
                          onClick={() =>
                            selection({
                              ...a,
                              departmentIds: allMatchingDepartments,
                            })
                          }
                        >
                          Select all {matchingDepartments.length} matching
                          departments
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            busy ||
                            !matchingDepartments.some((d) =>
                              a.departmentIds.includes(d.id),
                            )
                          }
                          onClick={() =>
                            selection({
                              ...a,
                              departmentIds: a.departmentIds.filter(
                                (id) =>
                                  !matchingDepartments.some((d) => d.id === id),
                              ),
                            })
                          }
                        >
                          Uncheck matching departments
                        </Button>
                      </div>
                      <ul
                        className={`${styles.selectionList} ${styles.departmentChoices}`}
                      >
                        {matchingDepartments.map((d) => (
                          <li key={d.id}>
                            <label className={styles.selectionChoice}>
                              <input
                                type="checkbox"
                                disabled={busy}
                                checked={a.departmentIds.includes(d.id)}
                                onChange={(e) =>
                                  selection({
                                    ...a,
                                    departmentIds: e.target.checked
                                      ? [...a.departmentIds, d.id]
                                      : a.departmentIds.filter(
                                          (id) => id !== d.id,
                                        ),
                                  })
                                }
                              />
                              <span>{d.name}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      {!matchingDepartments.length && (
                        <p className="text-sm">
                          No departments match. Your selections are kept.
                        </p>
                      )}
                    </div>
                  )}
                  {choosing && a.kind === "PEOPLE" && (
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className={`${styles.formField} text-sm`}>
                          <span>Find people</span>
                          <Input
                            id="calendar-people-search"
                            name="calendar-people-search"
                            autoComplete="off"
                            disabled={busy}
                            value={search}
                            onChange={(e) => {
                              setSearch(e.target.value);
                              setSelectedOnly(false);
                            }}
                            placeholder="Name, job title or employee code"
                          />
                        </label>
                        <label className={`${styles.formField} text-sm`}>
                          <span>Filter department</span>
                          <select
                            className={styles.assignmentSelect}
                            value={department}
                            disabled={busy}
                            onChange={(e) => {
                              setDepartment(e.target.value);
                              setSelectedOnly(false);
                            }}
                          >
                            <option value="">All departments</option>
                            {directory.departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={`${styles.formField} text-sm`}>
                          <span>Filter branch / site</span>
                          <select
                            className={styles.assignmentSelect}
                            value={branch}
                            disabled={busy}
                            onChange={(e) => {
                              setBranch(e.target.value);
                              setSelectedOnly(false);
                            }}
                          >
                            <option value="">All branches / sites</option>
                            {branches.map((b) => (
                              <option key={b}>{b}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span>
                          {selectedOnly
                            ? "Showing all selected people"
                            : `${filtered.length} people match filters`}
                        </span>
                        {selectedOnly && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedOnly(false)}
                          >
                            Show all people
                          </Button>
                        )}
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
                          Uncheck matching people
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Select all includes matching people on every page.
                      </p>
                      {allFiltered.length > MAX_AUDIENCE_MEMBERS && (
                        <p className="text-sm text-destructive">
                          Select up to {MAX_AUDIENCE_MEMBERS} people, or choose
                          departments instead.
                        </p>
                      )}
                      <ul className={styles.selectionList}>
                        {filtered.slice(0, limit).map((p) => (
                          <li key={p.id}>
                            <label className={styles.selectionChoice}>
                              <input
                                type="checkbox"
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
                                      : a.employeeIds.filter(
                                          (id) => id !== p.id,
                                        ),
                                  })
                                }
                              />
                              <span>
                                <strong>{p.name}</strong> ·{" "}
                                {p.code || "No employee code"}
                                <small className="block text-muted-foreground">
                                  {[
                                    p.jobTitle,
                                    departments.get(p.departmentId ?? ""),
                                    p.branch,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Work details not recorded"}
                                  {!p.active && " · Inactive"}
                                </small>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      {!filtered.length && (
                        <p className="text-sm">
                          No people match these filters. Existing selections are
                          retained.
                        </p>
                      )}
                      {filtered.length > limit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLimit((n) => n + 50)}
                        >
                          Show 50 more people
                        </Button>
                      )}
                    </div>
                  )}
                </FieldFrame>
              )}
              {!["DEPARTMENTS", "PEOPLE"].includes(a.kind) && undoButton}
              {directory && missing.length > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 p-3 text-sm"
                >
                  <p>
                    {missing.length} selections are no longer available in this
                    company.
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
              {previewBusy && (
                <p role="status" className="text-sm">
                  Checking who matches this selection…
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
                <div
                  className={`${styles.assignmentSummary} space-y-2 text-sm`}
                >
                  <p>
                    <strong>
                      {preview.matchingActive} active people match this
                      selection.
                    </strong>
                    {preview.inactiveMembers > 0 &&
                      ` ${preview.inactiveMembers} inactive people are not counted.`}
                  </p>
                  <details>
                    <summary>About this count</summary>
                    <p className="mt-2">
                      Includes active employees and employees on probation in
                      current records. Leave does not remove someone from this
                      count. Reload the calendar to check new starters or
                      transfers. A separate calendar for a department or
                      selected person can take priority.
                    </p>
                  </details>
                  {!!(preview.issues.length + preview.conflicts.length) && (
                    <p className="font-medium">
                      Complete before approval — you can still save a draft:
                    </p>
                  )}
                  {preview.issues.map((issue) => (
                    <p key={issue} className="text-destructive">
                      {issue}
                    </p>
                  ))}
                  {preview.conflicts.map((c) => (
                    <p key={c.calendarId} className="text-destructive">
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
            <div className="mt-3 space-y-3">
              <p>
                <strong>Whole company:</strong> covers employees who do not have
                a separate department calendar or a calendar for selected
                people. For example, the company works Monday–Friday, but
                Production has its own calendar that includes Saturday.
              </p>
              <p>
                <strong>Selected departments:</strong> choose Production and
                Maintenance once. New employees in those departments are
                included; employees who move out follow their new department’s
                calendar.
              </p>
              <p>
                <strong>Selected people:</strong> choose particular employees
                across departments, or filter by branch and select everyone
                currently there. The saved list contains those people. New
                starters and replacements must be added to the list.
              </p>
              <p>
                <strong>Choose separately for each plan:</strong> keep a
                calendar available without assigning it to employees now. Its
                name alone does not select people.
              </p>
              <p>
                A calendar for selected people takes priority over their
                department calendar. The department calendar takes priority over
                Whole company. Two calendars at the same level cannot cover the
                same people on overlapping dates.
              </p>
              <p>
                For teams in different countries, copy a calendar and review its
                country, time zone, working days and people. Plans keep the
                approved version selected for them until an authorised person
                changes it.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>
    </FieldFrame>
  );
}

function SelectionSummary({
  audience,
  directory,
}: {
  audience: CalendarAudience;
  directory: CalendarDirectory;
}) {
  const names =
    audience.kind === "DEPARTMENTS"
      ? audience.departmentIds.map(
          (id) =>
            directory.departments.find((d) => d.id === id)?.name ??
            "Department no longer available",
        )
      : audience.employeeIds.map((id) => {
          const p = directory.people.find((p) => p.id === id);
          return p
            ? `${p.name}${p.jobTitle ? ` · ${p.jobTitle}` : ""}${p.code ? ` · ${p.code}` : ""}`
            : "Person no longer available";
        });
  if (!names.length)
    return (
      <p className="text-sm text-muted-foreground">Nothing selected yet.</p>
    );
  return (
    <div className={styles.selectedSummary}>
      <ul>
        {names.slice(0, 6).map((name, i) => (
          <li key={i}>{name}</li>
        ))}
      </ul>
      {names.length > 6 && (
        <details>
          <summary>
            View all {names.length} selected{" "}
            {audience.kind === "DEPARTMENTS" ? "departments" : "people"}
          </summary>
          <ul>
            {names.slice(6).map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
