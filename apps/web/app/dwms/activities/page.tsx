"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Loader2, PlusCircle, Search } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityItem,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import DwmsSelectDropdown from "../components/DwmsSelectDropdown";

const MANAGEMENT_ROLES = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

export default function DwmsActivitiesPage() {
  return (
    <ProtectedRoute>
      <ActivitiesContent />
    </ProtectedRoute>
  );
}

function ActivitiesContent() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();
  const [activities, setActivities] = useState<DwmsActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [message, setMessage] = useState<string | null>(null);
  const canManage = MANAGEMENT_ROLES.has(String(user?.roleLevel ?? "").toUpperCase());

  const loadActivities = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await DwmsService.getActivities(
        accessToken,
        status === "ALL" ? undefined : status,
      );
      setActivities(res.activities ?? []);
    } catch (error) {
      setMessage(getDwmsErrorMessage(error, "Failed to load activities"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, status]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((activity) =>
      [
        activity.name,
        activity.code,
        activity.mainDepartment?.name,
        activity.subDepartment,
        activity.workMethod,
        activity.purpose,
        activity.completionOutput,
        activity.evidenceRequired,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [activities, search]);

  async function archiveActivity(activity: DwmsActivityItem) {
    if (!accessToken || !canManage) return;
    setBusyId(activity.id);
    setMessage(null);
    try {
      await DwmsService.archiveActivity(accessToken, activity.id);
      setMessage(`Archived "${activity.name}".`);
      await loadActivities();
    } catch (error) {
      setMessage(getDwmsErrorMessage(error, "Failed to archive activity"));
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    return (
      <div className="px-6 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Activity management is available to Management, Admin, Super Admin, and HR users.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 px-4 pt-8 pb-10 sm:px-6 lg:px-8">
      <ActivityTabs active="activities" />

      {message && (
        <div className={`rounded-xl border p-4 text-xs ${message.includes("Failed") ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search process, code, department, SOP, output..."
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="md:w-56">
            <DwmsSelectDropdown
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
              placeholder="Status"
              triggerClassName="h-10 rounded-full border-slate-200 px-4 text-sm font-medium shadow-sm"
            />
          </div>
          <a href="/dwms/actions/new?mode=ACTIVITY" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 md:whitespace-nowrap">
            <PlusCircle className="h-4 w-4" />
            <span>Add Activity</span>
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-app bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activities...
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No activities found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Process</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Frequency</th>
                  <th className="px-5 py-3">Estimated Time</th>
                  <th className="px-5 py-3">Output / Documents</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredActivities.map((activity) => (
                  <tr
                    key={activity.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/dwms/activities/${activity.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/dwms/activities/${activity.id}`);
                      }
                    }}
                    className="cursor-pointer align-top transition hover:bg-slate-50/70 focus:bg-blue-50/60 focus:outline-none"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{activity.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{activity.code}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{activity.workMethod || "No SOP added"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{activity.mainDepartment?.name ?? "Unassigned"}</p>
                      <p className="mt-1 text-xs text-slate-400">{activity.subDepartment || "No sub-department"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{activity.frequency}</td>
                    <td className="px-5 py-4 text-slate-600">{activity.completionDeadline || "Not set"}</td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{activity.completionOutput || "Not set"}</p>
                      <p className="mt-1 text-xs text-slate-400">{activity.evidenceRequired || "No documents listed"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <ActivityStatusBadge status={activity.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === activity.id || activity.status === "ARCHIVED"}
                          onClick={(event) => {
                            event.stopPropagation();
                            void archiveActivity(activity);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Archive activity"
                          aria-label={`Archive ${activity.name}`}
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityTabs({ active }: { active: "activities" | "ingestions" }) {
  const tabs = [
    { key: "activities", label: "All Activities", href: "/dwms/activities" },
    {
      key: "ingestions",
      label: "Ingestion History",
      href: "/dwms/activities/ingestions",
    },
  ] as const;

  return (
    <div className="flex gap-6 overflow-x-auto border-b border-border-app select-none">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`relative flex items-center border-b-2 pb-3 text-sm font-semibold transition duration-150 ${
            active === tab.key
              ? "border-blue-500 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function ActivityStatusBadge({ status }: { status?: string | null }) {
  const archived = status === "ARCHIVED";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${archived ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-700"}`}>
      {status || "ACTIVE"}
    </span>
  );
}