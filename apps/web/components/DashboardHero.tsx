"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useOrgModules } from "@/hooks/useOrgModules";
import { CommitteeService } from "@/services/committee.service";
import { ClockCard } from "@/components/work/attendance/ClockCard";
import { apiClient } from "@/lib/api-client";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function currentWeek(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
}

interface DailyQuote {
  quote: string;
  author: string;
}

export default function DashboardHero() {
  const { user, accessToken } = useAuthStore();
  const { hasModule } = useOrgModules();
  const [dailyQuote, setDailyQuote] = useState<DailyQuote | null>(null);

  const { data: myCommittees = [] } = useQuery({
    queryKey: ["my-committees"],
    queryFn: () => CommitteeService.getMyCommittees(accessToken!),
    enabled: !!accessToken && hasModule("SIMS"),
  });

  const todayShort = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  const todayFull = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const role      = user?.roleLevel?.replace(/_/g, " ") ?? "";
  const week      = currentWeek();

  useEffect(() => {
    if (!accessToken) return;
    apiClient("/api/quotes/daily", {}, accessToken)
      .then((r) => r.json())
      .then((data) => {
        if (data.quote) setDailyQuote({ quote: data.quote, author: data.author });
      })
      .catch(() => {});
  }, [accessToken]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-6 sm:px-8 sm:py-8 shadow-lg">
      <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-primary-foreground/10" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-primary-foreground/10" />
      <div className="pointer-events-none absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l from-primary-foreground/5 to-transparent" />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-primary-foreground/70 text-xs mb-2">
            <span className="sm:hidden">{todayShort} · Week {week}</span>
            <span className="hidden sm:inline">{todayFull} · Week {week}</span>
          </p>
          <h1 className="text-xl sm:text-3xl font-bold text-primary-foreground tracking-tight">
            {greeting()}, {firstName}.
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-primary-foreground/15 text-primary-foreground px-2.5 py-1 rounded-full capitalize">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/80 inline-block" />
              {role.toLowerCase()}
            </span>
            {user?.jobTitle && (
              <span className="text-xs font-medium bg-primary-foreground/10 text-primary-foreground/80 px-2.5 py-1 rounded-full">
                {user.jobTitle}
              </span>
            )}
            {myCommittees.length > 0 && (
              <span
                title={myCommittees.map((c) => c.name).join(", ")}
                className="flex items-center gap-1.5 text-xs font-semibold bg-primary-foreground/15 text-primary-foreground px-2.5 py-1 rounded-full"
              >
                <Users2 className="h-3 w-3" />
                {myCommittees.length === 1 ? myCommittees[0].name : `${myCommittees.length} committees`}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-4 sm:max-w-xs sm:shrink-0 sm:items-end">
          {dailyQuote && (
            <div className="hidden text-right sm:block">
              <p className="text-primary-foreground/80 text-sm italic leading-relaxed break-words">
                &ldquo;{dailyQuote.quote}&rdquo;
              </p>
              <p className="text-primary-foreground/60 text-[10px] uppercase tracking-widest mt-2 font-semibold">
                — {dailyQuote.author}
              </p>
            </div>
          )}
          {hasModule("WORK") && <ClockCard compact />}
        </div>
      </div>
    </div>
  );
}
