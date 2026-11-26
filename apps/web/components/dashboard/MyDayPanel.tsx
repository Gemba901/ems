"use client";

import { Button } from "@/components/ui/button";
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
  ANNOUNCEMENT: "text-primary",
  REMINDER: "text-warning",
  INFO: "text-muted-foreground",
  ALERT: "text-danger",
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
      className="block border-t border-border px-4 py-2 text-xs text-muted-foreground transition hover:text-foreground"
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
    return noticesLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : null;
  }

  // Until the user picks a tab, open the first one that has something in it.
  const settled = !tasksLoading && !noticesLoading;
  const fallback = (settled && tabs.find((tab) => tab.count > 0)) || tabs[0];
  const active = tabs.find((tab) => tab.key === selected) ?? fallback;

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-5 border-b border-border px-4">
        <h2 className="hidden py-3 text-sm font-semibold text-foreground sm:block">My day</h2>
        <div role="group" aria-label="My day views" className="no-scrollbar flex min-w-0 gap-5 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.key === active.key;
            return (
              <Button
                key={tab.key}
                type="button"
                variant="ghost"
                aria-pressed={isActive}
                onClick={() => setSelected(tab.key)}
                className={`flex h-auto shrink-0 items-center gap-1.5 rounded-none border-b-2 py-3 text-sm transition-colors ${
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </Button>
            );
          })}
        </div>
        {dwmsEnabled && (
          <Link
            href={active.key === "approvals" ? "/dwms/approvalTasks" : "/dwms"}
            className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Open RTM <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div role="region" aria-label={active.label}>
        {active.key === "tasks" && <DwmsTodayTasksList maxItems={ROWS} />}

        {active.key === "notices" && (
          <>
            <ul className="divide-y divide-border">
              {notices.slice(0, ROWS).map((notice) => {
                const Icon = NOTICE_ICON[notice.type];
                return (
                  <li key={notice.id} className="flex items-start gap-3 px-4 py-2.5" title={notice.body}>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${NOTICE_ICON_COLOR[notice.type]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <span className="truncate">{notice.title}</span>
                        {notice.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Pinned" />}
                      </p>
                      {notice.body && <p className="truncate text-xs text-muted-foreground">{notice.body}</p>}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtShortDate(notice.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {notices.length > ROWS && (
              <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                +{notices.length - ROWS} older notices
              </p>
            )}
          </>
        )}

        {active.key === "approvals" && (
          <>
            <ul className="divide-y divide-border">
              {approvals.slice(0, ROWS).map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.ownerName ?? task.owner?.name ?? "Unknown"}
                      {task.dueDate && ` · Due ${fmtShortDate(task.dueDate)}`}
                    </p>
                  </div>
                  <Link
                    href="/dwms/approvalTasks"
                    className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground transition hover:bg-muted"
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
