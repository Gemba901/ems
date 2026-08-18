"use client";

import Link from "next/link";
import { ArrowLeft, Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function P05Header() {
  return (
    <div className="space-y-3">
      <Link
        href="/steel"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Steel Home
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Melting</h1>
            <p className="text-sm text-slate-500">P05 — Melt the Prepared Charge & Manage the Furnace Heat</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Confirm furnace readiness, load and melt the released charge, and hand the heat over to refining.
            </p>
          </div>
        </div>

        <Link href="/steel/p05/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Melting Record
          </Button>
        </Link>
      </div>
    </div>
  );
}
