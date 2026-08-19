"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  PencilLine,
  Send,
} from "lucide-react";
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
import { Role } from "@/types/role";
import DwmsSelectDropdown from "../../components/DwmsSelectDropdown";

type FieldType =
  | "general"
  | "activity"
  | "title"
  | "description"
  | "assignTo"
  | "frequency"
  | "dueDate"
  | "priority"
  | "approvedBy"
  | "overdueAlertTo"
  | "backupOwner"
  | "completionDocument";

type FieldTips = {
  title: string;
  tips: string;
  example: string;
};

const TIPS_DATA: Record<FieldType, FieldTips> = {
  general: {
    title: "How to create an effective task",
    tips:
      "Every task should answer five questions:\n\n" +
      "- What needs to be done?\n" +
      "- Why is it needed?\n" +
      "- Who is responsible?\n" +
      "- When should it be completed?\n" +
      "- How will someone know it is finished?\n" +
      "If any of these are missing, the assignee may need clarification before starting.",
    example:
      "Checklist:\n" +
      "- Use a clear action verb\n" +
      "- Mention the exact system, equipment, or document\n" +
      "- Explain what success looks like\n" +
      "- Set a realistic deadline\n" +
      "- Add any references or links if required",
  },
  activity: {
    title: "Choosing an activity",
    tips: "Use an activity when the work is already defined as a standard organization practice. The task created from it becomes the actual execution record assigned to a person.",
    example:
      "Select the activity for a standard inspection, audit, checklist, review, or routine process. The task fields can still be adjusted before assigning.",
  },
  title: {
    title: "Writing a clear task title",
    tips: "A title should describe one specific action. Avoid broad or vague words like 'Check', 'Work', or 'Update' unless you mention what is being checked or updated.",
    example:
      "Good:\n" +
      "- Verify fire extinguisher inspection records\n" +
      "- Approve June payroll before bank submission\n" +
      "- Replace damaged safety sign in Warehouse A\n\n" +
      "Avoid:\n" +
      "- Inspection\n" +
      "- Payroll\n" +
      "- Safety work",
  },
  description: {
    title: "Writing detailed instructions",
    tips: "Write enough information so another employee can complete the task without asking questions. Include the location, process, documents to use, and what should be recorded after completion.",
    example:
      "Inspect all emergency exit lights on the second floor. Replace any faulty units immediately. Record the inspection date and any replacements in the Maintenance Register. Upload photos if repairs were performed.",
  },
  assignTo: {
    title: "Choosing the right assignee",
    tips: "Assign the task to the person who is responsible for completing it, not just someone who is available. If multiple people are involved, assign ownership to one person and mention others in the description if needed.",
    example:
      "Examples:\n" +
      "- Quality inspection -> Quality Engineer\n" +
      "- Network maintenance -> Network Administrator\n" +
      "- Vendor payment approval -> Finance Manager\n" +
      "- Safety audit -> Safety Officer",
  },
  frequency: {
    title: "Choosing the recurrence",
    tips: "Select how often the task should repeat based on the actual business process. Avoid creating recurring tasks for work that only happens occasionally.",
    example:
      "One Time:\n" +
      "- Install new CCTV cameras\n\n" +
      "Daily:\n" +
      "- Verify production line startup checklist\n\n" +
      "Weekly:\n" +
      "- Review inventory discrepancies\n\n" +
      "Monthly:\n" +
      "- Inspect fire safety equipment",
  },
  dueDate: {
    title: "Setting the deadline",
    tips: "Choose a deadline that gives enough time to complete the work before it affects other activities. If later tasks depend on this one, set the deadline before those activities begin.",
    example:
      "Examples:\n" +
      "- Submit payroll approval by the 28th before salary processing.\n" +
      "- Complete equipment inspection before the production shift starts.\n" +
      "- Finish vendor verification before issuing the purchase order.",
  },
  priority: {
    title: "Selecting the priority",
    tips: "Priority should reflect business impact, not personal urgency. Reserve higher priorities for work that affects safety, production, customers, compliance, or critical operations.",
    example:
      "Critical:\n" +
      "- Production line stopped\n" +
      "- Fire alarm malfunction\n\n" +
      "High:\n" +
      "- Security vulnerability before release\n" +
      "- Customer audit preparation\n\n" +
      "Medium:\n" +
      "- Weekly inventory reconciliation\n" +
      "- Team performance report",
  },
  approvedBy: {
    title: "Choosing an Approver",
    tips: "Select the team member who needs to approve the task upon completion. This is optional. If left blank, task completions will not require approval.",
    example:
      "Choose a Senior Engineer or Quality Lead to verify critical server migrations or safety audits before closing them.",
  },
  overdueAlertTo: {
    title: "Overdue Alert Target",
    tips: "Specify who should get an automatic notification and alert if this task becomes Overdue. You can choose 'Me' (the Assigner) or the direct managers of the assignee in the department hierarchy.",
    example:
      "- Me (Assigner): For direct individual requests\n- Managers of assigned Person: For team compliance and workflow audits",
  },
  backupOwner: {
    title: "Choosing a Backup Owner",
    tips: "Select a backup team member who will be responsible for executing this task if the primary owner goes on leave. This is optional and only applies to Daily or Weekly recurring tasks.",
    example:
      "Select another shift engineer from the same department to ensure continuous checklist compliance during leave.",
  },
  completionDocument: {
    title: "Completion document",
    tips: "Turn this on when the assignee must upload a document, photo, report, or other file before the task can be completed.",
    example:
      "Use this for signed checklists, inspection photos, approval PDFs, register extracts, or compliance proof.",
  },
};

type TaskCreationMode = "ACTIVITY" | "SIMPLE";

const FREQUENCY_OPTIONS: Array<{ val: DwmsFrequency; label: string }> = [
  { val: "PLANNED", label: "One Time (Planned)" },
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
  const [title, setTitle] = useState("");
  const [creationMode, setCreationMode] =
    useState<TaskCreationMode>("ACTIVITY");
  const [activities, setActivities] = useState<DwmsActivityItem[]>([]);
  const [activityId, setActivityId] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [users, setUsers] = useState<DwmsEmployeeOption[]>([]);
  const [approverCandidates, setApproverCandidates] = useState<
    DwmsEmployeeOption[]
  >([]);
  const [dueDate, setDueDate] = useState(toDateKey(new Date()));
  const [isDueDateCalendarOpen, setIsDueDateCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [workingDays, setWorkingDays] =
    useState<number[]>(DEFAULT_WORKING_DAYS);
  const [priority, setPriority] = useState<DwmsPriority>("MEDIUM");
  const [frequency, setFrequency] = useState<DwmsFrequency>("PLANNED");
  const [loading, setLoading] = useState(false);
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
  const [focusedField, setFocusedField] = useState<FieldType>("general");
  const canAssignToAnyone = user
    ? [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.MANAGEMENT].includes(
        user.roleLevel,
      )
    : false;

  const selectedUser = users.find((u) => u.id === assignedToId);
  const selectedActivity = activities.find(
    (activity) => activity.id === activityId,
  );
  const workingDaySet = useMemo(() => new Set(workingDays), [workingDays]);
  const todayDateStr = toDateKey(new Date());
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
      } catch {
        // ignore
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

  useEffect(() => {
    if (creationMode !== "ACTIVITY" || !selectedActivity) return;

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
  }, [creationMode, selectedActivity]);

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

  useEffect(() => {
    if (backupOwnerId && !users.some((user) => user.id === backupOwnerId)) {
      setBackupOwnerId("");
    }
  }, [users, backupOwnerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!assignedToId) {
      setMessage("Please select a team member to assign the task to.");
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

    try {
      const token = useAuthStore.getState().accessToken ?? "";
      if (creationMode === "ACTIVITY") {
        if (!activityId) {
          setMessage("Please select an activity to create this task from.");
          setLoading(false);
          return;
        }

        await DwmsService.createTaskFromActivity(token, activityId, {
          assignedToId,
          dueDate: isPlanned ? dueDate : undefined,
          priority,
          frequency,
          approvedById: approvedById || undefined,
          backupOwnerId: isDailyOrWeekly
            ? backupOwnerId || undefined
            : undefined,
        });
      } else {
        await DwmsService.createAssignedTask(token, {
          title,
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
            ? backupOwnerId || undefined
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
      setDueDate(toDateKey(new Date()));
      setPriority("MEDIUM");
      setFrequency("PLANNED");
      setMessage("Task assigned successfully!");

      setTimeout(() => {
        router.push("/dwms/assignedTasks");
      }, 1500);
    } catch (err: unknown) {
      setMessage(getDwmsErrorMessage(err, "Failed to create assigned task"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6 pb-8 transition-all duration-200">
      {message && (
        <div
          className={`rounded-xl border p-4 text-xs ${
            message.includes("successfully")
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="w-full rounded-2xl border border-border-app bg-white p-6 shadow-sm dark:bg-zinc-900 sm:p-8 lg:col-span-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                Task Creation Type
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCreationMode("ACTIVITY")}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    creationMode === "ACTIVITY"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-slate-600 hover:bg-zinc-50"
                  }`}
                >
                  <BookOpenCheck
                    className="h-4 w-4 shrink-0"
                    strokeWidth={1.5}
                  />
                  <span>Create from activity</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreationMode("SIMPLE");
                    setActivityId("");
                    setRequiresCompletionDocument(false);
                    setCompletionDocumentName("");
                  }}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    creationMode === "SIMPLE"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-slate-600 hover:bg-zinc-50"
                  }`}
                >
                  <PencilLine className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>Simple task</span>
                </button>
              </div>
            </div>

            {creationMode === "ACTIVITY" && (
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Activity <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={activityId}
                  options={activityOptions}
                  onChange={setActivityId}
                  onFocus={() => setFocusedField("activity")}
                  placeholder="Choose a standard activity..."
                  searchEnabled
                  emptyMessage="No activities found."
                  triggerClassName="h-auto rounded-xl border-zinc-200 px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                Title <span className="ml-0.5 text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Task title (e.g. Audit server logs)"
                value={title}
                onFocus={() => setFocusedField("title")}
                onBlur={() => setFocusedField("general")}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                Description (optional)
              </label>
              <textarea
                placeholder="Task description details or execution checklists..."
                value={description}
                onFocus={() => setFocusedField("description")}
                onBlur={() => setFocusedField("general")}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Assign To <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={assignedToId}
                  options={employeeOptions}
                  onChange={setAssignedToId}
                  onFocus={() => setFocusedField("assignTo")}
                  placeholder="Choose a team member..."
                  variant="employee"
                  emptyMessage="No matching team members found."
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Frequency <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={frequency}
                  options={FREQUENCY_OPTIONS.map((option) => ({
                    value: option.val,
                    label: option.label,
                  }))}
                  onChange={(value) => setFrequency(value as DwmsFrequency)}
                  onFocus={() => setFocusedField("frequency")}
                  placeholder="Select frequency"
                  triggerClassName="h-auto rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {frequency === "PLANNED" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                    Due Date <span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusedField("dueDate");
                      setIsDueDateCalendarOpen((open) => !open);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-text-app shadow-sm outline-none transition hover:bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
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
                    <div
                      className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                      onFocus={() => setFocusedField("dueDate")}
                      onBlur={() => setFocusedField("general")}
                    >
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
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                    Schedule Target
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Runs on automated schedule"
                    className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold italic text-muted-app/60 shadow-sm outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Priority <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  value={priority}
                  options={PRIORITY_OPTIONS.map((option) => ({
                    value: option.val,
                    label: option.label,
                  }))}
                  onChange={(value) => setPriority(value as DwmsPriority)}
                  onFocus={() => setFocusedField("priority")}
                  placeholder="Select priority"
                  triggerClassName="h-auto rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Approver
                </label>
                <DwmsSelectDropdown
                  value={approvedById}
                  options={approverOptions}
                  onChange={setApprovedById}
                  onFocus={() => setFocusedField("approvedBy")}
                  placeholder="None (No approval required)"
                  variant="employee"
                  allowClear
                  clearLabel="Clear Selection (No Approver)"
                  emptyMessage="No matching approvers found."
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Overdue Alert Recipient{" "}
                  <span className="ml-0.5 text-red-500">*</span>
                </label>
                <DwmsSelectDropdown
                  mode="multiple"
                  value={overdueAlertRecipientIds}
                  options={overdueAlertRecipientOptions}
                  onChange={setOverdueAlertRecipientIds}
                  onFocus={() => setFocusedField("overdueAlertTo")}
                  placeholder="Choose team members..."
                  variant="employee"
                  emptyMessage="No matching recipients found."
                />
              </div>
            </div>
            <label
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                creationMode === "ACTIVITY"
                  ? "border-slate-200 bg-slate-50 text-slate-500"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={requiresCompletionDocument}
                disabled={creationMode === "ACTIVITY"}
                onFocus={() => setFocusedField("completionDocument")}
                onBlur={() => setFocusedField("general")}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRequiresCompletionDocument(checked);
                  if (!checked) setCompletionDocumentName("");
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-app">
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
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Document Name <span className="ml-0.5 text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={completionDocumentName}
                  onFocus={() => setFocusedField("completionDocument")}
                  onBlur={() => setFocusedField("general")}
                  onChange={(event) =>
                    setCompletionDocumentName(event.target.value)
                  }
                  placeholder="e.g. Signed inspection checklist"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full cursor-pointer select-none items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-4 text-sm font-semibold text-text-app shadow-sm transition hover:bg-slate-50"
            >
              <Send
                className="h-4 w-4 shrink-0 text-muted-app"
                strokeWidth={1.5}
              />
              <span>{loading ? "Assigning..." : "Assign task"}</span>
            </button>
          </form>
        </div>

        <div className="sticky top-6 w-full rounded-2xl border border-border-app bg-white p-6 shadow-sm lg:col-span-4">
          <div className="flex items-center gap-2 border-b border-border-app pb-3">
            <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-app">
              {TIPS_DATA[focusedField].title}
            </h2>
          </div>

          <p className="mt-5 whitespace-pre-line text-sm leading-6 text-slate-600">
            {TIPS_DATA[focusedField].tips}
          </p>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Example / Suggestion
            </span>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
              {TIPS_DATA[focusedField].example}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
