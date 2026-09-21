"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Shield,
  Users,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import {
  DEFAULT_DWMS_SETTINGS,
  DWMS_APPROVER_RULE_OPTIONS,
  DWMS_VIEW_LEVEL_OPTIONS,
  DwmsService,
  getDwmsErrorMessage,
  toDwmsSettingsPayload,
  type DwmsApproverRule,
  type DwmsEmployeeOption,
  type DwmsSettingsState,
} from "@/services/dwms.service";
import DwmsSelectDropdown from "../components/DwmsSelectDropdown";
import DwmsTabHeader from "../components/DwmsTabHeader";

const MANAGEMENT_ROLES = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

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
      <div className="divide-y divide-slate-50 overflow-visible">
        {children}
      </div>
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
    <div className="relative flex flex-col gap-4 overflow-visible px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
      </div>
      <div className="relative shrink-0 overflow-visible md:max-w-[560px]">
        {control}
      </div>
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
  employees: DwmsEmployeeOption[];
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
        secondaryLabel: employee.designation ?? employee.role ?? "Employee",
        imageUrl: employee.avatarUrl ?? null,
        variant: "employee",
      }))}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select Employees"
      maxSelected={3}
      variant="employee"
      className="w-56 max-w-full"
      triggerClassName="h-10 min-h-10 rounded-full px-3 py-2 text-sm"
      contentClassName="left-auto right-0 w-80"
      selectionSummary="first-with-count"
      showTriggerDescription={false}
      emptyMessage="No matching employees found."
    />
  );
}

function ViewLevelSelect({
  value,
  onChange,
  disabled,
}: {
  value:
    | DwmsSettingsState["alertViewLevel"]
    | DwmsSettingsState["analyticsViewLevel"];
  onChange: (next: DwmsSettingsState["alertViewLevel"]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-56">
      <DwmsSelectDropdown
        value={value}
        options={DWMS_VIEW_LEVEL_OPTIONS}
        onChange={(next) =>
          onChange(next as DwmsSettingsState["alertViewLevel"])
        }
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
  const canEdit = MANAGEMENT_ROLES.has(
    String(user?.roleLevel ?? "").toUpperCase(),
  );
  const isForbidden = Boolean(user) && !canEdit;
  const [activeTab, setActiveTab] = useState<"EDIT" | "SUMMARY">("EDIT");
  const [settings, setSettings] = useState<DwmsSettingsState>(
    DEFAULT_DWMS_SETTINGS,
  );
  const [employees, setEmployees] = useState<DwmsEmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isForbidden) {
      router.replace("/dwms");
      return;
    }
    if (!accessToken) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    Promise.all([
      DwmsService.getSettings(accessToken),
      DwmsService.listUsers(accessToken),
    ])
      .then(([savedSettings, people]) => {
        if (!mounted) return;
        setSettings(savedSettings);
        setEmployees(people ?? []);
      })
      .catch((cause) => {
        if (mounted)
          setError(getDwmsErrorMessage(cause, "Failed to load DWMS settings"));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [accessToken, isForbidden, router]);

  const selectedApprovers = useMemo(
    () =>
      employees.filter((employee) =>
        settings.approverCustomEmployeeIds.includes(employee.id),
      ),
    [employees, settings.approverCustomEmployeeIds],
  );

  const updateSetting = <K extends keyof DwmsSettingsState>(
    key: K,
    value: DwmsSettingsState[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateApproverRules = (next: string[]) => {
    const currentRules = settings.approverRoles.filter(
      (rule) => rule !== "OWNER",
    );
    const selected = next.filter(
      (rule): rule is DwmsApproverRule => rule !== "OWNER",
    );
    const addedAnyone =
      selected.includes("ANYONE") && !currentRules.includes("ANYONE");
    const normalized = addedAnyone
      ? ["ANYONE" as DwmsApproverRule]
      : selected.filter((rule) => rule !== "ANYONE");
    updateSetting("approverRoles", ["OWNER", ...normalized]);
  };

  const handleSave = async () => {
    if (!accessToken) {
      setError(
        "Authentication token is missing. Please refresh and try again.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await DwmsService.updateSettings(
        accessToken,
        toDwmsSettingsPayload(settings),
      );
      setSettings(response);
      setSuccess("DWMS settings saved successfully.");
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to save DWMS settings"));
    } finally {
      setSaving(false);
    }
  };

  const approverSummary = [
    "Owner",
    ...settings.approverRoles
      .filter((rule) => rule !== "OWNER" && rule !== "CUSTOM")
      .map(
        (rule) =>
          DWMS_APPROVER_RULE_OPTIONS.find((option) => option.value === rule)
            ?.label ?? rule,
      ),
    ...(settings.approverRoles.includes("CUSTOM")
      ? [
          `Custom: ${selectedApprovers.map((employee) => employee.name).join(", ") || "None selected"}`,
        ]
      : []),
  ].join(" · ");

  const summary = [
    { label: "Task approver", value: approverSummary },
    { label: "Alert view", value: settings.alertViewLevel.replace(/_/g, " ") },
    {
      label: "Analytics view",
      value: settings.analyticsViewLevel.replace(/_/g, " "),
    },
  ];

  if (isForbidden) return null;

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <DwmsTabHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { key: "EDIT", label: "Edit Rules", dotColor: "bg-blue-500" },
            { key: "SUMMARY", label: "Summary", dotColor: "bg-emerald-500" },
          ]}
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {activeTab === "EDIT" ? (
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
                  description="Define task approvers and the operational data employees can view."
                >
                  <SettingRow
                    title="Task approver"
                    hint="The task owner is always eligible. Anyone is exclusive; Custom allows up to three employees."
                    control={
                      <DwmsSelectDropdown
                        mode="multiple"
                        value={settings.approverRoles.filter(
                          (rule) => rule !== "OWNER",
                        )}
                        options={DWMS_APPROVER_RULE_OPTIONS}
                        onChange={updateApproverRules}
                        disabled={!canEdit}
                        placeholder="Select approver rules"
                        className="w-56 max-w-full"
                        contentClassName="w-full"
                        descriptionDisplay="tooltip"
                        selectionSummary="first-with-count"
                      />
                    }
                  />
                  {settings.approverRoles.includes("CUSTOM") && (
                    <SettingRow
                      title="Custom approver employees"
                      hint="Select up to 3 employees who can approve tasks."
                      control={
                        <EmployeeMultiSelectDropdown
                          value={settings.approverCustomEmployeeIds}
                          employees={employees}
                          onChange={(next) =>
                            updateSetting(
                              "approverCustomEmployeeIds",
                              next.slice(0, 3),
                            )
                          }
                          disabled={!canEdit}
                        />
                      }
                    />
                  )}
                  <SettingRow
                    title="Employee alert view"
                    hint="Controls access to department- and organization-targeted alert views. Personal and reporting-team alerts remain relationship-based."
                    control={
                      <ViewLevelSelect
                        value={settings.alertViewLevel}
                        onChange={(value) =>
                          updateSetting("alertViewLevel", value)
                        }
                        disabled={!canEdit}
                      />
                    }
                  />
                  <SettingRow
                    title="Employee analytics view"
                    hint="Controls personal, department, or organization dashboard access."
                    control={
                      <ViewLevelSelect
                        value={settings.analyticsViewLevel}
                        onChange={(value) =>
                          updateSetting("analyticsViewLevel", value)
                        }
                        disabled={!canEdit}
                      />
                    }
                  />
                </SectionCard>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!canEdit || saving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save DWMS settings"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                <Users className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Selected Values
                </p>
                <p className="text-xs text-slate-400">
                  Read-only snapshot of the current settings.
                </p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {summary.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <span className="text-xs text-slate-500">{item.label}</span>
                  <span className="text-xs font-semibold text-slate-700 sm:max-w-[70%] sm:text-right">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
