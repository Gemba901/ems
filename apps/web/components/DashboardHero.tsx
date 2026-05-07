"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { BarChart3, Building2, FileEdit, ListChecks, Users } from "lucide-react";

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

function padTwo(n: number) {
  return String(n).padStart(2, "0");
}

const ROLE_CONTEXT: Record<string, { subtitle: string }> = {
  SUPER_ADMIN: { subtitle: "Full platform access across all organizations" },
  ADMIN:       { subtitle: "Managing your organization's people & platform" },
  MANAGEMENT:  { subtitle: "Organization performance & team insights" },
  HR:          { subtitle: "People operations & employee management" },
  HOD:         { subtitle: "Leading your department & reviewing suggestions" },
  EMPLOYEE:    { subtitle: "Your workspace — share ideas, track progress" },
};

interface DailyQuote {
  quote: string;
  author: string;
}

export default function DashboardHero() {
  const { user, accessToken } = useAuthStore();
  const [clock, setClock] = useState("");
  const [dailyQuote, setDailyQuote] = useState<DailyQuote | null>(null);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const role      = user?.roleLevel?.replace(/_/g, " ") ?? "";
  const roleCtx   = ROLE_CONTEXT[user?.roleLevel ?? ""] ?? null;
  const week      = currentWeek();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(`${padTwo(now.getHours())}:${padTwo(now.getMinutes())}`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/quotes/daily`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.quote) setDailyQuote({ quote: data.quote, author: data.author });
      })
      .catch(() => {});
  }, [accessToken]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-8 py-8 shadow-lg">
      <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-indigo-500/10" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-blue-500/10" />
      <div className="pointer-events-none absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l from-indigo-600/5 to-transparent" />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-3">
            Gemba Performance Management System
          </p>
          <p className="text-slate-400 text-sm mb-1 flex items-center gap-0">
            {today}
            <span className="mx-2 text-slate-600">·</span>
            <span className="text-slate-500">Week {week}</span>
            <span className="mx-2 text-slate-600">·</span>
            <span className="text-slate-400 font-mono tabular-nums">{clock}</span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {greeting()}, {firstName}.
          </h1>
          {roleCtx && (
            <p className="text-slate-400 text-sm mt-1">{roleCtx.subtitle}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-500/30 text-indigo-200 px-2.5 py-1 rounded-full capitalize">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-300 inline-block" />
              {role.toLowerCase()}
            </span>
          </div>
        </div>

        {dailyQuote && (
          <div className="shrink-0 max-w-xs text-right hidden sm:block">
            <p className="text-slate-300 text-sm italic leading-relaxed">
              "{dailyQuote.quote}"
            </p>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest mt-2 font-semibold">
              — {dailyQuote.author}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
