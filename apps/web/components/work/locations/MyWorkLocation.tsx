"use client";

import { useState } from "react";
import { Building2, House, Loader2, MapPin } from "lucide-react";
import { useCancelHomeRequest, useMyLocation, useRequestHome } from "@/hooks/work/useWork";
import { formatDay, readLocation } from "@/lib/work/location";
import { ARRANGEMENT_LABELS, type MyLocation } from "@/services/work.service";
import { LocationMap, MapLegend } from "@/components/work/LocationMap";
import { ErrorNote, Field, Surface, WorkDialog, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

const EXPECTED: Record<MyLocation["arrangement"], string> = {
  ON_SITE: "Clock in at a company location.",
  REMOTE: "Clock in from your approved home.",
  HYBRID: "Clock in at a company location or your approved home.",
};

function HomeRequestDialog({ onClose }: { onClose: () => void }) {
  const request = useRequestHome();
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  async function send() {
    setLocating(true);
    setLocateError(null);
    try {
      const location = await readLocation();
      request.mutate({ location, note: note.trim() || undefined }, { onSuccess: onClose });
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : "Your location is unavailable right now.");
    } finally {
      setLocating(false);
    }
  }

  const busy = locating || request.isPending;
  return (
    <WorkDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Set your home location"
      description="Do this while you are at home."
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={busy} onClick={send}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Share location and send
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          Your device&rsquo;s location is read once and sent to HR or your manager to approve. Once approved, your remote clock-ins are
          checked against it. Your current home, if any, stays in use until then.
        </p>
        <p className="text-slate-500">For a precise reading, turn on location services and stand away from thick walls or basements.</p>
        <Field label="Note (optional)" htmlFor="home-note" hint="For example, why you are moving it.">
          <textarea id="home-note" rows={2} maxLength={500} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {locateError && <ErrorNote>{locateError}</ErrorNote>}
        {request.isError && <ErrorNote>{errorMessage(request.error, "Could not send your home location.")}</ErrorNote>}
      </div>
    </WorkDialog>
  );
}

/** Where the person is expected to clock in, and their home location request. */
export function MyWorkLocation() {
  const mine = useMyLocation();
  const cancel = useCancelHomeRequest();
  const [asking, setAsking] = useState(false);
  const [showMap, setShowMap] = useState(false);

  if (mine.isPending || mine.isError) return null;
  const m = mine.data;
  const pending = m.latestRequest?.status === "PENDING" ? m.latestRequest : null;
  const rejected = m.latestRequest?.status === "REJECTED" ? m.latestRequest : null;
  const sites = m.arrangement === "REMOTE" ? [] : m.sites;

  return (
    <Surface className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <MapPin className="h-4 w-4 text-slate-500" aria-hidden="true" /> Your work location
        </h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{ARRANGEMENT_LABELS[m.arrangement]}</span>
      </div>
      <p className="text-sm text-slate-600">{EXPECTED[m.arrangement]}</p>

      {sites.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-slate-600">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          {sites.map((s) => s.name).join(", ")}
        </p>
      )}
      {m.arrangement !== "REMOTE" && sites.length === 0 && <p className="text-xs text-slate-500">No company locations have been added yet.</p>}

      {m.canRequestHome && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-600">
            <House className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            {m.home ? `Home approved ${formatDay(m.home.approvedAt)}` : "No approved home yet"}
            {m.home && (
              <button type="button" className="ml-1 rounded font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => setShowMap((v) => !v)} aria-expanded={showMap}>
                {showMap ? "Hide map" : "Show map"}
              </button>
            )}
          </p>
          {showMap && m.home && (
            <>
              <LocationMap label="Map of your approved home" className="h-48" places={[{ ...m.home, radiusMeters: m.homeRadiusMeters, name: "Approved home", kind: "HOME" }]} />
              <MapLegend home />
            </>
          )}
          {pending ? (
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900" role="status">
              New home location sent {formatDay(pending.createdAt)}, waiting for approval.
              <button type="button" className="ml-2 font-medium underline disabled:opacity-50" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Withdraw
              </button>
              {cancel.isError && <p className="mt-1 font-medium text-red-700">{errorMessage(cancel.error)}</p>}
            </div>
          ) : (
            <>
              {rejected && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  Your home location from {formatDay(rejected.createdAt)} was not approved{rejected.reviewNote ? `: “${rejected.reviewNote}”` : "."}
                </p>
              )}
              <button type="button" className={secondaryButton} onClick={() => setAsking(true)}>
                <House className="h-4 w-4" aria-hidden="true" />
                {m.home ? "Update home location" : "Set home location"}
              </button>
            </>
          )}
        </div>
      )}
      {asking && <HomeRequestDialog onClose={() => setAsking(false)} />}
    </Surface>
  );
}
