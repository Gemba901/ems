"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertTriangle, Bell, CheckCircle2, Loader2, Shield, Users } from 'lucide-react';
import { DEFAULT_DWMS_SETTINGS, DwmsService, getDwmsErrorMessage, type DwmsApproverRule, type DwmsEmployeeOption, type DwmsSettingsState, type EscalationContactRule, DWMS_APPROVER_RULE_OPTIONS, DWMS_ESCALATION_RULE_OPTIONS, DWMS_VIEW_LEVEL_OPTIONS, toDwmsSettingsPayload } from '@/services/dwms.service';
import DwmsTabHeader from '../components/DwmsTabHeader';
import DwmsSelectDropdown from '../components/DwmsSelectDropdown';
import { useAuthStore } from '@/store/auth.store';

const MANAGEMENT_ROLES = new Set(['MANAGEMENT', 'SUPER_ADMIN', 'ADMIN', 'HR']);
type EmployeeOption = DwmsEmployeeOption;
type DwmsSettings = DwmsSettingsState;

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-visible rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-50 px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
          <Icon className="h-5 w-5 text-slate-500" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>
      <div className="overflow-visible divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function SettingRow({
  title,
  hint,
  control,
}: {
  title: string;
  hint: string;
  control: React.ReactNode;
}) {
  return (
    <div className="relative overflow-visible flex flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
      </div>
      <div className="relative shrink-0 overflow-visible md:max-w-[560px]">{control}</div>
    </div>
  );
}

function EmployeeMultiSelectDropdown({
  value,
  employees,
  onChange,
  disabled,
}: {
  value: string[];
  employees: EmployeeOption[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <DwmsSelectDropdown
      mode="multiple"
      value={value}
      options={employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        secondaryLabel: employee.designation ?? employee.role ?? 'Employee',
        imageUrl: employee.avatarUrl ?? null,
        variant: 'employee',
      }))}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select up to 3 employees"
      maxSelected={3}
      variant="employee"
      emptyMessage="No matching employees found."
    />
  );
}

function HourSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="w-32 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
      />
      <span className="text-xs text-slate-400">hours</span>
    </div>
  );
}

function ViewLevelSelect({
  value,
  onChange,
  disabled,
}: {
  value: DwmsSettings['alertViewLevel'] | DwmsSettings['analyticsViewLevel'];
  onChange: (next: DwmsSettings['alertViewLevel'] | DwmsSettings['analyticsViewLevel']) => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-56">
      <DwmsSelectDropdown
        value={value}
        options={DWMS_VIEW_LEVEL_OPTIONS}
        onChange={(next) => onChange(next as DwmsSettings['alertViewLevel'])}
        disabled={disabled}
        placeholder="Select view level"
        triggerClassName="rounded-2xl border-slate-200 px-4 py-2.5 text-sm text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  );
}

export default function DwmsSettingsPage() {
  return (
    <ProtectedRoute>
      <DwmsSettingsContent />
    </ProtectedRoute>
  );
}

function DwmsSettingsContent() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const canEdit = MANAGEMENT_ROLES.has(String(user?.roleLevel ?? '').toUpperCase());
  const isForbidden = Boolean(user) && !canEdit;
  const [activeTab, setActiveTab] = useState<'EDIT' | 'SUMMARY'>('EDIT');

  const [settings, setSettings] = useState<DwmsSettings>(DEFAULT_DWMS_SETTINGS);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isForbidden) {
      router.replace('/dwms');
      return;
    }

    let mounted = true;

    async function load() {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [settingsRes, usersRes] = await Promise.all([
          DwmsService.getSettings(accessToken),
          DwmsService.listUsers(accessToken),
        ]);

        if (!mounted) return;

        setSettings(settingsRes);

        setEmployees((usersRes ?? []).map((employee) => ({
          id: employee.id,
          name: employee.name,
          email: employee.email,
          avatarUrl: employee.avatarUrl ?? null,
          role: employee.role ?? null,
          designation: employee.designation ?? null,
        })));
      } catch (loadError: unknown) {
        if (!mounted) return;
        setError(getDwmsErrorMessage(loadError, 'Failed to load DWMS settings'));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [accessToken, isForbidden, router]);

  const selectedApproverCustomEmployees = useMemo(
    () => employees.filter((employee) => settings.approverCustomEmployeeIds.includes(employee.id)),
    [employees, settings.approverCustomEmployeeIds]
  );

  const selectedEscalationContacts = useMemo(
    () => employees.filter((employee) => settings.customEscalationContactIds.includes(employee.id)),
    [employees, settings.customEscalationContactIds]
  );

  const updateSetting = <K extends keyof DwmsSettings>(key: K, value: DwmsSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!accessToken) {
      setError('Authentication token is missing. Please refresh and try again.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await DwmsService.updateSettings(accessToken, toDwmsSettingsPayload(settings));

      setSettings(response);

      setSuccess('DWMS settings saved successfully.');
    } catch (saveError: unknown) {
      setError(getDwmsErrorMessage(saveError, 'Failed to save DWMS settings'));
    } finally {
      setSaving(false);
    }
  };

  const formatSelectedSummaryValue = (
    selectedRules: string[],
    customLabel: string,
    customEnabled: boolean,
    customNames: string[]
  ) => {
    const ruleSummary = selectedRules.map((rule) => rule.replace(/_/g, ' ')).join(', ');
    const customSummary = customEnabled
      ? customNames.length > 0
        ? `${customLabel}: ${customNames.join(', ')}`
        : customLabel
      : '';

    return [ruleSummary, customSummary].filter(Boolean).join(' | ') || 'None';
  };

  const selectedValuesSummary = [
    {
      label: 'Task approver',
      value: formatSelectedSummaryValue(
        ['OWNER', ...settings.approverRoles.filter((rule) => rule !== 'OWNER' && rule !== 'CUSTOM')],
        'Custom employees',
        settings.approverRoles.includes('CUSTOM'),
        selectedApproverCustomEmployees.map((employee) => employee.name)
      ),
    },
    {
      label: 'Escalation target',
      value: formatSelectedSummaryValue(
        settings.escalationContactRules.filter((rule) => rule !== 'CUSTOM'),
        'Custom employees',
        settings.escalationContactRules.includes('CUSTOM'),
        selectedEscalationContacts.map((employee) => employee.name)
      ),
    },
    {
      label: 'Alert view',
      value: settings.alertViewLevel.replace(/_/g, ' '),
    },
    {
      label: 'Analytics view',
      value: settings.analyticsViewLevel.replace(/_/g, ' '),
    },
    {
      label: 'Ack windows',
      value: `Medium ${settings.escalateUnacknowledgedMediumHours}h, High ${settings.escalateUnacknowledgedHighHours}h, Critical ${settings.escalateUnacknowledgedCriticalHours}h`,
    },
  ];

  if (isForbidden) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
        <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Shield className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Settings restricted</h1>
          <p className="mt-2 text-sm text-slate-500">
            Only Management, HR, admin, and super admin users can change DWMS settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <DwmsTabHeader
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={[
              { key: 'EDIT', label: 'Edit Rules', dotColor: 'bg-blue-500' },
              { key: 'SUMMARY', label: 'Summary', dotColor: 'bg-emerald-500' },
            ]}
          />

          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {!canEdit && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Only admin, management, HR, and super admin users can change DWMS permission settings.</span>
            </div>
          )}

          {activeTab === 'EDIT' ? (
            <div className="space-y-6">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
                  <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-slate-400" />
                  Loading DWMS settings...
                </div>
              ) : (
                <>
                  <SectionCard
                    icon={Shield}
                    title="Permission rules"
                    description="Define who can be selected to approve tasks, assign work, and view operational data."
                  >
                    <SettingRow
                      title="Task approver"
                      hint="Choose all rules that decide who can be selected to approve a task. Anyone is exclusive."
                      control={
                        <DwmsSelectDropdown
                          mode="multiple"
                          value={['OWNER', ...settings.approverRoles.filter((rule) => rule !== 'OWNER')]}
                          options={DWMS_APPROVER_RULE_OPTIONS}
                          onChange={(next) => updateSetting('approverRoles', next.filter((rule): rule is DwmsApproverRule => rule !== 'OWNER'))}
                          disabled={!canEdit}
                          placeholder="Select approver rules"
                        />
                      }
                    />

                    {settings.approverRoles.includes('CUSTOM') && (
                      <SettingRow
                        title="Custom approver employees"
                        hint="Select up to 3 employees who can be selected to approve tasks."
                        control={<EmployeeMultiSelectDropdown value={settings.approverCustomEmployeeIds} employees={employees} onChange={(next) => updateSetting('approverCustomEmployeeIds', next.slice(0, 3))} disabled={!canEdit} />}
                      />
                    )}

                    <SettingRow
                      title="Employee alert view"
                      hint="Set how much alert data a regular employee can see."
                      control={<ViewLevelSelect value={settings.alertViewLevel} onChange={(value) => updateSetting('alertViewLevel', value)} disabled={!canEdit} />}
                    />

                    <SettingRow
                      title="Employee analytics view"
                      hint="Set how much dashboard data a regular employee can see."
                      control={<ViewLevelSelect value={settings.analyticsViewLevel} onChange={(value) => updateSetting('analyticsViewLevel', value)} disabled={!canEdit} />}
                    />
                  </SectionCard>

                  <SectionCard
                    icon={AlertTriangle}
                    title="Acknowledgement windows"
                    description="Set how long a task can stay unacknowledged for each severity."
                  >
                    <SettingRow
                      title="Medium severity"
                      hint="Allowed acknowledgement time before a medium task escalates."
                      control={<HourSelect value={settings.escalateUnacknowledgedMediumHours} onChange={(value) => updateSetting('escalateUnacknowledgedMediumHours', value)} disabled={!canEdit} />}
                    />

                    <SettingRow
                      title="High severity"
                      hint="Allowed acknowledgement time before a high-severity task escalates."
                      control={<HourSelect value={settings.escalateUnacknowledgedHighHours} onChange={(value) => updateSetting('escalateUnacknowledgedHighHours', value)} disabled={!canEdit} />}
                    />

                    <SettingRow
                      title="Critical severity"
                      hint="Allowed acknowledgement time before a critical task escalates."
                      control={<HourSelect value={settings.escalateUnacknowledgedCriticalHours} onChange={(value) => updateSetting('escalateUnacknowledgedCriticalHours', value)} disabled={!canEdit} />}
                    />
                  </SectionCard>

                  <SectionCard
                    icon={Bell}
                    title="Escalation target"
                    description="Choose who can receive task escalation alerts."
                  >
                    <SettingRow
                      title="Who can be selected as escalator"
                      hint="Choose all rules that decide who can be selected to receive escalation alerts first."
                      control={
                        <DwmsSelectDropdown
                          mode="multiple"
                          value={settings.escalationContactRules}
                          options={DWMS_ESCALATION_RULE_OPTIONS}
                          onChange={(next) => updateSetting('escalationContactRules', next.filter((rule): rule is EscalationContactRule => rule === 'ASSIGNER' || rule === 'MANAGER' || rule === 'CUSTOM'))}
                          disabled={!canEdit}
                          placeholder="Select escalation contacts"
                        />
                      }
                    />

                    {settings.escalationContactRules.includes('CUSTOM') && (
                      <SettingRow
                        title="Custom escalation contact"
                        hint="Pick up to 3 employees who can be selected to receive the escalation alert."
                        control={
                          <EmployeeMultiSelectDropdown
                            value={settings.customEscalationContactIds}
                            employees={employees}
                            onChange={(next) => updateSetting('customEscalationContactIds', next.slice(0, 3))}
                            disabled={!canEdit}
                          />
                        }
                      />
                    )}
                  </SectionCard>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!canEdit || loading || saving}
                      className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save DWMS settings
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-white px-6 py-5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                    <Users className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Selected Values</p>
                    <p className="text-xs text-slate-400">Read-only snapshot of the current settings.</p>
                  </div>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {selectedValuesSummary.map((item) => (
                    <div key={item.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <span className="text-xs text-slate-500">{item.label}</span>
                      <span className="text-xs font-semibold text-slate-700 sm:max-w-[70%] sm:text-right">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
