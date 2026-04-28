"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { Settings, Bell, Shield, Database, Info, Lightbulb, Users, BarChart2, Archive } from "lucide-react";

type ToggleItem = { label: string; hint: string; type: "toggle"; defaultOn: boolean };
type NumberItem = { label: string; hint: string; type: "number"; defaultValue: string };
type SettingItem = ToggleItem | NumberItem;

interface Section {
  icon: React.ElementType;
  title: string;
  description: string;
  items: SettingItem[];
}

const SECTIONS: Section[] = [
  {
    icon: Bell,
    title: "Notifications",
    description: "Configure how and when you receive alerts for suggestion updates.",
    items: [
      { label: "New submission alert", hint: "Notify reviewers when a suggestion is submitted", type: "toggle", defaultOn: true },
      { label: "Status change alert", hint: "Notify the submitter when their suggestion status changes", type: "toggle", defaultOn: true },
      { label: "Clarification request", hint: "Notify employee when clarification is needed", type: "toggle", defaultOn: true },
    ],
  },
  {
    icon: Shield,
    title: "Access & Permissions",
    description: "Define who can submit, review, and manage suggestions.",
    items: [
      { label: "Anonymous submissions", hint: "Allow employees to submit without revealing their identity", type: "toggle", defaultOn: true },
      { label: "HOD review required", hint: "Require HOD approval before escalation to management", type: "toggle", defaultOn: false },
      { label: "Employee can view reviews", hint: "Show reviewer notes to the suggestion author", type: "toggle", defaultOn: true },
    ],
  },
  {
    icon: Database,
    title: "Data & Retention",
    description: "Manage how suggestion data is stored and cleaned up.",
    items: [
      { label: "Auto-archive after days", hint: "Automatically archive approved/rejected suggestions", type: "number", defaultValue: "90" },
      { label: "Retention period (months)", hint: "How long to keep archived suggestions before deletion", type: "number", defaultValue: "24" },
    ],
  },
];

function Toggle({ defaultOn }: { defaultOn: boolean }) {
  return (
    <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${defaultOn ? "bg-blue-600" : "bg-slate-200"}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${defaultOn ? "translate-x-4" : "translate-x-1"}`} />
    </div>
  );
}

function SettingControl({ item }: { item: SettingItem }) {
  if (item.type === "toggle") {
    return (
      <div className="opacity-60 cursor-not-allowed">
        <Toggle defaultOn={item.defaultOn} />
      </div>
    );
  }
  return (
    <input
      disabled
      defaultValue={item.defaultValue}
      className="w-20 text-center text-sm font-semibold border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-500 cursor-not-allowed"
    />
  );
}

const MODULE_STATS = [
  { label: "Module",  value: "SIMS",         icon: Lightbulb },
  { label: "Version", value: "1.0.0",         icon: BarChart2 },
  { label: "Access",  value: "Admin only",    icon: Users },
  { label: "Archive", value: "Auto (90 days)", icon: Archive },
];

export default function SimsSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Settings className="h-5 w-5 text-slate-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">SIMS Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage suggestion system preferences and access rules.</p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Left — settings sections */}
          <div className="lg:col-span-2 space-y-5">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">
                Settings configuration is coming soon. The values shown below reflect the current system defaults.
                Contact your system administrator to change these settings.
              </p>
            </div>

            {SECTIONS.map((section) => (
              <div key={section.title} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-50">
                  <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center">
                    <section.icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">{section.title}</h2>
                    <p className="text-xs text-slate-400">{section.description}</p>
                  </div>
                </div>

                <div className="divide-y divide-slate-50">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between px-6 py-4">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm font-medium text-slate-700">{item.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{item.hint}</p>
                      </div>
                      <SettingControl item={item} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right — module info panel */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-50">
                <p className="text-sm font-bold text-slate-800">Module Overview</p>
                <p className="text-xs text-slate-400 mt-0.5">Current configuration snapshot</p>
              </div>
              <div className="divide-y divide-slate-50">
                {MODULE_STATS.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                        <Icon className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <span className="text-xs text-slate-500">{label}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm px-6 py-5">
              <p className="text-sm font-bold text-slate-800 mb-1">What is SIMS?</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                The Suggestion & Idea Management System (SIMS) enables employees to submit improvement ideas
                aligned to the QCDSMT framework. Reviewers can approve, reject, or request clarification,
                and implemented suggestions are tracked for performance reporting.
              </p>
            </div>

            <div className="text-center py-2">
              <p className="text-xs text-slate-400">Full settings management available in a future update.</p>
            </div>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
