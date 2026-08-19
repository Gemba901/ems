"use client";

import React from "react";
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import type { DwmsActivityItem, DwmsTaskStatus } from "@/services/dwms.service";

export type ActivityChain = DwmsActivityItem[];

type ActivityRelationChainProps = {
  chain: ActivityChain;
  currentActivityId: string;
  mode: "blueprint" | "instance";
  getItemHref?: (activity: DwmsActivityItem) => string | null | undefined;
  getItemStatus?: (activity: DwmsActivityItem) => DwmsTaskStatus | string | null | undefined;
};

function labelStatus(status?: string | null) {
  return String(status ?? "IN_PROGRESS")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isCompletedStatus(status?: DwmsTaskStatus | string | null) {
  return status === "DONE" || status === "NOT_APPLICABLE";
}
export function ActivityRelationChain({
  chain,
  currentActivityId,
  mode,
  getItemHref,
  getItemStatus,
}: ActivityRelationChainProps) {
  const firstIncompleteIndex = mode === "instance"
    ? chain.findIndex((activity) => !isCompletedStatus(getItemStatus?.(activity)))
    : -1;
  const completedCount = mode === "instance"
    ? chain.filter((activity) => isCompletedStatus(getItemStatus?.(activity))).length
    : 0;
  const progressPercent = chain.length === 0
    ? 0
    : Math.round((completedCount / chain.length) * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
      {mode === "instance" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Progress</p>
            <p className="text-xs font-semibold text-slate-600">
              {completedCount} of {chain.length} complete
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </>
      )}

      <div className={mode === "instance" ? "mt-5 space-y-0" : "space-y-0"}>
        {chain.map((activity, index) => {
          const isCurrent = activity.id === currentActivityId;
          const status = getItemStatus?.(activity);
          const isCompleted = mode === "instance" && isCompletedStatus(status);
          const isFirstIncomplete = mode === "instance" && index === firstIncompleteIndex;
          const isLocked = mode === "instance" && firstIncompleteIndex >= 0 && index > firstIncompleteIndex;

          const href = getItemHref?.(activity);
          const content = (
            <div className="relative grid min-h-[4.5rem] grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3">
              <div className="relative flex h-full items-center justify-center">
                <span
                  className={[
                    "relative z-10 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-xs",
                    isCompleted
                      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                      : isCurrent
                        ? "border-blue-400 bg-blue-50 text-blue-600"
                        : isLocked
                          ? "border-slate-200 bg-slate-50 text-slate-400"
                          : "border-slate-200 bg-white text-slate-500",
                  ].join(" ")}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isLocked ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                {index < chain.length - 1 && (
                  <span className="absolute left-1/2 top-1/2 h-full w-px -translate-x-1/2 bg-slate-200" />
                )}
              </div>
              <div
                className={[
                  "min-w-0 rounded-lg px-3 py-2",
                  isCurrent ? "bg-blue-50 ring-1 ring-blue-200" : "",
                ].join(" ")}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={[
                        "truncate text-sm font-semibold",
                        isCurrent
                          ? "text-blue-700"
                          : isLocked
                            ? "text-slate-500"
                            : "text-slate-900",
                      ].join(" ")}
                    >
                      {activity.name}
                    </p>
                    <p
                      className={[
                        "mt-0.5 truncate text-xs font-medium",
                        isLocked ? "text-slate-400" : "text-slate-500",
                      ].join(" ")}
                    >
                      {activity.code || "No code"}
                    </p>
                  </div>
                  {isFirstIncomplete && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">
                      {labelStatus(status)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );

          return href ? (
            <Link key={activity.id} href={href} className="block cursor-pointer rounded-lg outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-200">
              {content}
            </Link>
          ) : (
            <div key={activity.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

export function buildActivityChains(
  activity: DwmsActivityItem,
  activities: DwmsActivityItem[],
) {
  const activityById = new Map(activities.map((item) => [item.id, item]));
  const ancestors = getAncestorPath(activity, activityById);
  const descendants = getDescendantPaths(
    activity,
    activities,
    new Set([activity.id]),
  );

  if (
    ancestors.length === 1 &&
    descendants.length === 1 &&
    descendants[0].length === 1
  ) {
    return [];
  }

  return descendants.map((path) => [...ancestors.slice(0, -1), ...path]);
}

function getAncestorPath(
  activity: DwmsActivityItem,
  activityById: Map<string, DwmsActivityItem>,
) {
  const path = [activity];
  const visited = new Set([activity.id]);
  let current = activity;

  while (true) {
    const parentId =
      current.parentActivityIds?.[0] ?? current.parentActivities?.[0]?.id;
    if (!parentId || visited.has(parentId)) break;
    const parent = activityById.get(parentId);
    if (!parent) break;
    path.unshift(parent);
    visited.add(parent.id);
    current = parent;
  }

  return path;
}

function getDescendantPaths(
  activity: DwmsActivityItem,
  activities: DwmsActivityItem[],
  visited: Set<string>,
): ActivityChain[] {
  const children = getChildActivities(activity.id, activities).filter(
    (child) => !visited.has(child.id),
  );
  if (children.length === 0) return [[activity]];

  return children.flatMap((child) => {
    const nextVisited = new Set(visited);
    nextVisited.add(child.id);
    return getDescendantPaths(child, activities, nextVisited).map((path) => [
      activity,
      ...path,
    ]);
  });
}

export function getChildActivities(
  activityId: string,
  activities: DwmsActivityItem[],
) {
  return activities
    .filter((activity) => activity.parentActivityIds?.includes(activityId))
    .sort((a, b) => a.name.localeCompare(b.name));
}
