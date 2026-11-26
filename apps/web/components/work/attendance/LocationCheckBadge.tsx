import { MapPin, MapPinCheck, MapPinOff } from "lucide-react";
import { LOCATION_CHECK_LABELS, formatDistance } from "@/lib/work/location";
import type { LocationCheck } from "@/services/work.service";

const STYLES: Record<LocationCheck, string> = {
  INSIDE: "bg-success-subtle text-success ring-success",
  OUTSIDE: "bg-warning-subtle text-warning ring-warning",
  LOW_ACCURACY: "bg-muted text-foreground ring-ring",
  NO_LOCATION: "bg-muted text-foreground ring-ring",
  NO_APPROVED_PLACE: "bg-muted text-foreground ring-ring",
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
