"use client";

import { PageHeader } from "@/components/patterns/PageHeader";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/patterns/LoadingState";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
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
    <div className="overflow-visible rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-border overflow-visible">
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
    <div className="relative flex flex-col gap-4 overflow-visible px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="relative w-full min-w-0 overflow-visible md:w-auto md:max-w-[560px] md:shrink-0">
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
      className="w-full md:w-56 md:max-w-full"
      triggerClassName="min-h-11 rounded-xl px-3 py-2 text-sm md:rounded-full"
      contentClassName="left-0 right-0 w-full sm:left-auto sm:w-80"
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
    <div className="w-full md:w-56">
      <DwmsSelectDropdown
        value={value}
        options={DWMS_VIEW_LEVEL_OPTIONS}
        onChange={(next) =>
          onChange(next as DwmsSettingsState["alertViewLevel"])
        }
        disabled={disabled}
        placeholder="Select view level"
        triggerClassName="rounded-2xl border-border px-4 py-2.5 text-sm text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
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
          setError(getDwmsErrorMessage(cause, "Failed to load RTM settings"));
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
      setSuccess("RTM settings saved successfully.");
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to save RTM settings"));
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
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader title="RTM Settings" />
      <div className="space-y-6">
        <DwmsTabHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { key: "EDIT", label: "Edit Rules", dotColor: "bg-info" },
            { key: "SUMMARY", label: "Summary", dotColor: "bg-success" },
          ]}
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-danger bg-danger-subtle px-4 py-3 text-sm text-danger"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-success bg-success-subtle px-4 py-3 text-sm text-success"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {activeTab === "EDIT" ? (
          <div className="space-y-6">
            {loading ? (
              <LoadingState label="Loading RTM settings…" />
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
                        className="w-full md:w-56 md:max-w-full"
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
                <div className="flex justify-stretch pt-1 sm:justify-end">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!canEdit || saving}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-info px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-2xl"
                  >
                    {saving ? "Saving..." : "Save RTM settings"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card px-4 py-5 shadow-sm sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  Selected Values
                </p>
                <p className="text-xs text-muted-foreground">
                  Read-only snapshot of the current settings.
                </p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-border">
              {summary.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-semibold text-foreground sm:max-w-[70%] sm:text-right">
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
