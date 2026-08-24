"use client";

import { Flame, Beaker, Clock, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { stageLabel } from "@/components/steel/p05/shared";
import type { SteelMelting } from "@/services/steel-melting.service";

// Read-only stat-chip row below the workflow stepper — mirrors the mockup's
// "Furnace | Steel Grade | Start Time | Phase" info strip. Every value comes
// straight off the already-loaded SteelMelting record; "Tap Est. Time" and
// "Tap Est. Temp." from the mockup are omitted because melting does not
// record a tap estimate — that belongs to P06 tapping authorization, not
// this module.
export function HeatInfoStrip({ melting }: { melting: SteelMelting }) {
  const items = [
    {
      icon: Flame,
      label: "Furnace",
      value: melting.furnace ? `${melting.furnace.code} — ${melting.furnace.name}` : "Not assigned",
    },
    {
      icon: Beaker,
      label: "Steel Grade",
      value: melting.chargePreparation?.actualGrade ?? "Not recorded",
    },
    {
      icon: Clock,
      label: "Start Time",
      value: melting.meltingStartTime ? new Date(melting.meltingStartTime).toLocaleString() : "Not started",
    },
    {
      icon: Activity,
      label: "Phase",
      value: stageLabel(melting.stage),
    },
  ];

  return (
    <Card>
      <CardContent className="py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2 min-w-0">
              <item.icon className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{item.label}</p>
                <p className="text-sm font-medium text-slate-800 truncate">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
