import type { CapturedLocation, LocationCheck } from "@/services/work.service";

// Location is read once, only after the person presses a button, and is sent straight to the
// backend. It is never stored in component state longer than the request, logged or reported.
export function readLocation(): Promise<CapturedLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser cannot share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Math.max(pos.coords.accuracy || 0, 0.001),
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied."
              : err.code === err.TIMEOUT
                ? "Getting your location took too long."
                : "Your location is unavailable right now.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

// GPS can be faked or drift, so OUTSIDE is worded as a flag to look into, never as proof.
export const LOCATION_CHECK_LABELS: Record<LocationCheck, string> = {
  INSIDE: "At an approved location",
  OUTSIDE: "Outside approved locations",
  NO_LOCATION: "No location shared",
  NO_APPROVED_PLACE: "No approved location to compare with",
  LOW_ACCURACY: "Location too imprecise to check",
};

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** The date of a timestamp, in the viewer's own time zone. */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}
