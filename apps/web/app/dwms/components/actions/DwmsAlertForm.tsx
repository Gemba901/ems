"use client";

import React, { useEffect, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAlertField,
  type DwmsAlertItem,
  type DwmsAlertTargetTask,
  type DwmsAlertTargetType,
  type DwmsDepartmentOption,
  type DwmsEmployeeOption,
} from "@/services/dwms.service";
import DwmsSelectDropdown from "../DwmsSelectDropdown";

type DwmsAlertFormProps = {
  onCreated: () => void;
  onCancel: () => void;
};

type AlertCreationMode = "" | "NEW" | "PREVIOUS";

const ALERT_TIPS: Record<
  DwmsAlertField,
  { title: string; tips: string[]; example: string }
> = {
  general: {
    title: "How to raise a useful alert",
    tips: [
      "State what happened, where it happened, and who is affected.",
      "Use severity for operational impact, not personal urgency.",
      "Select the target that owns the follow-up action.",
      "Add enough detail so the resolver can start without clarification.",
    ],
    example:
      "Example: Packing line 2 stopped for 18 minutes due to motor overload. Production target may be missed unless maintenance checks the conveyor before next batch.",
  },
  severity: {
    title: "Choosing severity",
    tips: [
      "Critical means safety, production stoppage, or major compliance risk.",
      "High means meaningful business impact that needs quick attention.",
      "Medium fits local issues with limited impact.",
    ],
    example:
      "Critical: line stopped. High: repeated customer dispatch delay. Medium: data mismatch needing correction.",
  },
  title: {
    title: "Writing alert title",
    tips: [
      "Keep it short and specific.",
      "Mention the asset, area, process, or document involved.",
      "Avoid vague titles like Issue, Problem, or Alert.",
    ],
    example:
      "Good: Compressor pressure drop in Utility Area. Avoid: Machine issue.",
  },
  description: {
    title: "Writing alert details",
    tips: [
      "Describe the observed abnormality and immediate impact.",
      "Include time, location, quantity, equipment, or batch if relevant.",
      "Mention any temporary action already taken.",
    ],
    example:
      "At 10:20 AM, Unit 3 temperature crossed 90 C for 12 minutes. Operator paused batch transfer and informed maintenance.",
  },
  target: {
    title: "Choosing who receives it",
    tips: [
      "Task target links the alert to a known work item.",
      "Employee target is best for direct owner follow-up.",
      "Department target is best when ownership is shared.",
      "Organisation is reserved for HOD or Management broadcasts.",
    ],
    example:
      "Use Department for maintenance breakdowns when the exact owner is not clear.",
  },
  task: {
    title: "Linking a task",
    tips: [
      "Choose the task most closely connected to the abnormality.",
      "Search by task title or responsible person.",
      "If no task fits, choose Person or Department instead.",
    ],
    example:
      "Link a missed checklist alert to today's assigned checklist task.",
  },
  person: {
    title: "Selecting an employee",
    tips: [
      "Choose the individual who can directly respond.",
      "Avoid selecting someone only for awareness.",
      "Use Department when responsibility is shared.",
    ],
    example:
      "Send a wrong entry alert to the person responsible for the entry correction.",
  },
  department: {
    title: "Selecting a department",
    tips: [
      "Use this when the issue needs team-level ownership.",
      "Pick the department closest to the process or asset.",
      "Add details so the HOD can assign the right resolver.",
    ],
    example:
      "Send repeated equipment faults to Maintenance with machine ID and stoppage duration.",
  },
};

export default function DwmsAlertForm({
  onCreated,
  onCancel,
}: DwmsAlertFormProps) {
  const { user } = useAuthStore();
  const [focusedField, setFocusedField] = useState<DwmsAlertField>("general");
  const [raiseSeverity, setRaiseSeverity] = useState("MEDIUM");
  const [raiseTitle, setRaiseTitle] = useState("");
  const [raiseDescription, setRaiseDescription] = useState("");
  const [targetType, setTargetType] = useState<DwmsAlertTargetType | "">("");
  const [creationMode, setCreationMode] = useState<AlertCreationMode>("");
  const [raiseTaskInstanceId, setRaiseTaskInstanceId] = useState("");
  const [raiseAgainstUserId, setRaiseAgainstUserId] = useState("");
  const [raiseDepartmentId, setRaiseDepartmentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [todayTasks, setTodayTasks] = useState<DwmsAlertTargetTask[]>([]);
  const [targetUsers, setTargetUsers] = useState<DwmsEmployeeOption[]>([]);
  const [targetDepartments, setTargetDepartments] = useState<
    DwmsDepartmentOption[]
  >([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [histories, setHistories] = useState<DwmsAlertItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const historyTargetId = targetType === "PERSON"
    ? raiseAgainstUserId
    : targetType === "TASK"
      ? raiseTaskInstanceId
      : targetType === "DEPARTMENT"
        ? raiseDepartmentId
        : targetType === "GENERAL"
          ? "organization"
          : "";
  const hasCompleteTarget = Boolean(targetType && historyTargetId);

  const isHodOrMgmt =
    user?.roleLevel === "HOD" || user?.roleLevel === "MANAGEMENT";
  const activeTip = ALERT_TIPS[focusedField];
  const canSubmit =
    hasCompleteTarget &&
    ((creationMode === "NEW" &&
      Boolean(raiseTitle.trim() && raiseDescription.trim())) ||
      (creationMode === "PREVIOUS" && Boolean(selectedHistoryId)));

  function resetAlertDetails() {
    setRaiseSeverity("MEDIUM");
    setRaiseTitle("");
    setRaiseDescription("");
  }

  function resetAfterTargetChange() {
    setCreationMode("");
    setSelectedHistoryId("");
    setHistories([]);
    setHistoryError(null);
    resetAlertDetails();
  }

  function selectScope(nextTargetType: DwmsAlertTargetType) {
    setTargetType(nextTargetType);
    setRaiseTaskInstanceId("");
    setRaiseAgainstUserId("");
    setRaiseDepartmentId("");
    resetAfterTargetChange();
  }

  function selectTarget(setTarget: (value: string) => void, value: string) {
    setTarget(value);
    resetAfterTargetChange();
  }

  useEffect(() => {
    async function loadTargets() {
      try {
        const token = useAuthStore.getState().accessToken ?? "";
        const res = await DwmsService.getAlertTargets(token);
        if (res?.tasks) setTodayTasks(res.tasks);
        if (res?.users) setTargetUsers(res.users);
        if (res?.departments) setTargetDepartments(res.departments);
      } catch (err: unknown) {
        setMessage(getDwmsErrorMessage(err, "Failed to load alert targets."));
      } finally {
        setTargetsLoading(false);
      }
    }
    void loadTargets();
  }, []);

  useEffect(() => {
    if (!isHodOrMgmt && targetType === "GENERAL") {
      setTargetType("");
      setCreationMode("");
      setSelectedHistoryId("");
      setHistories([]);
      setHistoryError(null);
      resetAlertDetails();
    }
  }, [isHodOrMgmt, targetType]);

  useEffect(() => {
    if (!targetType || !historyTargetId) return;
    let active = true;
    const token = useAuthStore.getState().accessToken ?? "";
    setHistoryLoading(true);
    setHistoryError(null);
    void DwmsService.getAlertHistories(token, targetType, historyTargetId)
      .then((result) => { if (active) setHistories(result.alerts ?? []); })
      .catch((error) => {
        if (active) {
          setHistories([]);
          setHistoryError(getDwmsErrorMessage(error, "Failed to load previous alerts."));
        }
      })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [historyTargetId, targetType]);

  async function handleAlertSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetType || !canSubmit) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      if (creationMode === "PREVIOUS") {
        await DwmsService.raiseAlertAgain(token, selectedHistoryId);
      } else {
        await DwmsService.createAlert(token, {
          severity: raiseSeverity,
          title: raiseTitle,
          description: raiseDescription,
          targetType,
          taskInstanceId:
            targetType === "TASK" ? raiseTaskInstanceId || null : null,
          againstUserId:
            targetType === "PERSON" ? raiseAgainstUserId || null : null,
          departmentId:
            targetType === "DEPARTMENT" ? raiseDepartmentId || null : null,
        });
      }
      onCreated();
    } catch (err: unknown) {
      setMessage(getDwmsErrorMessage(err, "Failed to raise alert."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <form
        onSubmit={handleAlertSubmit}
        className="space-y-6 rounded-2xl border border-border-app bg-white p-4 shadow-sm sm:p-8 lg:col-span-8"
      >
        {message && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
            {message}
          </div>
        )}
        <section>
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-app">
              1. Alert scope
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Choose what this alert relates to.
            </p>
          </div>
          <div className="grid grid-cols-1 auto-rows-fr gap-3 sm:grid-cols-2">
            {[
              { value: "TASK", label: "Task", desc: "Linked task" },
              { value: "PERSON", label: "Employee", desc: "Direct owner" },
              { value: "DEPARTMENT", label: "Department", desc: "Team owner" },
              { value: "GENERAL", label: "Organisation", desc: "HOD / Mgmt" },
            ].map((item) => {
              const disabled = item.value === "GENERAL" && !isHodOrMgmt;
              const active = targetType === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  disabled={disabled}
                  onFocus={() => setFocusedField("target")}
                  onClick={() =>
                    !disabled &&
                    selectScope(item.value as DwmsAlertTargetType)
                  }
                  className={`h-full min-h-20 rounded-xl border px-4 py-4 text-center transition ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-50" : active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-slate-900"}`}
                >
                  <span className="block text-sm font-semibold leading-tight">
                    {item.label}
                  </span>
                  <span className="mt-1.5 block text-xs leading-tight opacity-70">
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
          {!isHodOrMgmt && (
            <p className="mt-2 text-xs text-slate-500">
              Organisation alerts are available to HOD and Management roles.
            </p>
          )}
        </section>

        {targetType === "TASK" && (
          <section className="relative">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
              2. Select task
            </label>
            <DwmsSelectDropdown
              value={raiseTaskInstanceId}
              options={todayTasks.map((task) => ({
                value: task.instanceId,
                label: task.title,
                secondaryLabel: `Assigned to ${task.ownerName}`,
              }))}
              onChange={(value) => selectTarget(setRaiseTaskInstanceId, value)}
              onFocus={() => setFocusedField("task")}
              disabled={targetsLoading}
              placeholder="Select a task..."
              searchEnabled
              searchPlaceholder="Search task or operator"
              emptyMessage="No matching tasks found."
              triggerClassName="h-auto rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
            />
          </section>
        )}

        {targetType === "PERSON" && (
          <section className="relative">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
              2. Select employee
            </label>
            <DwmsSelectDropdown
              value={raiseAgainstUserId}
              options={targetUsers.map((u) => ({
                value: u.id,
                label: u.name,
                secondaryLabel: u.department?.name ?? u.role ?? "Employee",
                description: u.email,
                imageUrl: u.avatarUrl ?? null,
                variant: "employee",
              }))}
              onChange={(value) => selectTarget(setRaiseAgainstUserId, value)}
              onFocus={() => setFocusedField("person")}
              disabled={targetsLoading}
              placeholder="Choose an employee..."
              variant="employee"
              searchPlaceholder="Search employees..."
              emptyMessage="No matching employees found."
            />
          </section>
        )}

        {targetType === "DEPARTMENT" && (
          <section>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
              2. Select department
            </label>
            <DwmsSelectDropdown
              value={raiseDepartmentId}
              options={[
                { value: "", label: "Choose a department..." },
                ...targetDepartments.map((d) => ({
                  value: d.id,
                  label: d.name,
                })),
              ]}
              onChange={(value) => selectTarget(setRaiseDepartmentId, value)}
              onFocus={() => setFocusedField("department")}
              disabled={targetsLoading}
              placeholder="Choose a department..."
              triggerClassName="h-auto rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
            />
          </section>
        )}

        {targetType === "GENERAL" && (
          <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              2. Target organisation
            </p>
            <p className="mt-1 text-sm text-blue-900">
              This alert will be raised for the entire organisation.
            </p>
          </section>
        )}

        {hasCompleteTarget && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-app">
              3. Choose alert action
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Create a new alert or raise a previous alert for this target again.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 text-sm transition ${creationMode === "NEW" ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
                <input
                  type="radio"
                  name="alertCreationMode"
                  checked={creationMode === "NEW"}
                  onChange={() => {
                    setCreationMode("NEW");
                    setSelectedHistoryId("");
                  }}
                />
                <span>
                  <span className="font-semibold text-slate-900">Create a new alert</span>
                  <span className="mt-1 block text-xs text-slate-600">Enter a new title, description, and severity.</span>
                </span>
              </label>
              <label className={`flex items-start gap-3 rounded-xl border bg-white p-4 text-sm transition ${historyLoading || histories.length === 0 ? "cursor-not-allowed border-slate-200 opacity-60" : "cursor-pointer"} ${creationMode === "PREVIOUS" ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
                <input
                  type="radio"
                  name="alertCreationMode"
                  checked={creationMode === "PREVIOUS"}
                  disabled={historyLoading || histories.length === 0}
                  onChange={() => setCreationMode("PREVIOUS")}
                />
                <span>
                  <span className="font-semibold text-slate-900">Raise a previous alert again</span>
                  <span className="mt-1 block text-xs text-slate-600">Reuse an alert previously raised for this target.</span>
                </span>
              </label>
            </div>

            {historyLoading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading previous alerts...
              </p>
            )}
            {!historyLoading && historyError && (
              <p role="alert" className="mt-3 text-xs text-rose-700">
                {historyError}
              </p>
            )}
            {!historyLoading && !historyError && histories.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">
                No previous alerts were found for this target. Create a new alert instead.
              </p>
            )}

            {creationMode === "PREVIOUS" && histories.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-700">
                  Select the alert to raise again
                </p>
                {histories.map((item) => (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 text-sm transition ${selectedHistoryId === item.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}
                  >
                    <input
                      type="radio"
                      name="previousAlert"
                      value={item.id}
                      checked={selectedHistoryId === item.id}
                      onChange={() => setSelectedHistoryId(item.id)}
                    />
                    <span>
                      <span className="font-semibold text-slate-900">{item.title}</span>
                      <span className="mt-1 block text-xs text-slate-600">
                        Raised {item.raiseCount} time{item.raiseCount === 1 ? "" : "s"}
                        {item.isAbnormality ? " · Abnormality" : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>
        )}

        {creationMode === "NEW" && hasCompleteTarget && (
          <section className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-app">
              4. Alert details
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Severity
                </label>
                <DwmsSelectDropdown
                  value={raiseSeverity}
                  options={[
                    { value: "MEDIUM", label: "Medium" },
                    { value: "HIGH", label: "High" },
                    { value: "CRITICAL", label: "Critical" },
                  ]}
                  onChange={setRaiseSeverity}
                  onFocus={() => setFocusedField("severity")}
                  placeholder="Select severity"
                  triggerClassName="h-auto rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={raiseTitle}
                onFocus={() => setFocusedField("title")}
                onChange={(e) => setRaiseTitle(e.target.value)}
                placeholder="Alert title (e.g. Compressor pressure drop)"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={raiseDescription}
                onFocus={() => setFocusedField("description")}
                onChange={(e) => setRaiseDescription(e.target.value)}
                placeholder="Describe what happened, where, impact, and any immediate action taken..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
          </section>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting
              ? "Raising Alert..."
              : creationMode === "PREVIOUS"
                ? "Raise Previous Alert Again"
                : "Raise Alert"}
          </button>
        </div>
      </form>

      <aside className="rounded-2xl border border-border-app bg-white p-4 shadow-sm sm:p-6 lg:sticky lg:top-6 lg:col-span-4">
        <div className="flex items-center gap-2 border-b border-border-app pb-3">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-app">
            {activeTip.title}
          </h3>
        </div>
        <ul className="mt-5 space-y-2 text-sm leading-6 text-slate-600">
          {activeTip.tips.map((tip) => (
            <li key={tip}>- {tip}</li>
          ))}
        </ul>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Example / suggestion
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {activeTip.example}
          </p>
        </div>
      </aside>
    </div>
  );
}
