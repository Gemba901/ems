"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
import ActivityTabs from "./ActivityTabs";
import {
  DwmsDataField,
  DwmsMobileDataCard,
  DwmsPageContainer,
  DwmsResponsiveToolbar,
} from "../components/DwmsResponsive";

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
  const role = String(user?.roleLevel ?? "").toUpperCase();
  const canManage = MANAGEMENT_ROLES.has(role);

  useEffect(() => {
    if (role === "HOD") router.replace("/dwms/activities/employees");
  }, [role, router]);

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

  if (role === "HOD") {
    return (
      <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening employee activities...
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-6 py-10">
        <div className="rounded-2xl border border-warning bg-warning-subtle p-6 text-sm text-warning">
          Activity management is available to Management, Admin, Super Admin, and HR users.
        </div>
      </div>
    );
  }

  return (
    <DwmsPageContainer className="pb-10">
      <ActivityTabs active="activities" />

      {message && (
        <div className={`rounded-xl border p-4 text-xs ${message.includes("Failed") ? "border-danger bg-danger-subtle text-danger" : "border-success bg-success-subtle text-success"}`}>
          {message}
        </div>
      )}

      <DwmsResponsiveToolbar className="md:flex-nowrap">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search process, code, department, SOP, output..."
            className="min-h-11 w-full rounded-xl border border-border bg-card py-2.5 pr-4 pl-10 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-info focus:ring-2 focus:ring-info sm:rounded-full"
          />
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="md:w-56">
            <DwmsSelectDropdown
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
              placeholder="Status"
              triggerClassName="h-10 rounded-full border-border px-4 text-sm font-medium shadow-sm"
            />
          </div>
          <a href="/dwms/actions/new?mode=ACTIVITY" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-info px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-info md:whitespace-nowrap md:rounded-full">
            <PlusCircle className="h-4 w-4" />
            <span>Add Activity</span>
          </a>
        </div>
      </DwmsResponsiveToolbar>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activities...
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No activities found.</div>
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">
            {filteredActivities.map((activity) => (
              <DwmsMobileDataCard
                key={activity.id}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-foreground">{activity.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{activity.code}</p>
                  </div>
                  <ActivityStatusBadge status={activity.status} />
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{activity.workMethod || "No SOP added"}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <DwmsDataField label="Department">{activity.mainDepartment?.name ?? "Unassigned"}</DwmsDataField>
                  <DwmsDataField label="Frequency">{activity.frequency}</DwmsDataField>
                  <DwmsDataField label="Estimated time">{activity.completionDeadline || "Not set"}</DwmsDataField>
                  <DwmsDataField label="Output">{activity.completionOutput || "Not set"}</DwmsDataField>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => router.push(`/dwms/activities/${activity.id}`)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-info px-3 text-sm font-semibold text-primary-foreground"
                  >
                    View details
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={busyId === activity.id || activity.status === "ARCHIVED"}
                    onClick={() => void archiveActivity(activity)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-muted-foreground disabled:opacity-40"
                  >
                    <Archive className="h-4 w-4" /> Archive
                  </Button>
                </div>
              </DwmsMobileDataCard>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-full divide-y divide-border text-sm">
              <TableHeader className="bg-muted text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <TableRow>
                  <TableHead className="px-5 py-3">Process</TableHead>
                  <TableHead className="px-5 py-3">Department</TableHead>
                  <TableHead className="px-5 py-3">Frequency</TableHead>
                  <TableHead className="px-5 py-3">Estimated Time</TableHead>
                  <TableHead className="px-5 py-3">Output / Documents</TableHead>
                  <TableHead className="px-5 py-3">Status</TableHead>
                  <TableHead className="px-5 py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {filteredActivities.map((activity) => (
                  <TableRow
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
                    className="cursor-pointer align-top transition hover:bg-muted/70 focus:bg-info-subtle/60 focus:outline-none"
                  >
                    <TableCell className="px-5 py-4">
                      <p className="font-semibold text-foreground">{activity.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{activity.code}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{activity.workMethod || "No SOP added"}</p>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">
                      <p>{activity.mainDepartment?.name ?? "Unassigned"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{activity.subDepartment || "No sub-department"}</p>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">{activity.frequency}</TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">{activity.completionDeadline || "Not set"}</TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">
                      <p>{activity.completionOutput || "Not set"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{activity.evidenceRequired || "No documents listed"}</p>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <ActivityStatusBadge status={activity.status} />
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          type="button"
                          disabled={busyId === activity.id || activity.status === "ARCHIVED"}
                          onClick={(event) => {
                            event.stopPropagation();
                            void archiveActivity(activity);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                          title="Archive activity"
                          aria-label={`Archive ${activity.name}`}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </div>
    </DwmsPageContainer>
  );
}

function ActivityStatusBadge({ status }: { status?: string | null }) {
  const archived = status === "ARCHIVED";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${archived ? "bg-muted text-muted-foreground" : "bg-info-subtle text-info"}`}>
      {status || "ACTIVE"}
    </span>
  );
}
