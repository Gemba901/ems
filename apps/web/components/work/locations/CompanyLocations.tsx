"use client";

import { useState, type FormEvent } from "react";
import { Crosshair, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCreateSite, useDeleteSite, useUpdateLocationSettings, useUpdateSite } from "@/hooks/work/useWork";
import { readLocation } from "@/lib/work/location";
import type { LocationSettings, WorkSite } from "@/services/work.service";
import { LocationMap, MapLegend } from "@/components/work/LocationMap";
import { EmptyState, ErrorNote, Field, HelpTip, Surface, WorkDialog, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

const DEFAULT_RADIUS = 150;

function parseCoordinate(value: string, limit: number): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function SiteDialog({ site, others, onClose }: { site: WorkSite | null; others: WorkSite[]; onClose: () => void }) {
  const create = useCreateSite();
  const update = useUpdateSite();
  const [name, setName] = useState(site?.name ?? "");
  const [latitude, setLatitude] = useState(site ? String(site.latitude) : "");
  const [longitude, setLongitude] = useState(site ? String(site.longitude) : "");
  const [radius, setRadius] = useState(site?.radiusMeters ?? DEFAULT_RADIUS);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const mutation = site ? update : create;

  const lat = parseCoordinate(latitude, 90);
  const lng = parseCoordinate(longitude, 180);
  const radiusValid = Number.isInteger(radius) && radius >= 25 && radius <= 5000;

  function pick(la: number, ln: number) {
    setLatitude(la.toFixed(6));
    setLongitude(ln.toFixed(6));
  }

  async function captureCurrent() {
    setLocating(true);
    setLocateError(null);
    try {
      const here = await readLocation();
      pick(here.latitude, here.longitude);
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : "Your location is unavailable right now.");
    } finally {
      setLocating(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (lat == null || lng == null || !radiusValid) return;
    const data = { name: name.trim(), latitude: lat, longitude: lng, radiusMeters: radius };
    if (site) update.mutate({ siteId: site.id, data }, { onSuccess: onClose });
    else create.mutate(data, { onSuccess: onClose });
  }

  return (
    <WorkDialog
      open
      size="lg"
      onOpenChange={(open) => !open && onClose()}
      title={site ? `Edit ${site.name}` : "Add a company location"}
      description="Clock-ins within the radius count as at this location."
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="site-form" className={primaryButton} disabled={mutation.isPending || lat == null || lng == null || !radiusValid}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {site ? "Save location" : "Add location"}
          </button>
        </>
      }
    >
      <form id="site-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="Name" htmlFor="site-name">
            <input id="site-name" required maxLength={120} placeholder="e.g. Head office" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Radius (metres)" htmlFor="site-radius" hint="25 to 5,000.">
            <input id="site-radius" type="number" required min={25} max={5000} step={1} className={inputClass} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          </Field>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Position</p>
            <button type="button" className={secondaryButton} onClick={captureCurrent} disabled={locating}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Crosshair className="h-4 w-4" aria-hidden="true" />}
              Use my current location
            </button>
          </div>
          <p className="text-xs text-slate-500">Click the map to place it, use your current location while you are there, or type the coordinates.</p>
          {locateError && <p className="text-xs font-medium text-red-600">{locateError}</p>}
          <LocationMap
            label="Map: click to place the company location"
            className="h-72"
            onPick={pick}
            places={[
              ...others.filter((o) => o.id !== site?.id && o.isActive).map((o) => ({ ...o, kind: "SITE" as const })),
              ...(lat != null && lng != null && radiusValid ? [{ latitude: lat, longitude: lng, radiusMeters: radius, name: name.trim() || "New location", kind: "SITE" as const }] : []),
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" htmlFor="site-lat">
              <input id="site-lat" required inputMode="decimal" className={`${inputClass} font-mono`} value={latitude} onChange={(e) => setLatitude(e.target.value)} aria-invalid={latitude !== "" && lat == null} />
            </Field>
            <Field label="Longitude" htmlFor="site-lng">
              <input id="site-lng" required inputMode="decimal" className={`${inputClass} font-mono`} value={longitude} onChange={(e) => setLongitude(e.target.value)} aria-invalid={longitude !== "" && lng == null} />
            </Field>
          </div>
        </div>
        {mutation.isError && <ErrorNote>{errorMessage(mutation.error, "Could not save the location.")}</ErrorNote>}
      </form>
    </WorkDialog>
  );
}

function SiteRow({ site, readOnly, onEdit }: { site: WorkSite; readOnly: boolean; onEdit: () => void }) {
  const update = useUpdateSite();
  const remove = useDeleteSite();
  const [confirming, setConfirming] = useState(false);
  const error = update.error ?? remove.error;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${site.isActive ? "text-slate-900" : "text-slate-400"}`}>
          {site.name}
          {!site.isActive && <span className="ml-2 text-xs font-normal">(not in use)</span>}
        </p>
        <p className="text-xs text-slate-500">Within {site.radiusMeters} m</p>
        {error && <p className="mt-1 text-xs font-medium text-red-600">{errorMessage(error)}</p>}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1">
          <label className="mr-1 flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={site.isActive}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ siteId: site.id, data: { isActive: e.target.checked } })}
            />
            In use
          </label>
          <button type="button" aria-label={`Edit ${site.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          {confirming ? (
            <span className="flex items-center gap-1">
              <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={remove.isPending} onClick={() => remove.mutate(site.id)}>
                Delete
              </button>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" aria-label={`Delete ${site.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function HomeRadiusForm({ value }: { value: number }) {
  const update = useUpdateLocationSettings();
  const [radius, setRadius] = useState(value);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(radius, { onSuccess: () => setSaved(true) });
      }}
    >
      <Field label="Home radius (metres)" htmlFor="home-radius" hint="How far from an approved home still counts as at home.">
        <input
          id="home-radius"
          type="number"
          required
          min={25}
          max={5000}
          step={1}
          className={`${inputClass} sm:w-40`}
          value={radius}
          onChange={(e) => {
            setRadius(Number(e.target.value));
            setSaved(false);
          }}
        />
      </Field>
      <button type="submit" className={secondaryButton} disabled={update.isPending || radius === value}>
        Save radius
      </button>
      {saved && <span className="text-sm text-emerald-700" role="status">Saved</span>}
      {update.isError && <p className="w-full text-xs font-medium text-red-600">{errorMessage(update.error)}</p>}
    </form>
  );
}

/** Company sites everyone can see; settings roles add and change them. */
export function CompanyLocations({ settings }: { settings: LocationSettings }) {
  const [editing, setEditing] = useState<WorkSite | "new" | null>(null);
  const readOnly = !settings.canEdit;
  const active = settings.sites.filter((s) => s.isActive);

  return (
    <Surface>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Company locations</h2>
          <HelpTip label="About company locations">
            On-site and hybrid employees are expected to clock in within one of these. A clock-in elsewhere is still allowed, but it is
            marked &ldquo;Outside approved locations&rdquo; with the distance, for a manager to look into.
          </HelpTip>
        </div>
        {!readOnly && (
          <button type="button" className={secondaryButton} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add location
          </button>
        )}
      </div>
      {settings.sites.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No company locations yet">
            {readOnly ? "Administrators and HR add these." : "Until one is added, on-site clock-ins have nothing to be checked against."}
          </EmptyState>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-2 p-4 pb-0">
              <LocationMap label="Map of company locations" places={active.map((s) => ({ ...s, kind: "SITE" }))} className="h-56" />
              <MapLegend site />
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {settings.sites.map((s) => (
              <SiteRow key={s.id} site={s} readOnly={readOnly} onEdit={() => setEditing(s)} />
            ))}
          </ul>
        </>
      )}
      {!readOnly && <HomeRadiusForm key={settings.homeRadiusMeters} value={settings.homeRadiusMeters} />}
      {editing && <SiteDialog site={editing === "new" ? null : editing} others={settings.sites} onClose={() => setEditing(null)} />}
    </Surface>
  );
}
