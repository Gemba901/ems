"use client";

import { useEffect, useState } from "react";
import { Zap, Thermometer, Clock } from "lucide-react";
import type { SteelMelting } from "@/services/steel-melting.service";

function formatElapsed(startedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Live operational readout for the Melting Operations workspace — only
 * real, already-recorded values (elapsed time from meltingStartTime, latest
 * logged power/temperature). Nothing here is fabricated; a value that
 * hasn't been logged yet shows "—", not a guess.
 */
export function OperationalMetrics({ melting }: { melting: SteelMelting }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const items = [
    {
      icon: Clock,
      label: "Elapsed",
      value: melting.meltingStartTime ? formatElapsed(melting.meltingStartTime, now) : "—",
    },
    {
      icon: Zap,
      label: "Power",
      value: melting.powerKwh !== null ? `${melting.powerKwh} kWh` : "—",
    },
    {
      icon: Thermometer,
      label: "Temperature",
      value: melting.temperatureCelsius !== null ? `${melting.temperatureCelsius}°C` : "—",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <item.icon className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{item.label}</p>
            <p className="text-lg font-bold text-slate-900 leading-tight truncate">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
