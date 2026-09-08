"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityItem,
  type DwmsEmployeeOption,
  type DwmsFrequency,
  type DwmsPriority,
} from "@/services/dwms.service";
import { LeaveService } from "@/services/leave.service";
import { useAuthStore } from "@/store/auth.store";
import { getOrganizationTodayKey } from "../../utils/organizationDate";
import { Role } from "@/types/role";
import DwmsSelectDropdown from "../../components/DwmsSelectDropdown";

type TaskCreationMode = "ACTIVITY" | "SIMPLE";

const FREQUENCY_OPTIONS: Array<{ val: DwmsFrequency; label: string }> = [
  { val: "PLANNED", label: "Once" },
  { val: "DAILY", label: "Daily" },
  { val: "WEEKLY", label: "Weekly" },
  { val: "MONTHLY", label: "Monthly" },
  { val: "QUARTERLY", label: "Quarterly" },
  { val: "YEARLY", label: "Yearly" },
];

const PRIORITY_OPTIONS: Array<{ val: DwmsPriority; label: string }> = [
  { val: "MEDIUM", label: "Medium" },
  { val: "HIGH", label: "High" },
  { val: "CRITICAL", label: "Critical" },
];

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDesignationLabel(designation?: string | null) {
  if (!designation) return "Employee";
  return designation;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getCalendarCells(month: Date) {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}
type PublicHoliday = { date: string; name: string };

const ISLAMIC_HOLIDAYS: Record<
  number,
  { eidAlFitr: string; eidAlAdha: string }
> = {
  2024: { eidAlFitr: "2024-04-10", eidAlAdha: "2024-06-17" },
  2025: { eidAlFitr: "2025-03-31", eidAlAdha: "2025-06-07" },
  2026: { eidAlFitr: "2026-03-20", eidAlAdha: "2026-05-27" },
  2027: { eidAlFitr: "2027-03-10", eidAlAdha: "2027-05-17" },
  2028: { eidAlFitr: "2028-02-27", eidAlAdha: "2028-05-05" },
};

function withSundayRollover(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getKenyaPublicHolidays(year: number): PublicHoliday[] {
  const holidays: PublicHoliday[] = [
    { date: withSundayRollover(year, 1, 1), name: "New Year's Day" },
    { date: withSundayRollover(year, 5, 1), name: "Labour Day" },
    { date: withSundayRollover(year, 6, 1), name: "Madaraka Day" },
    { date: withSundayRollover(year, 10, 20), name: "Mashujaa Day" },
    { date: withSundayRollover(year, 12, 12), name: "Jamhuri Day" },
    { date: withSundayRollover(year, 12, 25), name: "Christmas Day" },
    { date: withSundayRollover(year, 12, 26), name: "Boxing Day" },
  ];

  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  holidays.push({ date: toDateKey(goodFriday), name: "Good Friday" });
  holidays.push({ date: toDateKey(easterMonday), name: "Easter Monday" });

  const islamic = ISLAMIC_HOLIDAYS[year];
  if (islamic) {
    holidays.push({ date: islamic.eidAlFitr, name: "Eid al-Fitr" });
    holidays.push({ date: islamic.eidAlAdha, name: "Eid al-Adha" });
  }

  return holidays;
}

function getHolidayName(dateKey: string) {
  const year = Number(dateKey.slice(0, 4));
  return getKenyaPublicHolidays(year).find(
    (holiday) => holiday.date === dateKey,
  )?.name;
}
export default function CreateTaskAction() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();
  const organizationToday = getOrganizationTodayKey(user?.organizationTimeZone);
  const [title, setTitle] = useState("");
  const [creationMode, setCreationMode] = useState<TaskCreationMode>("SIMPLE");
  const [activities, setActivities] = useState<DwmsActivityItem[]>([]);
  const [activityId, setActivityId] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [users, setUsers] = useState<DwmsEmployeeOption[]>([]);
  const [approverCandidates, setApproverCandidates] = useState<
    DwmsEmployeeOption[]
  >([]);
  const [dueDate, setDueDate] = useState(organizationToday);
  const [isDueDateCalendarOpen, setIsDueDateCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(new Date(`${organizationToday}T00:00:00`)),
  );
  const [workingDays, setWorkingDays] =
    useState<number[]>(DEFAULT_WORKING_DAYS);
  const [priority, setPriority] = useState<DwmsPriority>("MEDIUM");
  const [frequency, setFrequency] = useState<DwmsFrequency>("PLANNED");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  const [approvedById, setApprovedById] = useState("");
  const [overdueAlertRecipientIds, setOverdueAlertRecipientIds] = useState<
    string[]
  >([]);
  const [overdueAlertRecipients, setOverdueAlertRecipients] = useState<
    DwmsEmployeeOption[]
  >([]);
  const [backupOwnerId, setBackupOwnerId] = useState("");
  const [requiresCompletionDocument, setRequiresCompletionDocument] =
    useState(false);
  const [completionDocumentName, setCompletionDocumentName] = useState("");
  const canAssignToAnyone = user
    ? [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.MANAGEMENT].includes(
        user.roleLevel,
      )
    : false;

  const selectedUser = users.find((u) => u.id === assignedToId);
  const workingDaySet = useMemo(() => new Set(workingDays), [workingDays]);
  const todayDateStr = organizationToday;
  const calendarCells = useMemo(
    () => getCalendarCells(calendarMonth),
    [calendarMonth],
  );

  function getDueDateBlockReason(date: Date) {
    const dateKey = toDateKey(date);
    if (dateKey < todayDateStr) return "Past date";
    const holidayName = getHolidayName(dateKey);
    if (holidayName) return holidayName;
    if (!workingDaySet.has(date.getDay())) return "Non-working day";
    return null;
  }

  const dueDateBlockReason = dueDate
    ? getDueDateBlockReason(new Date(`${dueDate}T00:00:00`))
    : "Select a due date";

  const employeeOptions = useMemo(
    () =>
      users.map((employee) => ({
        value: employee.id,
        label: employee.name,
        secondaryLabel: formatDesignationLabel(employee.designation),
        description: employee.email,
        imageUrl: employee.avatarUrl ?? null,
        variant: "employee" as const,
      })),
    [users],
  );

  const approverOptions = useMemo(
    () =>
      approverCandidates.map((employee) => ({
        value: employee.id,
        label: employee.name,
        secondaryLabel: formatDesignationLabel(employee.designation),
        description: employee.email,
        imageUrl: employee.avatarUrl ?? null,
        variant: "employee" as const,
      })),
    [approverCandidates],
  );

  const overdueAlertRecipientOptions = useMemo(
    () =>
      overdueAlertRecipients.map((employee) => ({
        value: employee.id,
        label: employee.name,
        secondaryLabel: formatDesignationLabel(employee.designation),
        description: employee.email,
        imageUrl: employee.avatarUrl ?? null,
        variant: "employee" as const,
      })),
    [overdueAlertRecipients],
  );

  const activityOptions = useMemo(
    () =>
      activities.map((activity) => ({
        value: activity.id,
        label: activity.name,
        secondaryLabel: activity.code,
        description: [
          activity.mainDepartment?.name,
          activity.processArea,
          activity.category,
        ]
          .filter(Boolean)
          .join(" / "),
      })),
    [activities],
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!accessToken) {
          if (mounted) setUsers([]);
          return;
        }

        const res = canAssignToAnyone
          ? await DwmsService.listUsers(accessToken)
          : ((await DwmsService.getReportees(accessToken))?.users ?? []);

        if (mounted) {
          setUsers(Array.isArray(res) ? res : (res ?? []));
        }
      } catch (error) {
        if (mounted)
          setMessage(
            getDwmsErrorMessage(
              error,
              "Unable to load team members. Please reload and try again.",
            ),
          );
      }
    })();

    return () => {
      mounted = false;
    };
  }, [accessToken, canAssignToAnyone]);

  useEffect(() => {
    let mounted = true;

    async function loadWorkingDays() {
      try {
        if (!accessToken) {
          if (mounted) setWorkingDays(DEFAULT_WORKING_DAYS);
          return;
        }

        const settings = await LeaveService.getSettings(accessToken);
        if (!mounted) return;
        setWorkingDays(
          settings.workingDays.length > 0
            ? settings.workingDays
            : DEFAULT_WORKING_DAYS,
        );
      } catch {
        if (mounted) setWorkingDays(DEFAULT_WORKING_DAYS);
      }
    }

    void loadWorkingDays();

    return () => {
      mounted = false;
    };
  }, [accessToken]);

  useEffect(() => {
    let mounted = true;

    async function loadActivities() {
      try {
        if (!accessToken) {
          if (mounted) setActivities([]);
          return;
        }

        const res = await DwmsService.getActivities(accessToken);
        if (mounted) {
          setActivities(
            (res.activities ?? []).filter(
              (activity) => activity.status !== "ARCHIVED",
            ),
          );
        }
      } catch {
        if (mounted) setActivities([]);
      }
    }

    void loadActivities();

    return () => {
      mounted = false;
    };
  }, [accessToken]);

  function handleActivityChange(nextId: string) {
    setActivityId(nextId);
    const selectedActivity = activities.find(
      (activity) => activity.id === nextId,
    );
    if (!selectedActivity) return;

    setTitle(selectedActivity.name);
    setDescription(
      selectedActivity.workMethod ||
        selectedActivity.purpose ||
        selectedActivity.completionOutput ||
        "",
    );
    setAssignedToId(selectedActivity.primaryResponsibleEmployeeId ?? "");
    setRequiresCompletionDocument(!!selectedActivity.evidenceRequired?.trim());
    setCompletionDocumentName(selectedActivity.evidenceRequired?.trim() ?? "");
  }

  useEffect(() => {
    let mounted = true;

    async function loadApproverCandidates() {
      if (!assignedToId) {
        setApproverCandidates([]);
        setApprovedById("");
        return;
      }

      try {
        if (!accessToken) {
          if (mounted) {
            setApproverCandidates([]);
            setApprovedById("");
          }
          return;
        }

        const res = await DwmsService.getApprovers(accessToken, assignedToId);
        if (!mounted) return;
        const nextCandidates = res?.users ?? [];
        setApproverCandidates(nextCandidates);
        setApprovedById((current) =>
          nextCandidates.some((candidate) => candidate.id === current)
            ? current
            : "",
        );
      } catch {
        if (!mounted) return;
        setApproverCandidates([]);
        setApprovedById("");
      }
    }

    void loadApproverCandidates();

    return () => {
      mounted = false;
    };
  }, [accessToken, assignedToId]);

  useEffect(() => {
    let mounted = true;

    async function loadOverdueAlertRecipients() {
      if (!assignedToId) {
        setOverdueAlertRecipients([]);
        setOverdueAlertRecipientIds([]);
        return;
      }

      try {
        if (!accessToken) {
          if (mounted) {
            setOverdueAlertRecipients([]);
            setOverdueAlertRecipientIds([]);
          }
          return;
        }

        const res = await DwmsService.getOverdueAlertRecipients(
          accessToken,
          assignedToId,
        );
        if (!mounted) return;
        const nextRecipients = res?.users ?? [];
        setOverdueAlertRecipients(nextRecipients);
        setOverdueAlertRecipientIds((current) => {
          const valid = current.filter((id) =>
            nextRecipients.some((candidate) => candidate.id === id),
          );
          return valid.length > 0
            ? valid
            : nextRecipients.length > 0
              ? [nextRecipients[0].id]
              : [];
        });
      } catch {
        if (!mounted) return;
        setOverdueAlertRecipients([]);
        setOverdueAlertRecipientIds([]);
      }
    }

    void loadOverdueAlertRecipients();

    return () => {
      mounted = false;
    };
  }, [accessToken, assignedToId, selectedUser?.name]);

  const validBackupOwnerId = users.some((user) => user.id === backupOwnerId)
    ? backupOwnerId
    : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setLoading(true);
    setMessage(null);

    if (!assignedToId) {
      setMessage("Please select a team member to assign the task to.");
      setLoading(false);
      return;
    }

    if (creationMode === "SIMPLE" && !title.trim()) {
      setMessage("Please enter a task title.");
      setLoading(false);
      return;
    }
    if (creationMode === "ACTIVITY" && !activityId) {
      setMessage("Please select an activity to create this task from.");
      setLoading(false);
      return;
    }

    const isPlanned = frequency === "PLANNED";
    const isDailyOrWeekly = frequency === "DAILY" || frequency === "WEEKLY";

    if (requiresCompletionDocument && !completionDocumentName.trim()) {
      setMessage("Please enter the required document name.");
      setLoading(false);
      return;
    }

    if (isPlanned) {
      if (dueDate < todayDateStr) {
        setMessage("Due date cannot be in the past");
        setLoading(false);
        return;
      }

      if (dueDateBlockReason) {
        setMessage(`Due date is unavailable: ${dueDateBlockReason}`);
        setLoading(false);
        return;
      }
    }

    submittingRef.current = true;
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      if (creationMode === "ACTIVITY") {
        await DwmsService.createTaskFromActivity(token, activityId, {
          assignedToId,
          dueDate: isPlanned ? dueDate : undefined,
          priority,
          frequency,
          approvedById: approvedById || undefined,
          backupOwnerId: isDailyOrWeekly
            ? validBackupOwnerId || undefined
            : undefined,
        });
      } else {
        await DwmsService.createAssignedTask(token, {
          title: title.trim(),
          description,
          assignedToId,
          dueDate: isPlanned ? dueDate : undefined,
          priority,
          frequency,
          approvedById: approvedById || undefined,
          overdueAlertToEmployeeIds:
            overdueAlertRecipientIds.length > 0
              ? overdueAlertRecipientIds
              : undefined,
          backupOwnerId: isDailyOrWeekly
            ? validBackupOwnerId || undefined
            : undefined,
          requiresCompletionDocument,
          completionDocumentName: requiresCompletionDocument
            ? completionDocumentName.trim()
            : undefined,
        });
      }
      setTitle("");
      setActivityId("");
      setDescription("");
      setAssignedToId("");
      setApprovedById("");
      setOverdueAlertRecipientIds([]);
      setBackupOwnerId("");
      setRequiresCompletionDocument(false);
      setCompletionDocumentName("");
      setDueDate(organizationToday);
      setPriority("MEDIUM");
      setFrequency("PLANNED");
      setMessage("Task assigned successfully!");

      router.push("/dwms/assignedTasks");
    } catch (err: unknown) {
      setMessage(getDwmsErrorMessage(err, "Failed to create assigned task"));
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6 pb-8 transition-all duration-200">
      {message && (
        <div
          className={`rounded-md border p-4 text-xs ${
            message.includes("successfully")
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
          }`}
        >
          {message}
        </div>
      )}

      <div className="w-full">
        <div className="w-full rounded-lg border border-border-app bg-white p-4 dark:bg-zinc-900 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Task source
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCreationMode("ACTIVITY")}
                  aria-pressed={creationMode === "ACTIVITY"}
                  className={`flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm font-semibold transition ${
                    creationMode === "ACTIVITY"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-zinc-200 bg-white text-slate-600 hover:bg-zinc-50"
                  }`}
                >
                  <span>Create from activity</span>
                </button>
                <button
                  type="button"
                  aria-pressed={creationMode === "SIMPLE"}
                  onClick={() => {
                    setCreationMode("SIMPLE");
                    setActivityId("");
                    setRequiresCompletionDocument(false);
                    setCompletionDocumentName("");
                  }}
                  className={`flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm font-semibold transition ${
                    creationMode === "SIMPLE"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-zinc-200 bg-white text-slate-600 hover:bg-zinc-50"
                  }`}
                >
                  <span>Simple task</span>
                </button>
              </div>
            </div>

            {creationMode === "ACTIVITY" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Activity <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={activityId}
                  options={activityOptions}
                  onChange={handleActivityChange}
                  placeholder="Choose a standard activity..."
                  searchEnabled
                  emptyMessage="No activities found."
                  triggerClassName="h-auto rounded-md border-zinc-200 px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Title <span className="ml-0.5 text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Inspect the packing line"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Description (optional)
              </label>
              <textarea
                placeholder="Add instructions or a checklist"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-sm font-medium text-slate-700">
                  Assign to <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={assignedToId}
                  options={employeeOptions}
                  onChange={setAssignedToId}
                  placeholder="Choose a team member..."
                  variant="employee"
                  emptyMessage="No matching team members found."
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Frequency <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={frequency}
                  options={FREQUENCY_OPTIONS.map((option) => ({
                    value: option.val,
                    label: option.label,
                  }))}
                  onChange={(value) => setFrequency(value as DwmsFrequency)}
                  placeholder="Select frequency"
                  triggerClassName="h-auto rounded-md border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {frequency === "PLANNED" ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Due date <span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDueDateCalendarOpen((open) => !open);
                    }}
                    className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-text-app outline-none transition hover:bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                  >
                    <span>{dueDate}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-app transition ${
                        isDueDateCalendarOpen ? "rotate-180" : ""
                      }`}
                      strokeWidth={1.5}
                    />
                  </button>
                  {dueDateBlockReason && (
                    <p className="mt-1.5 text-xs font-semibold text-rose-600">
                      Unavailable: {dueDateBlockReason}
                    </p>
                  )}
                  {isDueDateCalendarOpen && (
                    <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setCalendarMonth((current) =>
                              addMonths(current, -1),
                            )
                          }
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                          aria-label="Previous month"
                        >
                          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                        <span className="text-sm font-bold text-text-app">
                          {monthLabel(calendarMonth)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCalendarMonth((current) => addMonths(current, 1))
                          }
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                          aria-label="Next month"
                        >
                          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
                        {WEEKDAY_LABELS.map((day) => (
                          <span key={day} className="py-1">
                            {day}
                          </span>
                        ))}
                      </div>

                      <div className="mt-1 grid grid-cols-7 gap-1">
                        {calendarCells.map((date) => {
                          const dateKey = toDateKey(date);
                          const blockReason = getDueDateBlockReason(date);
                          const isCurrentMonth =
                            date.getMonth() === calendarMonth.getMonth();
                          const isSelected = dueDate === dateKey;

                          return (
                            <button
                              key={dateKey}
                              type="button"
                              disabled={!!blockReason}
                              title={blockReason ?? "Available"}
                              onClick={() => {
                                setDueDate(dateKey);
                                setIsDueDateCalendarOpen(false);
                              }}
                              className={`aspect-square rounded-lg border text-xs font-semibold transition ${
                                isSelected
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : blockReason
                                    ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                              } ${isCurrentMonth ? "" : "opacity-40"}`}
                            >
                              {date.getDate()}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>Selected: {dueDate}</span>
                        {dueDateBlockReason && (
                          <span className="font-semibold text-rose-600">
                            Unavailable: {dueDateBlockReason}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Schedule Target
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Runs on automated schedule"
                    className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold italic text-muted-app/60 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Priority <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={priority}
                  options={PRIORITY_OPTIONS.map((option) => ({
                    value: option.val,
                    label: option.label,
                  }))}
                  onChange={(value) => setPriority(value as DwmsPriority)}
                  placeholder="Select priority"
                  triggerClassName="h-auto rounded-md border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Approver
                </label>
                <DwmsSelectDropdown
                  value={approvedById}
                  options={approverOptions}
                  onChange={setApprovedById}
                  placeholder="None (No approval required)"
                  variant="employee"
                  allowClear
                  clearLabel="Clear Selection (No Approver)"
                  emptyMessage="No matching approvers found."
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Notify when overdue (optional)
                </label>
                <DwmsSelectDropdown
                  mode="multiple"
                  value={overdueAlertRecipientIds}
                  options={overdueAlertRecipientOptions}
                  onChange={setOverdueAlertRecipientIds}
                  placeholder="Choose team members..."
                  variant="employee"
                  emptyMessage="No matching recipients found."
                />
              </div>
            </div>
            <label
              className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm transition ${
                creationMode === "ACTIVITY"
                  ? "border-slate-200 bg-slate-50 text-slate-500"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={requiresCompletionDocument}
                disabled={creationMode === "ACTIVITY"}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRequiresCompletionDocument(checked);
                  if (!checked) setCompletionDocumentName("");
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">
                  Document required for completion
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {creationMode === "ACTIVITY"
                    ? "Inherited from the selected activity evidence requirement."
                    : "Assignee must upload a file before marking this task done."}
                </span>
              </span>
            </label>

            {requiresCompletionDocument && creationMode === "SIMPLE" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Document Name <span className="ml-0.5 text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={completionDocumentName}
                  onChange={(event) =>
                    setCompletionDocumentName(event.target.value)
                  }
                  placeholder="e.g. Signed inspection checklist"
                  className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full cursor-pointer select-none items-center justify-center gap-2 rounded-md border border-slate-200 bg-[#52618a] py-3 text-sm font-medium text-white transition hover:bg-[#445174] disabled:opacity-50"
            >
              <span>{loading ? "Assigning..." : "Assign task"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
