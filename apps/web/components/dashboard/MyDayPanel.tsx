"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bell, Info, Megaphone, Pin } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { NoticeService, type NoticeType } from "@/services/notice.service";
import { DwmsService } from "@/services/dwms.service";
import DwmsTodayTasksList, { useOpenTodayTasks } from "@/app/dwms/components/home/DwmsTodayTasksList";

const ROWS = 3;

type TabKey = "tasks" | "notices" | "approvals";

const NOTICE_ICON: Record<NoticeType, React.ElementType> = {
  ANNOUNCEMENT: Megaphone,
  REMINDER: Bell,
  INFO: Info,
  ALERT: AlertTriangle,
};

const NOTICE_ICON_COLOR: Record<NoticeType, string> = {
  ANNOUNCEMENT: "text-indigo-500",
  REMINDER: "text-amber-500",
  INFO: "text-slate-400",
  ALERT: "text-red-500",
};

function fmtShortDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function MoreFooter({ count, href, noun }: { count: number; href: string; noun: string }) {
  if (count <= 0) return null;
  return (
    <Link
      href={href}
      className="block border-t border-slate-100 px-4 py-2 text-xs text-slate-500 transition hover:text-slate-900"
    >
      +{count} more {noun}
    </Link>
  );
}

/** Home dashboard "My day": today's tasks, notices and pending approvals as tabs, a few rows each. */
export default function MyDayPanel({ dwmsEnabled }: { dwmsEnabled: boolean }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [selected, setSelected] = useState<TabKey | null>(null);

  const { openTasks, isLoading: tasksLoading } = useOpenTodayTasks(dwmsEnabled);

  const { data: notices = [], isLoading: noticesLoading } = useQuery({
    queryKey: ["notices"],
    queryFn: () => NoticeService.getNotices(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  const { data: approvals = [] } = useQuery({
    queryKey: ["dwms-approvals", "pending"],
    queryFn: async () => (await DwmsService.getApprovalTasks(accessToken!, "pending")).tasks ?? [],
    enabled: !!accessToken && dwmsEnabled,
    staleTime: 60_000,
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [];
  if (dwmsEnabled) tabs.push({ key: "tasks", label: "Tasks", count: openTasks.length });
  if (notices.length > 0) tabs.push({ key: "notices", label: "Notices", count: notices.length });
  if (dwmsEnabled && approvals.length > 0) {
    tabs.push({ key: "approvals", label: "Approvals", count: approvals.length });
  }

  if (!accessToken) return null;
  if (tabs.length === 0) {
    // Hold the space quietly while notices load rather than popping the panel in and out.
    return noticesLoading ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : null;
  }

  // Until the user picks a tab, open the first one that has something in it.
  const settled = !tasksLoading && !noticesLoading;
  const fallback = (settled && tabs.find((tab) => tab.count > 0)) || tabs[0];
  const active = tabs.find((tab) => tab.key === selected) ?? fallback;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-5 border-b border-slate-200 px-4">
        <h2 className="hidden py-3 text-sm font-semibold text-slate-900 sm:block">My day</h2>
        <div role="tablist" className="no-scrollbar flex min-w-0 gap-5 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.key === active.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelected(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 py-3 text-sm transition-colors ${
                  isActive
                    ? "border-slate-900 font-medium text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
        {dwmsEnabled && (
          <Link
            href={active.key === "approvals" ? "/dwms/approvalTasks" : "/dwms"}
            className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            Open DWMS <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div role="tabpanel">
        {active.key === "tasks" && <DwmsTodayTasksList maxItems={ROWS} />}

        {active.key === "notices" && (
          <>
            <ul className="divide-y divide-slate-100">
              {notices.slice(0, ROWS).map((notice) => {
                const Icon = NOTICE_ICON[notice.type];
                return (
                  <li key={notice.id} className="flex items-start gap-3 px-4 py-2.5" title={notice.body}>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${NOTICE_ICON_COLOR[notice.type]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                        <span className="truncate">{notice.title}</span>
                        {notice.pinned && <Pin className="h-3 w-3 shrink-0 text-slate-400" aria-label="Pinned" />}
                      </p>
                      {notice.body && <p className="truncate text-xs text-slate-500">{notice.body}</p>}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      {fmtShortDate(notice.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {notices.length > ROWS && (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                +{notices.length - ROWS} older notices
              </p>
            )}
          </>
        )}

        {active.key === "approvals" && (
          <>
            <ul className="divide-y divide-slate-100">
              {approvals.slice(0, ROWS).map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {task.ownerName ?? task.owner?.name ?? "Unknown"}
                      {task.dueDate && ` · Due ${fmtShortDate(task.dueDate)}`}
                    </p>
                  </div>
                  <Link
                    href="/dwms/approvalTasks"
                    className="inline-flex h-7 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
            <MoreFooter count={approvals.length - ROWS} href="/dwms/approvalTasks" noun="awaiting approval" />
          </>
        )}
      </div>
    </section>
  );
}
