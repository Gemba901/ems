"use client";

import React, { useEffect, useRef, useState } from "react";
import { Building2, ClipboardList, UserRound, Users } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAlertItem,
  type DwmsAlertTargetTask,
  type DwmsAlertTargetType,
  type DwmsDepartmentOption,
  type DwmsEmployeeOption,
} from "@/services/dwms.service";
import DwmsSelectDropdown from "../DwmsSelectDropdown";
import FormHelp, { type FormHelpContent } from "./FormHelp";
import PreviousAlertPicker, { repeatAlertMessage } from "./PreviousAlertPicker";
import { GuidedForm, GuidedFormSection, GuidedFormReview } from "./GuidedForm";

type DwmsAlertFormProps = {
  onCreated: () => void;
  onCancel: () => void;
};

type AlertCreationMode = "" | "NEW" | "PREVIOUS";

const ALERT_STAGE_HELP: Record<string, FormHelpContent> = {
  target: {
    title: "Who receives it",
    options: [
      {
        label: "Task",
        description:
          "Choose an existing task when the issue relates to that work.",
      },
      {
        label: "Employee",
        description:
          "Choose one person who is responsible for resolving the issue.",
      },
      {
        label: "Department",
        description:
          "Choose a team when responsibility is shared across a department.",
      },
      {
        label: "Organisation",
        description:
          "Use for company-wide issues. Available to HOD and Management roles.",
      },
    ],
  },
  details: {
    title: "What happened",
    options: [
      {
        label: "New alert",
        description:
          "Create an alert with its own title, description and severity.",
      },
      {
        label: "Raise again",
        description:
          "Choose a previous alert when the same issue happens again for this recipient.",
      },
      {
        label: "Title",
        description:
          "Summarise the issue in a few words so it is easy to recognise.",
      },
      {
        label: "Description",
        description:
          "Explain what happened, where it occurred, its impact and any action already taken.",
      },
    ],
  },
  severity: {
    title: "How serious",
    options: [
      {
        label: "Medium",
        description: "A local issue with limited impact that needs attention.",
      },
      {
        label: "High",
        description:
          "A significant issue affecting work or output that needs quick action.",
      },
      {
        label: "Critical",
        description:
          "Safety risk, production stoppage or major compliance risk.",
      },
    ],
    note: "A repeated alert keeps its original severity.",
  },
  review: {
    title: "Review",
    options: [
      {
        label: "Check",
        description:
          "Confirm the recipient, issue and severity before raising the alert.",
      },
      {
        label: "Back",
        description:
          "Return to an earlier section to make changes; your entries are kept.",
      },
      {
        label: "Raise alert",
        description:
          "Submit the new alert or add another occurrence of the selected alert.",
      },
    ],
  },
};

export default function DwmsAlertForm({
  onCreated,
  onCancel,
}: DwmsAlertFormProps) {
  const { user } = useAuthStore();
  const [activeStage, setActiveStage] = useState("target");
  const [raiseSeverity, setRaiseSeverity] = useState("MEDIUM");
  const [raiseTitle, setRaiseTitle] = useState("");
  const [raiseDescription, setRaiseDescription] = useState("");
  const [targetType, setTargetType] = useState<DwmsAlertTargetType | "">("");
  const [creationMode, setCreationMode] = useState<AlertCreationMode>("");
  const [raiseTaskInstanceId, setRaiseTaskInstanceId] = useState("");
  const [raiseAgainstUserId, setRaiseAgainstUserId] = useState("");
  const [raiseDepartmentId, setRaiseDepartmentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [todayTasks, setTodayTasks] = useState<DwmsAlertTargetTask[]>([]);
  const [targetUsers, setTargetUsers] = useState<DwmsEmployeeOption[]>([]);
  const [targetDepartments, setTargetDepartments] = useState<
    DwmsDepartmentOption[]
  >([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [histories, setHistories] = useState<DwmsAlertItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const historyTargetId =
    targetType === "PERSON"
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
  const activeTip =
    activeStage === "details" && creationMode === "PREVIOUS"
      ? {
          title: "Raise the same issue again",
          options: [
            {
              label: "Search",
              description:
                "Find a previous alert for this recipient using words from its title or description.",
            },
            {
              label: "Severity",
              description:
                "Narrow the list to Medium, High or Critical alerts.",
            },
            {
              label: "Select",
              description:
                "Open an alert to check its original description, recent raises and acknowledgement status.",
            },
            {
              label: "Raise again",
              description:
                "Add another occurrence while keeping the original title, description, recipient and severity.",
            },
          ],
          note: "Need different details? Choose New alert.",
        }
      : ALERT_STAGE_HELP[activeStage];
  const selectedHistory = histories.find(
    (item) => item.id === selectedHistoryId,
  );
  const canSubmit =
    hasCompleteTarget &&
    ((creationMode === "NEW" &&
      Boolean(raiseTitle.trim() && raiseDescription.trim())) ||
      (creationMode === "PREVIOUS" &&
        Boolean(selectedHistory) &&
        !historyLoading &&
        !historyError));

  const severityReady =
    creationMode === "PREVIOUS"
      ? Boolean(selectedHistory)
      : ["MEDIUM", "HIGH", "CRITICAL"].includes(raiseSeverity);
  const formSteps = [
    { id: "target", title: "Who receives it", complete: hasCompleteTarget },
    { id: "details", title: "What happened", complete: canSubmit },
    { id: "severity", title: "How serious", complete: severityReady },
    { id: "review", title: "Review", complete: canSubmit && severityReady },
  ];
  const targetLabel =
    targetType === "TASK"
      ? todayTasks.find((task) => task.instanceId === raiseTaskInstanceId)
          ?.title
      : targetType === "PERSON"
        ? targetUsers.find((person) => person.id === raiseAgainstUserId)?.name
        : targetType === "DEPARTMENT"
          ? targetDepartments.find(
              (department) => department.id === raiseDepartmentId,
            )?.name
          : targetType === "GENERAL"
            ? "Entire organisation"
            : "";

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
    setHistoryLoading(false);
    resetAlertDetails();
  }

  function selectScope(nextTargetType: DwmsAlertTargetType) {
    if (nextTargetType === targetType) return;
    setTargetType(nextTargetType);
    setRaiseTaskInstanceId("");
    setRaiseAgainstUserId("");
    setRaiseDepartmentId("");
    resetAfterTargetChange();
  }

  function selectTarget(setTarget: (value: string) => void, value: string) {
    if (value === historyTargetId) return;
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
      .then((result) => {
        if (active) setHistories(result.alerts ?? []);
      })
      .catch((error) => {
        if (active) {
          setHistories([]);
          setHistoryError(
            getDwmsErrorMessage(error, "Failed to load previous alerts."),
          );
        }
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [historyTargetId, targetType, historyAttempt]);

  async function handleAlertSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      submittingRef.current ||
      activeStage !== "review" ||
      !targetType ||
      !canSubmit ||
      !severityReady
    )
      return;

    submittingRef.current = true;
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
      submittingRef.current = false;
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
        <GuidedForm
          title="Raise an alert"
          description="Choose who receives the alert, explain the issue, and check it before raising it. Complete one section at a time."
          steps={formSteps}
          onStepChange={setActiveStage}
        >
          <GuidedFormSection
            id="target"
            description="Choose what this alert relates to and who is responsible for resolving it."
          >
            <section>
              <p className="mb-2 text-xs font-medium text-slate-500">
                Alert scope
              </p>
              <div
                role="group"
                aria-label="Alert scope"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {[
                  {
                    value: "TASK",
                    label: "Task",
                    desc: "Linked task",
                    icon: ClipboardList,
                  },
                  {
                    value: "PERSON",
                    label: "Employee",
                    desc: "Direct owner",
                    icon: UserRound,
                  },
                  {
                    value: "DEPARTMENT",
                    label: "Department",
                    desc: "Team owner",
                    icon: Users,
                  },
                  {
                    value: "GENERAL",
                    label: "Organisation",
                    desc: "HOD / Mgmt",
                    icon: Building2,
                  },
                ].map((item) => {
                  const disabled = item.value === "GENERAL" && !isHodOrMgmt;
                  const active = targetType === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={disabled}
                      aria-label={`${item.label} ${item.desc}`}
                      aria-pressed={active}
                      onClick={() =>
                        !disabled &&
                        selectScope(item.value as DwmsAlertTargetType)
                      }
                      className={`flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold transition sm:gap-2 sm:px-2 sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${disabled ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400" : active ? "border-[#52618a] bg-[#52618a] text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-[#52618a]/40 hover:bg-slate-50"}`}
                    >
                      <item.icon
                        className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 whitespace-nowrap leading-tight">
                        {item.label}
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
                  Select task
                </label>
                <DwmsSelectDropdown
                  ariaLabel="Select task"
                  value={raiseTaskInstanceId}
                  options={todayTasks.map((task) => ({
                    value: task.instanceId,
                    label: task.title,
                    secondaryLabel: `Assigned to ${task.ownerName}`,
                  }))}
                  onChange={(value) =>
                    selectTarget(setRaiseTaskInstanceId, value)
                  }
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
                  Select employee
                </label>
                <DwmsSelectDropdown
                  ariaLabel="Select employee"
                  value={raiseAgainstUserId}
                  options={targetUsers.map((u) => ({
                    value: u.id,
                    label: u.name,
                    secondaryLabel: u.department?.name ?? u.role ?? "Employee",
                    description: u.email,
                    imageUrl: u.avatarUrl ?? null,
                    variant: "employee",
                  }))}
                  onChange={(value) =>
                    selectTarget(setRaiseAgainstUserId, value)
                  }
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
                  Select department
                </label>
                <DwmsSelectDropdown
                  ariaLabel="Select department"
                  value={raiseDepartmentId}
                  options={[
                    { value: "", label: "Choose a department..." },
                    ...targetDepartments.map((d) => ({
                      value: d.id,
                      label: d.name,
                    })),
                  ]}
                  onChange={(value) =>
                    selectTarget(setRaiseDepartmentId, value)
                  }
                  disabled={targetsLoading}
                  placeholder="Choose a department..."
                  triggerClassName="h-auto rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </section>
            )}

            {targetType === "GENERAL" && (
              <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Target organisation
                </p>
                <p className="mt-1 text-sm text-blue-900">
                  This alert will be raised for the entire organisation.
                </p>
              </section>
            )}
          </GuidedFormSection>
          <GuidedFormSection
            id="details"
            description="Describe a new issue or select a previous alert to raise again for this recipient."
          >
            {hasCompleteTarget && (
              <div className="space-y-5">
                <fieldset className="inline-grid w-full max-w-sm grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <legend className="sr-only">Choose alert action</legend>
                  {(
                    [
                      { value: "NEW", label: "New alert" },
                      { value: "PREVIOUS", label: "Raise again" },
                    ] as const
                  ).map((mode) => (
                    <label
                      key={mode.value}
                      className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition ${creationMode === mode.value ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200" : "text-slate-600 hover:bg-white"}`}
                    >
                      <input
                        type="radio"
                        name="alertCreationMode"
                        checked={creationMode === mode.value}
                        onChange={() => {
                          setCreationMode(mode.value);
                          if (mode.value === "NEW") setSelectedHistoryId("");
                        }}
                        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                      <span
                        className="pointer-events-none absolute inset-0 rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500"
                        aria-hidden="true"
                      />
                      {mode.label}
                    </label>
                  ))}
                </fieldset>
                {creationMode === "PREVIOUS" && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Find a previous alert
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Choose the alert to raise again for {targetLabel}. Its
                        original details and severity will be reused.
                      </p>
                    </div>
                    <PreviousAlertPicker
                      alerts={histories}
                      selectedId={selectedHistoryId}
                      onSelect={setSelectedHistoryId}
                      loading={historyLoading}
                      error={historyError}
                      onRetry={() =>
                        setHistoryAttempt((attempt) => attempt + 1)
                      }
                      timeZone={user?.organizationTimeZone}
                    />
                  </div>
                )}
              </div>
            )}

            {creationMode === "NEW" && hasCompleteTarget && (
              <section className="space-y-6">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    aria-label="Alert title"
                    value={raiseTitle}
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
                    aria-label="Alert description"
                    value={raiseDescription}
                    onChange={(e) => setRaiseDescription(e.target.value)}
                    placeholder="Describe what happened, where, impact, and any immediate action taken..."
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                  />
                </div>
              </section>
            )}
          </GuidedFormSection>
          <GuidedFormSection
            id="severity"
            description="Choose the severity based on the impact of the issue."
          >
            {creationMode === "NEW" ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                    Severity
                  </label>
                  <DwmsSelectDropdown
                    ariaLabel="Severity"
                    value={raiseSeverity}
                    options={[
                      { value: "MEDIUM", label: "Medium" },
                      { value: "HIGH", label: "High" },
                      { value: "CRITICAL", label: "Critical" },
                    ]}
                    onChange={setRaiseSeverity}
                    placeholder="Select severity"
                    triggerClassName="h-auto rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold">
                  Severity: {selectedHistory?.severity}
                </p>
                <p className="mt-2 text-xs leading-5">
                  Raising a previous alert again keeps its original severity and
                  details.
                </p>
              </div>
            )}
          </GuidedFormSection>
          <GuidedFormSection
            id="review"
            description="Confirm the recipient and issue before raising the alert."
          >
            <GuidedFormReview
              ready={canSubmit && severityReady}
              entries={[
                { label: "Recipient", value: targetLabel ?? "" },
                {
                  label: "Action",
                  value:
                    creationMode === "PREVIOUS"
                      ? "Raise a previous alert again"
                      : "Create a new alert",
                },
                {
                  label: "Title",
                  value:
                    creationMode === "PREVIOUS"
                      ? (selectedHistory?.title ?? "")
                      : raiseTitle.trim(),
                },
                {
                  label: "Description",
                  value:
                    creationMode === "PREVIOUS"
                      ? (selectedHistory?.description ?? "")
                      : raiseDescription.trim(),
                },
                {
                  label: "Severity",
                  value:
                    creationMode === "PREVIOUS"
                      ? (selectedHistory?.severity ?? "")
                      : raiseSeverity,
                },
              ]}
            />
            {creationMode === "PREVIOUS" && selectedHistory && (
              <p className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                {repeatAlertMessage(selectedHistory)}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !canSubmit || !severityReady}
              className="min-h-11 rounded-xl bg-[#52618a] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#445174] disabled:opacity-60"
            >
              {submitting
                ? "Raising Alert..."
                : creationMode === "PREVIOUS"
                  ? "Raise Previous Alert Again"
                  : "Raise Alert"}
            </button>
          </GuidedFormSection>
        </GuidedForm>
        <div className="grid grid-cols-2 gap-2 pt-4 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>

      <aside
        aria-label="Help for the current stage"
        className="rounded-2xl border border-border-app bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-6 lg:col-span-4"
      >
        <FormHelp {...activeTip} />
      </aside>
    </div>
  );
}
