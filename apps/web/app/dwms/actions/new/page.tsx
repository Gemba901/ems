"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import ActivityForm from "../../components/actions/ActivityForm";
import CreateTaskAction from "../../components/actions/CreateTaskAction";
import DwmsAlertForm from "../../components/actions/DwmsAlertForm";

type ActionMode = "ACTIVITY" | "TASK" | "ALERT";

const ACTIVITY_CREATOR_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGEMENT",
  "HR",
  "HOD",
]);

const ACTION_TABS: Array<{ key: ActionMode; label: string }> = [
  { key: "ACTIVITY", label: "Activity" },
  { key: "TASK", label: "Task" },
  { key: "ALERT", label: "Alert" },
];

export default function CreateActionPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-bg-app p-8 text-center text-sm text-muted-app">
            Loading...
          </div>
        }
      >
        <CreateActionContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function CreateActionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const canCreateActivities = ACTIVITY_CREATOR_ROLES.has(
    String(user?.roleLevel ?? "").toUpperCase(),
  );
  const visibleTabs = canCreateActivities
    ? ACTION_TABS
    : ACTION_TABS.filter((tab) => tab.key !== "ACTIVITY");
  const rawMode = searchParams.get("mode")?.toUpperCase();
  const requestedMode: ActionMode =
    rawMode === "ALERT"
      ? "ALERT"
      : rawMode === "ACTIVITY"
        ? "ACTIVITY"
        : "TASK";
  const activeMode = visibleTabs.some((tab) => tab.key === requestedMode)
    ? requestedMode
    : "TASK";

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 pb-10 pt-6 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="flex gap-5 overflow-x-auto border-b border-border-app select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() =>
              router.replace(`/dwms/actions/new?mode=${tab.key}`, {
                scroll: false,
              })
            }
            aria-pressed={activeMode === tab.key}
            className={`relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 pb-2 pt-1 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              activeMode === tab.key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeMode === "ACTIVITY" ? (
        <ActivityForm />
      ) : activeMode === "TASK" ? (
        <CreateTaskAction />
      ) : (
        <DwmsAlertForm
          onCancel={() => router.push("/dwms/alerts")}
          onCreated={() => router.push("/dwms/alerts")}
        />
      )}
    </div>
  );
}
