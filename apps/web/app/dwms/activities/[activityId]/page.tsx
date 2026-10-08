"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Save, Workflow, X } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityItem,
  type UpdateActivityContentPayload,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import {
  ActivityRelationChain,
  buildActivityChains,
  getChildActivities,
} from "../../components/ActivityRelationChain";
import { formatOrganizationDateKey } from "../../utils/organizationDate";

const ACTIVITY_EDITOR_ROLES = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

type ActivityEditForm = Required<
  Pick<UpdateActivityContentPayload, "workMethod" | "completionOutput" | "remarks">
> &
  Pick<
    UpdateActivityContentPayload,
    "purpose" | "startTrigger" | "evidenceRequired"
  >;

export default function ActivityDetailPage() {
  return (
    <ProtectedRoute>
      <ActivityDetailContent />
    </ProtectedRoute>
  );
}

function ActivityDetailContent() {
  const router = useRouter();
  const params = useParams<{ activityId: string }>();
  const { accessToken, user } = useAuthStore();
  const [activities, setActivities] = useState<DwmsActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ActivityEditForm | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activityId = params.activityId;

  const loadActivities = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await DwmsService.getActivities(accessToken);
      setActivities(res.activities ?? []);
    } catch (error) {
      setMessage(getDwmsErrorMessage(error, "Failed to load activity detail"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const activity = useMemo(
    () => activities.find((item) => item.id === activityId) ?? null,
    [activities, activityId],
  );

  const chains = useMemo(
    () => activity ? buildActivityChains(activity, activities) : [],
    [activities, activity],
  );

  const childActivities = useMemo(
    () => activity ? getChildActivities(activity.id, activities) : [],
    [activities, activity],
  );

  const canEdit =
    !!activity &&
    activity.status !== "ARCHIVED" &&
    ACTIVITY_EDITOR_ROLES.has(String(user?.roleLevel ?? "").toUpperCase());

  function beginEditing() {
    if (!activity || !canEdit) return;
    setEditForm({
      workMethod: activity.workMethod ?? "",
      purpose: activity.purpose ?? "",
      startTrigger: activity.startTrigger ?? "",
      completionOutput: activity.completionOutput ?? "",
      evidenceRequired: activity.evidenceRequired ?? "",
      remarks: activity.remarks ?? "",
    });
    setMessage(null);
    setSuccessMessage(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditForm(null);
    setMessage(null);
  }

  function setEditField<K extends keyof ActivityEditForm>(
    key: K,
    value: ActivityEditForm[K],
  ) {
    setEditForm((current) => (current ? { ...current, [key]: value } : current));
    setMessage(null);
  }

  async function saveActivity() {
    if (!accessToken || !activity || !editForm || !canEdit) return;
    if (
      !editForm.workMethod.trim() ||
      !editForm.completionOutput.trim() ||
      !editForm.remarks.trim()
    ) {
      setMessage("Description / SOP, Expected output, and Remarks are required.");
      return;
    }

    setSaving(true);
    setMessage(null);
    setSuccessMessage(null);
    try {
      const response = await DwmsService.updateActivity(accessToken, activity.id, {
        workMethod: editForm.workMethod.trim(),
        purpose: editForm.purpose?.trim() ?? "",
        startTrigger: editForm.startTrigger?.trim() ?? "",
        completionOutput: editForm.completionOutput.trim(),
        evidenceRequired: editForm.evidenceRequired?.trim() ?? "",
        remarks: editForm.remarks.trim(),
      });
      if (response.activity) {
        setActivities((current) =>
          current.map((item) =>
            item.id === response.activity?.id ? response.activity : item,
          ),
        );
      } else {
        await loadActivities();
      }
      setEditing(false);
      setEditForm(null);
      setSuccessMessage(
        `Activity updated. ${response.updatedFutureTasks ?? 0} future pending task${response.updatedFutureTasks === 1 ? "" : "s"} refreshed.`,
      );
    } catch (error) {
      setMessage(getDwmsErrorMessage(error, "Failed to update activity"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full space-y-6 px-4 pt-8 pb-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.push("/dwms/activities")}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Activity Master
        </button>
        <Link
          href="/dwms/actions/new?mode=ACTIVITY"
          className="inline-flex h-10 w-fit items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Add Activity
        </Link>
      </div>

      {message && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {message}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border-app bg-white py-16 text-sm text-slate-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading activity detail...
        </div>
      ) : !activity ? (
        <div className="rounded-2xl border border-border-app bg-white p-8 text-sm text-slate-500 shadow-sm">
          Activity not found.
        </div>
      ) : (
        <div className="space-y-6">
          <header className="rounded-2xl border border-border-app bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Activity Detail</p>
                  <ActivityStatusBadge status={activity.status} />
                </div>
                <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">{activity.name}</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">{activity.code}</p>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={cancelEditing}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" /> Cancel
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveActivity()}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? "Saving..." : "Save changes"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={beginEditing}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      <Pencil className="h-4 w-4" /> Edit Activity
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <main className="space-y-6">
              <DetailSection title="Activity Information">
                <InfoGrid
                  rows={[
                    ["Company unit", activity.companyUnitName],
                    ["Scope", activity.scope?.replaceAll("_", " ")],
                    ["Scope target", activity.scopeTarget],
                    ["Main department", activity.mainDepartment?.name],
                    ["Sub department", activity.subDepartment],
                    ["Gemba section", activity.gembaSection],
                    ["Process area", activity.processArea],
                    ["Frequency", activity.frequency],
                    ["Estimated time", activity.completionDeadline],
                    ["Effective from", formatDate(activity.effectiveFrom)],
                  ]}
                />
              </DetailSection>

              <DetailSection title="Work Details">
                {editing && editForm ? (
                  <div className="space-y-4">
                    <EditableLongField label="Description / SOP" required value={editForm.workMethod} onChange={(value) => setEditField("workMethod", value)} />
                    <EditableLongField label="Purpose" value={editForm.purpose ?? ""} onChange={(value) => setEditField("purpose", value)} />
                    <EditableLongField label="Start trigger" value={editForm.startTrigger ?? ""} onChange={(value) => setEditField("startTrigger", value)} />
                    <EditableLongField label="Expected output" required value={editForm.completionOutput} onChange={(value) => setEditField("completionOutput", value)} />
                    <EditableLongField label="Required document / evidence instructions" value={editForm.evidenceRequired ?? ""} onChange={(value) => setEditField("evidenceRequired", value)} />
                    <EditableLongField label="Remarks" required value={editForm.remarks} onChange={(value) => setEditField("remarks", value)} />
                    <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                      Saved changes apply to pending task occurrences scheduled after today. Current and historical work remains unchanged.
                    </p>
                  </div>
                ) : (
                  <>
                    <LongField label="Work method / SOP" value={activity.workMethod} />
                    <LongField label="Purpose" value={activity.purpose} />
                    <LongField label="Start trigger" value={activity.startTrigger} />
                    <LongField label="Completion output" value={activity.completionOutput} />
                    <LongField label="Evidence required" value={activity.evidenceRequired} />
                    <LongField label="Remarks" value={activity.remarks} />
                  </>
                )}
              </DetailSection>

              <DetailSection title="Responsibility">
                <InfoGrid
                  rows={[
                    ["Responsible employee", personLabel(activity.primaryResponsibleEmployee)],
                    ["Responsible designation", activity.primaryResponsibleDesignation],
                  ]}
                />
              </DetailSection>
            </main>

            <aside className="h-fit rounded-2xl border border-border-app bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Workflow className="h-4 w-4 text-blue-600" />
                Activity Relation
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Blueprint relation from the first prerequisite activity to the last dependent activity.
              </p>

              <div className="mt-5 space-y-4">
                {chains.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    This activity has no parent or child activity.
                  </div>
                ) : (
                  chains.map((chain, index) => (
                    <ActivityRelationChain
                      key={`${chain.map((item) => item.id).join("-")}-${index}`}
                      chain={chain}
                      currentActivityId={activity.id}
                      mode="blueprint"
                      getItemHref={(item) => `/dwms/activities/${item.id}`}
                    />
                  ))
                )}
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Direct links</p>
                <InfoGrid
                  rows={[
                    ["Parent activity", activity.parentActivities?.[0]?.name],
                    ["Child activities", childActivities.length ? childActivities.map((child) => child.name).join(", ") : null],
                  ]}
                />
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-app bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-sm font-bold text-slate-950">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <div className="mt-1 text-sm font-medium text-slate-800">{value || "Not set"}</div>
        </div>
      ))}
    </div>
  );
}

function LongField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{value?.trim() || "Not set"}</p>
    </div>
  );
}

function EditableLongField({
  label,
  value,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}{required ? " *" : ""}
      </span>
      <textarea
        value={value}
        required={required}
        rows={label === "Description / SOP" ? 5 : 3}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      />
    </label>
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

function personLabel(person?: { name?: string | null; email?: string | null } | null) {
  if (!person?.name && !person?.email) return null;
  return [person.name, person.email ? `(${person.email})` : null].filter(Boolean).join(" ");
}

function formatDate(value?: string | null) {
  return formatOrganizationDateKey(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
