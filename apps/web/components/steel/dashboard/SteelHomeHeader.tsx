"use client";

import { useState } from "react";
import { Factory, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth.store";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Real, current-client date — not a fabricated/interactive filter, since
// nothing on this page is wired to a selectable date range yet.
function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function SteelHomeHeader() {
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState("");
  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <Factory className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">
              {greeting()}{firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Steel Manufacturing Home</h1>
            <p className="text-sm text-slate-500">Production control & real-time plant overview</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-400 hidden sm:inline">{todayLabel()}</span>
          <div className="relative w-56 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plan / order / charge..."
              className="pl-9"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
