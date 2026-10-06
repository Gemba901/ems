import { MapPin, MapPinCheck, MapPinOff } from "lucide-react";
import { LOCATION_CHECK_LABELS, formatDistance } from "@/lib/work/location";
import type { LocationCheck } from "@/services/work.service";

const STYLES: Record<LocationCheck, string> = {
  INSIDE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  OUTSIDE: "bg-amber-50 text-amber-900 ring-amber-300",
  LOW_ACCURACY: "bg-slate-50 text-slate-700 ring-slate-200",
  NO_LOCATION: "bg-slate-50 text-slate-700 ring-slate-200",
  NO_APPROVED_PLACE: "bg-slate-50 text-slate-700 ring-slate-200",
};

/** The clock-in location check, with the distance when it was outside. */
export function LocationCheckBadge({
  check,
  distanceMeters,
  placeName,
  compact = false,
}: {
  check: LocationCheck;
  distanceMeters?: number | null;
  placeName?: string | null;
  compact?: boolean;
}) {
  const Icon = check === "INSIDE" ? MapPinCheck : check === "NO_LOCATION" ? MapPinOff : MapPin;
  const label = compact && check === "OUTSIDE" ? "Outside location" : LOCATION_CHECK_LABELS[check];
  const away = check === "OUTSIDE" && distanceMeters != null ? `${formatDistance(distanceMeters)}${placeName ? ` from ${placeName}` : ""}` : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[check]}`}
      title={away ? `${LOCATION_CHECK_LABELS[check]} · ${away}` : undefined}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
      {away && !compact && <span className="font-normal">· {away}</span>}
    </span>
  );
}

/** Only checks worth a reviewer's attention are shown in lists. */
export function needsLocationAttention(check: LocationCheck | null | undefined): check is "OUTSIDE" | "LOW_ACCURACY" {
  return check === "OUTSIDE" || check === "LOW_ACCURACY";
}
