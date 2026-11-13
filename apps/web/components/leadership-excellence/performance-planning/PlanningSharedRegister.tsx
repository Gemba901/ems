"use client";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import { objectiveAlignmentLabels } from "@/services/leadership-excellence/performance-planning/measurable-objective";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Eye,
  Link2,
  Pencil,
  Plus,
  Search,
  Target,
} from "lucide-react";
import type {
  Goal,
  ItemKind,
  PlanningDocument,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";
import {
  filterSharedRegisterRows,
  registerLevelLabels,
  registerOwner,
  registerValue,
  sharedRegisterRows,
  type RegisterFilters,
  type RegisterLevel,
  type RegisterPlan,
  type SharedRegisterRow,
} from "@/services/leadership-excellence/performance-planning/shared-register";
import { Button, Empty, Modal, Status } from "./PlanningUi";

type Edit = {
  document: PlanningDocument;
  kind: ItemKind;
  initial?: Record<string, unknown>;
};

export type PlanningSharedRegisterProps = {
  data: PlanningView;
  cycle: string;
  edit: (value: Edit) => void;
  onOpen: (document: RegisterPlan) => void;
  onCreate?: () => void;
  onPlanContributions?: (goal: Goal, document: RegisterPlan) => void;
  savedFocus?: { documentId: string; itemId: string } | null;
};

const noFilters: RegisterFilters = { search: "", level: "", status: "" };
const filterControl =
  "min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

function dateLabel(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6">{children}</dd>
    </div>
  );
}

function RowContext({ row }: { row: SharedRegisterRow }) {
  if (row.kind === "objective")
    return <span>Objective · No linked goal yet</span>;
  return (
    <>
      {row.objectiveTitle ? (
        <span>Objective: {row.objectiveTitle}</span>
      ) : row.level === "COMPANY" ? (
        <span>Objective not selected</span>
      ) : null}
      {row.parentTitle ? (
        <span className="mt-1 block">Linked to: {row.parentTitle}</span>
      ) : row.level !== "COMPANY" ? (
        <span>
          {row.goal.ongoingReason
            ? "Essential ongoing responsibility"
            : "Parent goal not selected"}
        </span>
      ) : null}
    </>
  );
}

/** One filterable view of existing plan records; edits keep their original IDs. */
export function PlanningSharedRegister({
  data,
  cycle,
  edit,
  onOpen,
  onCreate,
  onPlanContributions,
  savedFocus,
}: PlanningSharedRegisterProps) {
  const focusKey = savedFocus
    ? `${savedFocus.documentId}/${savedFocus.itemId}`
    : "";
  const contextKey = `${cycle}/${focusKey}`;
  const [filterState, setFilterState] = useState({
    contextKey,
    value: noFilters,
  });
  const filters =
    filterState.contextKey === contextKey ? filterState.value : noFilters;
  const [selectedKey, setSelectedKey] = useState("");
  const registerRef = useRef<HTMLDivElement>(null);
  const rows = sharedRegisterRows(data, cycle);
  const visibleRows = filterSharedRegisterRows(rows, filters);
  const selected = rows.find((row) => row.key === selectedKey);
  const highlighted = (row: SharedRegisterRow) =>
    row.document.id === savedFocus?.documentId &&
    row.itemId === savedFocus.itemId;
  const changeFilters = (next: Partial<RegisterFilters>) =>
    setFilterState({ contextKey, value: { ...filters, ...next } });
  const clearFilters = () => setFilterState({ contextKey, value: noFilters });
  const goalCount = rows.filter((row) => row.kind === "goal").length;
  const objectiveCount = rows.length - goalCount;

  useEffect(() => {
    if (!focusKey) return;
    // The same saved record may be outside the old filter. Defaults above
    // reveal it before focusing the visible desktop row or mobile card.
    const target = Array.from(
      registerRef.current?.querySelectorAll<HTMLElement>(
        '[data-saved-record="true"]',
      ) || [],
    ).find((element) => element.getClientRects().length > 0);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    target?.focus({ preventScroll: true });
  }, [focusKey]);

  const editRow = (row: SharedRegisterRow) => {
    if (!row.document.permissions.canEdit || row.document.status !== "DRAFT")
      return;
    setSelectedKey("");
    edit({
      document: row.document,
      kind: row.kind,
      initial: { ...(row.kind === "goal" ? row.goal : row.objective) },
    });
  };
  const openPlan = (row: SharedRegisterRow) => {
    setSelectedKey("");
    onOpen(row.document);
  };
  const addLinkedGoal = (row: SharedRegisterRow) => {
    if (
      !row.objective ||
      !row.document.permissions.canEdit ||
      row.document.status !== "DRAFT"
    )
      return;
    setSelectedKey("");
    edit({
      document: row.document,
      kind: "goal",
      initial: {
        objectiveId: row.objective.id,
        ownerId: row.objective.ownerId,
        startDate: row.objective.startDate,
        endDate: row.objective.endDate,
      },
    });
  };

  return (
    <div className="min-w-0 space-y-4" ref={registerRef}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Shared goal register
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Company direction and linked contributions for{" "}
            {planningPeriodLabel(cycle)}. Open a goal to see its details or
            continue working on its plan.
          </p>
        </div>
        {onCreate && (
          <Button onClick={onCreate}>
            <Plus size={16} /> Create goal
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="relative min-w-0 sm:col-span-2 lg:col-span-1">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 text-slate-500"
            />
            <input
              aria-label="Search goal register"
              className={`${filterControl} w-full pl-9`}
              value={filters.search}
              placeholder="Search goals, objectives, owner or department…"
              onChange={(event) =>
                changeFilters({ search: event.target.value })
              }
            />
          </label>
          <select
            aria-label="Goal level"
            className={filterControl}
            value={filters.level}
            onChange={(event) =>
              changeFilters({ level: event.target.value as RegisterLevel | "" })
            }
          >
            <option value="">All levels</option>
            {Object.entries(registerLevelLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Goal status"
            className={filterControl}
            value={filters.status}
            onChange={(event) =>
              changeFilters({
                status: event.target.value as RegisterFilters["status"],
              })
            }
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_REVIEW">Under review</option>
            <option value="APPROVED">Approved</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p aria-live="polite">
            {visibleRows.length} of {rows.length} records · {goalCount}{" "}
            {goalCount === 1 ? "goal" : "goals"}
            {objectiveCount > 0 &&
              ` · ${objectiveCount} ${objectiveCount === 1 ? "objective" : "objectives"} awaiting a first goal`}
          </p>
          {(filters.search || filters.level || filters.status) && (
            <button
              type="button"
              className="rounded font-medium text-indigo-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-indigo-500"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {!rows.length ? (
        <Empty title="No goals for this planning period yet">
          {onCreate
            ? "Create a goal to start. You can save an incomplete draft and return to it here."
            : "Goals appear here when a plan is shared with you. Choose another planning period or contact your plan owner."}
        </Empty>
      ) : !visibleRows.length ? (
        <Empty
          title="No goals match these filters"
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        >
          Try another name, level or status.
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table
              className="w-full text-left text-sm text-slate-700"
              aria-label="Goal register"
            >
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Goal / objective
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Level & scope
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Owner
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Target / deadline
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr
                    key={row.key}
                    tabIndex={highlighted(row) ? -1 : undefined}
                    data-saved-record={highlighted(row) || undefined}
                    className={
                      highlighted(row)
                        ? "bg-emerald-50/70"
                        : "hover:bg-slate-50"
                    }
                  >
                    <td className="min-w-[250px] max-w-md px-4 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => setSelectedKey(row.key)}
                        className="rounded text-left font-semibold leading-6 text-slate-900 hover:text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500"
                      >
                        {row.title}
                      </button>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.code}
                        {highlighted(row) && (
                          <span className="ml-2 font-medium text-emerald-700">
                            Saved
                          </span>
                        )}
                      </p>
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        <RowContext row={row} />
                      </div>
                    </td>
                    <td className="max-w-48 px-4 py-4 align-top">
                      <p className="font-medium">
                        {registerLevelLabels[row.level]}
                      </p>
                      {row.level !== "COMPANY" && (
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {row.scopeLabel}
                        </p>
                      )}
                    </td>
                    <td className="max-w-40 px-4 py-4 align-top break-words">
                      {row.ownerLabel}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium">
                        {row.kind === "goal"
                          ? registerValue(row.goal.target, row.goal.unit)
                          : "No linked goal yet"}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
                        {dateLabel(row.deadline)}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Status status={row.document.status} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedKey(row.key)}
                        aria-label={`View ${row.title}`}
                      >
                        <Eye size={16} />
                        <span className="sr-only">View</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden" aria-label="Goal register cards">
            {visibleRows.map((row) => (
              <article
                key={row.key}
                tabIndex={highlighted(row) ? -1 : undefined}
                data-saved-record={highlighted(row) || undefined}
                className={`min-w-0 rounded-xl border p-4 shadow-sm ${highlighted(row) ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    {registerLevelLabels[row.level]}
                    {row.level !== "COMPANY" && ` · ${row.scopeLabel}`}
                  </span>
                  <Status status={row.document.status} />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedKey(row.key)}
                  className="mt-3 block w-full break-words rounded text-left font-semibold leading-6 text-slate-900 hover:text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  {row.title}
                </button>
                <p className="mt-1 break-words text-xs text-slate-500">
                  {row.code}
                  {highlighted(row) && (
                    <span className="ml-2 font-medium text-emerald-700">
                      Saved
                    </span>
                  )}
                </p>
                <div className="mt-2 break-words text-xs leading-5 text-slate-500">
                  <RowContext row={row} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                  <Detail label="Owner">{row.ownerLabel}</Detail>
                  <Detail label="Target">
                    {row.kind === "goal"
                      ? registerValue(row.goal.target, row.goal.unit)
                      : "No linked goal yet"}
                  </Detail>
                  <Detail label="Deadline">{dateLabel(row.deadline)}</Detail>
                </dl>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => setSelectedKey(row.key)}
                >
                  View details <ArrowRight size={14} />
                </Button>
              </article>
            ))}
          </div>
        </>
      )}

      {selected && (
        <Modal
          title={
            selected.kind === "goal" ? "Goal details" : "Objective details"
          }
          description={`${selected.code} · ${registerLevelLabels[selected.level]} · ${selected.scopeLabel} · ${planningPeriodLabel(cycle)}`}
          onClose={() => setSelectedKey("")}
          wide
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => openPlan(selected)}>
                Open plan <ArrowRight size={14} />
              </Button>
              {selected.document.permissions.canEdit &&
                selected.document.status === "DRAFT" && (
                  <Button onClick={() => editRow(selected)}>
                    <Pencil size={14} /> Edit {selected.kind}
                  </Button>
                )}
            </div>
          }
        >
          <div className="space-y-5">
            <div>
              <Status status={selected.document.status} />
              <h3 className="mt-3 break-words text-xl font-semibold text-slate-900">
                {selected.title}
              </h3>
            </div>
            {selected.objective && (
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500">
                    {selected.kind === "goal"
                      ? "Linked objective"
                      : "Company direction"}
                  </p>
                  {selected.kind === "goal" &&
                    selected.document.permissions.canEdit &&
                    selected.document.status === "DRAFT" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedKey("");
                            edit({
                              document: selected.document,
                              kind: "objective",
                              initial: { ...selected.objective },
                            });
                          }}
                        >
                          <Pencil size={14} /> Edit objective
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addLinkedGoal(selected)}
                        >
                          <Plus size={14} /> Add linked goal
                        </Button>
                      </div>
                    )}
                </div>
                {selected.kind === "goal" && (
                  <p className="mt-1 font-semibold text-slate-900">
                    {selected.objective.title || "Untitled objective"}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                  {selected.objective.meaning || "Meaning not added yet."}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {selected.objective.pillar || "Pillar not selected"} ·{" "}
                  {objectiveAlignmentLabels(selected.objective).join(", ") ||
                    "Alignment not selected"}
                </p>
              </section>
            )}
            {selected.parentTitle && selected.kind === "goal" && (
              <div className="flex gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <Link2 size={16} className="mt-1 shrink-0 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">
                    Approved parent goal · Version{" "}
                    {selected.goal.parent?.version}
                  </p>
                  <p className="mt-1 break-words">{selected.parentTitle}</p>
                  {selected.objectiveTitle && (
                    <p className="mt-2 text-xs text-slate-500">
                      Company objective: {selected.objectiveTitle}
                    </p>
                  )}
                </div>
              </div>
            )}
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Owner">{selected.ownerLabel}</Detail>
              <Detail label="Planning period">
                {planningPeriodLabel(cycle)}
              </Detail>
              <Detail label="Deadline">{dateLabel(selected.deadline)}</Detail>
              {selected.kind === "goal" && (
                <>
                  <Detail label="Measure">
                    {selected.goal.measure || "Not set"}
                  </Detail>
                  <Detail label="Baseline">
                    {registerValue(selected.goal.baseline, selected.goal.unit)}
                  </Detail>
                  <Detail label="Target">
                    {registerValue(selected.goal.target, selected.goal.unit)}
                  </Detail>
                  <Detail label="Start date">
                    {dateLabel(selected.goal.startDate)}
                  </Detail>
                  {selected.level === "COMPANY" && (
                    <Detail label="Contributing departments">
                      {selected.goal.departmentIds
                        .map(
                          (id) =>
                            data.references.departments.find(
                              (item) => item.id === id,
                            )?.name || "Department unavailable",
                        )
                        .join(", ") || "Not selected"}
                    </Detail>
                  )}
                </>
              )}
            </dl>
            {selected.kind === "objective" ? (
              <section className="rounded-lg border border-dashed border-slate-200 p-4">
                <p className="text-sm text-slate-500">
                  No linked goals yet. Add a measurable goal under this
                  objective when ready.
                </p>
                {selected.document.permissions.canEdit &&
                  selected.document.status === "DRAFT" && (
                    <Button
                      className="mt-3"
                      onClick={() => addLinkedGoal(selected)}
                    >
                      <Plus size={14} /> Add first goal
                    </Button>
                  )}
              </section>
            ) : (
              <>
                {selected.goal.baseline == null &&
                  selected.goal.baselineReason && (
                    <p className="text-sm text-slate-500">
                      Baseline not available: {selected.goal.baselineReason}
                    </p>
                  )}
                {(selected.goal.approach || selected.goal.ongoingReason) && (
                  <section className="border-t border-slate-200 pt-4">
                    <h4 className="text-sm font-semibold">
                      How we intend to achieve it
                    </h4>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-500">
                      {selected.goal.approach || selected.goal.ongoingReason}
                    </p>
                  </section>
                )}
                <DeliverySummary data={data} row={selected} />
                {selected.level === "COMPANY" &&
                  selected.document.status === "APPROVED" &&
                  onPlanContributions && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedKey("");
                        onPlanContributions(selected.goal, selected.document);
                      }}
                    >
                      Plan contributions <ArrowRight size={14} />
                    </Button>
                  )}
                <p className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
                  Company achievement comes from its own verified measures.
                  Linked contributions do not replace the company result.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function DeliverySummary({
  data,
  row,
}: {
  data: PlanningView;
  row: SharedRegisterRow & { kind: "goal" };
}) {
  const assignments = row.document.data.assignments.filter(
    (item) => item.goalId === row.goal.id,
  );
  const actions = row.document.data.actions.filter(
    (item) => item.goalId === row.goal.id,
  );
  const linkedActions =
    row.document.data.actionLinks?.filter(
      (item) => item.goalId === row.goal.id,
    ) || [];
  const contributions = sharedRegisterRows(data, row.document.cycle).filter(
    (item) =>
      item.kind === "goal" &&
      item.goal.parent?.documentId === row.document.id &&
      item.goal.parent.goalId === row.goal.id,
  );
  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-slate-200 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Target size={15} /> KPI assignments ({assignments.length})
          </h4>
          {assignments.length ? (
            <ul className="mt-3 space-y-3">
              {assignments.map((item) => {
                const definition = data.definitions.find(
                  (definition) => definition.id === item.definitionId,
                );
                return (
                  <li key={item.id} className="break-words text-sm">
                    <p className="font-medium">
                      {definition?.name || "KPI not selected"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.targetMode === "SAME"
                        ? `Target: ${registerValue(item.target, definition?.unit)}`
                        : "Targets set by reporting period"}{" "}
                      · {registerOwner(data, item.ownerId || row.goal.ownerId)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No KPIs assigned yet.</p>
          )}
        </section>
        <section className="min-w-0 rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold">
            Delivery actions ({actions.length + linkedActions.length})
          </h4>
          {actions.length || linkedActions.length ? (
            <ul className="mt-3 space-y-3">
              {actions.map((item) => (
                <li key={item.id} className="break-words text-sm">
                  <p className="font-medium">
                    {item.title || "Untitled action"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {registerOwner(data, item.ownerId)} · Due{" "}
                    {dateLabel(item.dueDate)}
                  </p>
                </li>
              ))}
              {linkedActions.map((link) => {
                const action = data.sharedActions.find(
                  (item) =>
                    item.documentId === link.documentId &&
                    item.version === link.version &&
                    item.action.id === link.actionId,
                )?.action;
                return (
                  <li key={link.id} className="break-words text-sm">
                    <p className="font-medium">
                      {action?.title || "Linked department action"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Existing action · Version {link.version}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No delivery actions yet.
            </p>
          )}
        </section>
      </div>
      {contributions.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold">
            Linked contributions ({contributions.length})
          </h4>
          <ul className="mt-3 space-y-2">
            {contributions.map((item) => (
              <li
                key={item.key}
                className="rounded-lg border border-slate-200 p-3 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="break-words font-medium">{item.title}</p>
                  <Status status={item.document.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.scopeLabel} · {item.ownerLabel}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
