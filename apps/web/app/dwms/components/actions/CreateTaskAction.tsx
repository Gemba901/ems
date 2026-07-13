"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Lightbulb } from 'lucide-react';
import { DwmsService, getDwmsErrorMessage, type DwmsEmployeeOption, type DwmsFrequency, type DwmsPriority } from '@/services/dwms.service';
import { useAuthStore } from '@/store/auth.store';
import { Role } from '@/types/role';
import DwmsSelectDropdown from '../../components/DwmsSelectDropdown';

type FieldType =
  | 'general'
  | 'title'
  | 'description'
  | 'assignTo'
  | 'frequency'
  | 'dueDate'
  | 'priority'
  | 'approvedBy'
  | 'overdueAlertTo'
  | 'backupOwner';

type FieldTips = {
  title: string;
  tips: string;
  example: string;
};

const TIPS_DATA: Record<FieldType, FieldTips> = {
  general: {
    title: 'How to create an effective task',
    tips:
      'Every task should answer five questions:\n\n' +
      '- What needs to be done?\n' +
      '- Why is it needed?\n' +
      '- Who is responsible?\n' +
      '- When should it be completed?\n' +
      '- How will someone know it is finished?\n' +
      'If any of these are missing, the assignee may need clarification before starting.',
    example:
      'Checklist:\n' +
      '- Use a clear action verb\n' +
      '- Mention the exact system, equipment, or document\n' +
      '- Explain what success looks like\n' +
      '- Set a realistic deadline\n' +
      '- Add any references or links if required',
  },
  title: {
    title: 'Writing a clear task title',
    tips:
      "A title should describe one specific action. Avoid broad or vague words like 'Check', 'Work', or 'Update' unless you mention what is being checked or updated.",
    example:
      'Good:\n' +
      '- Verify fire extinguisher inspection records\n' +
      '- Approve June payroll before bank submission\n' +
      '- Replace damaged safety sign in Warehouse A\n\n' +
      'Avoid:\n' +
      '- Inspection\n' +
      '- Payroll\n' +
      '- Safety work',
  },
  description: {
    title: 'Writing detailed instructions',
    tips:
      'Write enough information so another employee can complete the task without asking questions. Include the location, process, documents to use, and what should be recorded after completion.',
    example:
      'Inspect all emergency exit lights on the second floor. Replace any faulty units immediately. Record the inspection date and any replacements in the Maintenance Register. Upload photos if repairs were performed.',
  },
  assignTo: {
    title: 'Choosing the right assignee',
    tips:
      'Assign the task to the person who is responsible for completing it, not just someone who is available. If multiple people are involved, assign ownership to one person and mention others in the description if needed.',
    example:
      'Examples:\n' +
      '- Quality inspection -> Quality Engineer\n' +
      '- Network maintenance -> Network Administrator\n' +
      '- Vendor payment approval -> Finance Manager\n' +
      '- Safety audit -> Safety Officer',
  },
  frequency: {
    title: 'Choosing the recurrence',
    tips:
      'Select how often the task should repeat based on the actual business process. Avoid creating recurring tasks for work that only happens occasionally.',
    example:
      'One Time:\n' +
      '- Install new CCTV cameras\n\n' +
      'Daily:\n' +
      '- Verify production line startup checklist\n\n' +
      'Weekly:\n' +
      '- Review inventory discrepancies\n\n' +
      'Monthly:\n' +
      '- Inspect fire safety equipment',
  },
  dueDate: {
    title: 'Setting the deadline',
    tips:
      'Choose a deadline that gives enough time to complete the work before it affects other activities. If later tasks depend on this one, set the deadline before those activities begin.',
    example:
      'Examples:\n' +
      '- Submit payroll approval by the 28th before salary processing.\n' +
      '- Complete equipment inspection before the production shift starts.\n' +
      '- Finish vendor verification before issuing the purchase order.',
  },
  priority: {
    title: 'Selecting the priority',
    tips:
      'Priority should reflect business impact, not personal urgency. Reserve higher priorities for work that affects safety, production, customers, compliance, or critical operations.',
    example:
      'Critical:\n' +
      '- Production line stopped\n' +
      '- Fire alarm malfunction\n\n' +
      'High:\n' +
      '- Security vulnerability before release\n' +
      '- Customer audit preparation\n\n' +
      'Medium:\n' +
      '- Weekly inventory reconciliation\n' +
      '- Team performance report',
  },
  approvedBy: {
    title: 'Choosing an Approver',
    tips:
      'Select the team member who needs to approve the task upon completion. This is optional. If left blank, task completions will not require approval.',
    example:
      'Choose a Senior Engineer or Quality Lead to verify critical server migrations or safety audits before closing them.',
  },
  overdueAlertTo: {
    title: 'Overdue Alert Target',
    tips:
      "Specify who should get an automatic notification and alert if this task becomes Overdue. You can choose 'Me' (the Assigner) or the direct managers of the assignee in the department hierarchy.",
    example:
      '- Me (Assigner): For direct individual requests\n- Managers of assigned Person: For team compliance and workflow audits',
  },
  backupOwner: {
    title: 'Choosing a Backup Owner',
    tips:
      'Select a backup team member who will be responsible for executing this task if the primary owner goes on leave. This is optional and only applies to Daily or Weekly recurring tasks.',
    example:
      'Select another shift engineer from the same department to ensure continuous checklist compliance during leave.',
  },
};

const FREQUENCY_OPTIONS: Array<{ val: DwmsFrequency; label: string }> = [
  { val: 'PLANNED', label: 'One Time (Planned)' },
  { val: 'DAILY', label: 'Daily' },
  { val: 'WEEKLY', label: 'Weekly' },
  { val: 'MONTHLY', label: 'Monthly' },
  { val: 'QUARTERLY', label: 'Quarterly' },
  { val: 'YEARLY', label: 'Yearly' },
];

const PRIORITY_OPTIONS: Array<{ val: DwmsPriority; label: string }> = [
  { val: 'MEDIUM', label: 'Medium' },
  { val: 'HIGH', label: 'High' },
  { val: 'CRITICAL', label: 'Critical' },
];

function formatDesignationLabel(designation?: string | null) {
  if (!designation) return 'Employee';
  return designation;
}

export default function CreateTaskAction() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [users, setUsers] = useState<DwmsEmployeeOption[]>([]);
  const [approverCandidates, setApproverCandidates] = useState<DwmsEmployeeOption[]>([]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState<DwmsPriority>('MEDIUM');
  const [frequency, setFrequency] = useState<DwmsFrequency>('PLANNED');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [approvedById, setApprovedById] = useState('');
  const [overdueAlertRecipientIds, setOverdueAlertRecipientIds] = useState<string[]>([]);
  const [overdueAlertRecipients, setOverdueAlertRecipients] = useState<DwmsEmployeeOption[]>([]);
  const [backupOwnerId, setBackupOwnerId] = useState('');
  const [focusedField, setFocusedField] = useState<FieldType>('general');
  const canAssignToAnyone = user
    ? [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.MANAGEMENT].includes(user.roleLevel)
    : false;

  const selectedUser = users.find((u) => u.id === assignedToId);

  const employeeOptions = useMemo(
    () =>
      users.map((employee) => ({
        value: employee.id,
        label: employee.name,
        secondaryLabel: formatDesignationLabel(employee.designation),
        description: employee.email,
        imageUrl: employee.avatarUrl ?? null,
        variant: 'employee' as const,
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
        variant: 'employee' as const,
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
        variant: 'employee' as const,
      })),
    [overdueAlertRecipients],
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
          : (await DwmsService.getReportees(accessToken))?.users ?? [];

        if (mounted) {
          setUsers(Array.isArray(res) ? res : res ?? []);
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

    async function loadApproverCandidates() {
      if (!assignedToId) {
        setApproverCandidates([]);
        setApprovedById('');
        return;
      }

      try {
        if (!accessToken) {
          if (mounted) {
            setApproverCandidates([]);
            setApprovedById('');
          }
          return;
        }

        const res = await DwmsService.getApprovers(accessToken, assignedToId);
        if (!mounted) return;
        const nextCandidates = res?.users ?? [];
        setApproverCandidates(nextCandidates);
        setApprovedById((current) =>
          nextCandidates.some((candidate) => candidate.id === current) ? current : '',
        );
      } catch {
        if (!mounted) return;
        setApproverCandidates([]);
        setApprovedById('');
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

        const res = await DwmsService.getOverdueAlertRecipients(accessToken, assignedToId);
        if (!mounted) return;
        const nextRecipients = res?.users ?? [];
        setOverdueAlertRecipients(nextRecipients);
        setOverdueAlertRecipientIds((current) => {
          const valid = current.filter((id) => nextRecipients.some((candidate) => candidate.id === id));
          return valid.length > 0 ? valid : nextRecipients.length > 0 ? [nextRecipients[0].id] : [];
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
      setBackupOwnerId('');
    }
  }, [users, backupOwnerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!assignedToId) {
      setMessage('Please select a team member to assign the task to.');
      setLoading(false);
      return;
    }

    const isPlanned = frequency === 'PLANNED';
    const isDailyOrWeekly = frequency === 'DAILY' || frequency === 'WEEKLY';

    if (isPlanned) {
      const todayDateStr = new Date().toISOString().slice(0, 10);
      if (dueDate < todayDateStr) {
        setMessage('Due date cannot be in the past');
        setLoading(false);
        return;
      }
    }

    try {
      const token = useAuthStore.getState().accessToken ?? '';
      await DwmsService.createAssignedTask(token, {
        title,
        description,
        assignedToId,
        dueDate: isPlanned ? dueDate : undefined,
        priority,
        frequency,
        approvedById: approvedById || undefined,
        overdueAlertToEmployeeIds: overdueAlertRecipientIds.length > 0 ? overdueAlertRecipientIds : undefined,
        backupOwnerId: isDailyOrWeekly ? (backupOwnerId || undefined) : undefined,
      });
      setTitle('');
      setDescription('');
      setAssignedToId('');
      setApprovedById('');
      setOverdueAlertRecipientIds([]);
      setBackupOwnerId('');
      setDueDate(new Date().toISOString().slice(0, 10));
      setPriority('MEDIUM');
      setFrequency('PLANNED');
      setMessage('Task assigned successfully!');

      setTimeout(() => {
        router.push('/dwms/assignedTasks');
      }, 1500);
    } catch (err: unknown) {
      setMessage(getDwmsErrorMessage(err, 'Failed to create assigned task'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6 pb-8 transition-all duration-200">
      {message && (
        <div
          className={`rounded-xl border p-4 text-xs ${
            message.includes('successfully')
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400'
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
                  Title <span className="ml-0.5 text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Task title (e.g. Audit server logs)"
                  value={title}
                  onFocus={() => setFocusedField('title')}
                  onBlur={() => setFocusedField('general')}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Description (optional)
                </label>
                <textarea
                  placeholder="Task description details or execution checklists..."
                  value={description}
                  onFocus={() => setFocusedField('description')}
                  onBlur={() => setFocusedField('general')}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60"
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
                    onFocus={() => setFocusedField('assignTo')}
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
                    options={FREQUENCY_OPTIONS.map((option) => ({ value: option.val, label: option.label }))}
                    onChange={(value) => setFrequency(value as DwmsFrequency)}
                    onFocus={() => setFocusedField('frequency')}
                    placeholder="Select frequency"
                    triggerClassName="h-auto rounded-xl border-zinc-200 px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {frequency === 'PLANNED' ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                      Due Date <span className="ml-0.5 text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={dueDate}
                      onFocus={() => setFocusedField('dueDate')}
                      onBlur={() => setFocusedField('general')}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full cursor-pointer rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60"
                    />
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
                      className="w-full cursor-not-allowed rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold italic text-muted-app/60 shadow-sm outline-none dark:border-zinc-800 dark:bg-zinc-900/30"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                    Priority <span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <DwmsSelectDropdown
                    value={priority}
                    options={PRIORITY_OPTIONS.map((option) => ({ value: option.val, label: option.label }))}
                    onChange={(value) => setPriority(value as DwmsPriority)}
                    onFocus={() => setFocusedField('priority')}
                    placeholder="Select priority"
                    triggerClassName="h-auto rounded-xl border-zinc-200 px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60"
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
                    onFocus={() => setFocusedField('approvedBy')}
                    placeholder="None (No approval required)"
                    variant="employee"
                    allowClear
                    clearLabel="Clear Selection (No Approver)"
                    emptyMessage="No matching approvers found."
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                    Overdue Alert Recipient <span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <DwmsSelectDropdown
                    mode="multiple"
                    value={overdueAlertRecipientIds}
                    options={overdueAlertRecipientOptions}
                    onChange={setOverdueAlertRecipientIds}
                    onFocus={() => setFocusedField('overdueAlertTo')}
                    placeholder="Choose team members..."
                    variant="employee"
                    emptyMessage="No matching recipients found."
                  />
                </div>
              </div>



              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full cursor-pointer select-none items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-4 text-sm font-semibold text-text-app shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900"
              >
                <Send className="h-4 w-4 shrink-0 text-muted-app" strokeWidth={1.5} />
                <span>{loading ? 'Assigning...' : 'Assign task'}</span>
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
