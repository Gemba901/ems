"use client";

import Link from "next/link";
import { ArrowLeft, PackageSearch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function P03Header() {
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
          <div className="h-11 w-11 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <PackageSearch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Material Intake &amp; Receiving</h1>
            <p className="text-sm text-slate-500">P03 — Gate Arrival, Inspection, Weighing &amp; Yard Storage</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Receive raw material against a sourcing order, through inspection, acceptance, and release to stock.
            </p>
          </div>
        </div>

        <Link href="/steel/p03/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Material Intake
          </Button>
        </Link>
      </div>
    </div>
  );
}
