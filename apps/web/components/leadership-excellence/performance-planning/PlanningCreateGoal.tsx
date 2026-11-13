"use client";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type {
  ItemKind,
  PlanKind,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { Button, control, ErrorList, Field, Modal, Status } from "./PlanningUi";

type Plan = PlanningView["documents"][number];
const levels: [PlanKind, string][] = [
  ["COMPANY", "Company objective"],
  ["DEPARTMENT", "Department goal"],
  ["INDIVIDUAL", "Individual goal"],
  ["TEAM", "Team / section goal"],
  ["POSITION", "Position goal"],
];

/** Select an existing scope first. CREATE_PLAN is only used when it has no plan. */
export function PlanningCreateGoal({
  cycle,
  onClose,
  onReady,
  onOpen,
}: {
  cycle: string;
  onClose: () => void;
  onReady: (
    documentId: string,
    kind: ItemKind,
    initial?: Record<string, unknown>,
  ) => void;
  onOpen: (plan: Plan) => void;
}) {
  const { data, run, busy } = usePlanning();
  const management = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT"].includes(
    data.actor.role,
  );
  const allowed = levels.filter(
    ([level]) =>
      management ||
      (data.actor.role === "HOD" && level !== "COMPANY") ||
      (level === "INDIVIDUAL" && !!data.actor.employeeId) ||
      data.documents.some(
        (p) => p.cycle === cycle && p.kind === level && p.permissions.canEdit,
      ),
  );
  const [kind, setKind] = useState<PlanKind>(allowed[0]?.[0] || "INDIVIDUAL");
  const [scopeId, setScopeId] = useState(
    data.actor.role === "EMPLOYEE" ? data.actor.employeeId : "",
  );
  const [error, setError] = useState("");
  const scopes = (
    kind === "DEPARTMENT"
      ? data.references.departments.map((d) => ({ ...d, departmentId: d.id }))
      : kind === "TEAM"
        ? data.references.teams
        : kind === "POSITION"
          ? data.references.positions || []
          : data.references.people.map((p) => ({
              ...p,
              name: `${p.name} · ${p.position}`,
            }))
  ).filter(
    (scope) =>
      management ||
      (data.actor.role === "HOD" &&
        scope.departmentId === data.actor.departmentId) ||
      (kind === "INDIVIDUAL" && scope.id === data.actor.employeeId) ||
      data.documents.some(
        (p) =>
          p.cycle === cycle &&
          p.kind === kind &&
          p.scopeId === scope.id &&
          p.permissions.canEdit,
      ),
  );
  const existing = data.documents.find(
    (p) =>
      p.cycle === cycle &&
      p.kind === kind &&
      (kind === "COMPANY" || p.scopeId === scopeId),
  );
  const scope = scopes.find((s) => s.id === scopeId);
  const locked = existing && !existing.permissions.canEdit;

  async function continueToEditor() {
    if (busy || locked || (kind !== "COMPANY" && !scope)) return;
    setError("");
    try {
      const id =
        existing?.id ||
        (await run("CREATE_PLAN", {
          kind,
          cycle,
          scopeId: kind === "COMPANY" ? "" : scopeId,
          title:
            kind === "COMPANY"
              ? `Company plan · ${planningPeriodLabel(cycle)}`
              : `${scope!.name} · ${planningPeriodLabel(cycle)}`,
        }));
      onReady(id, kind === "COMPANY" ? "objective" : "goal");
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open the draft. Please try again.",
      );
    }
  }

  return (
    <Modal title="Create an objective or goal" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void continueToEditor();
        }}
      >
        <p className="text-sm text-slate-500">
          Planning period {planningPeriodLabel(cycle)}. Choose the level and
          responsibility. Your record will appear in the shared register when
          saved.
        </p>
        <ErrorList error={error} />
        <Field label="Planning level">
          <select
            className={control}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as PlanKind);
              setScopeId(
                data.actor.role === "EMPLOYEE" ? data.actor.employeeId : "",
              );
              setError("");
            }}
          >
            {allowed.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {kind !== "COMPANY" && (
          <Field
            label={
              kind === "DEPARTMENT"
                ? "Department"
                : kind === "INDIVIDUAL"
                  ? "Employee"
                  : kind === "TEAM"
                    ? "EMS team / section"
                    : "EMS position"
            }
          >
            <select
              className={control}
              value={scopeId}
              disabled={!scopes.length}
              onChange={(event) => {
                setScopeId(event.target.value);
                setError("");
              }}
            >
              <option value="">
                {scopes.length ? "Choose…" : "No EMS records available"}
              </option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {existing && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <strong>{existing.data.title || existing.code}</strong>
              <Status status={existing.status} />
            </div>
            <p className="text-slate-500">
              {locked
                ? "This plan is locked. Open it to review its approved version or request a dated revision."
                : "This record will use the existing plan for this scope and period."}
            </p>
          </div>
        )}
        <p className="text-xs leading-5 text-slate-500">
          Save an incomplete draft at any time. Company objectives include their
          own measure and target. Department and individual goals link to an
          approved objective or goal before finalising.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {locked ? (
            <Button
              type="button"
              onClick={() => {
                onOpen(existing);
                onClose();
              }}
            >
              Open plan <ArrowRight size={15} />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={
                busy || !allowed.length || (kind !== "COMPANY" && !scope)
              }
            >
              Continue <ArrowRight size={15} />
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
