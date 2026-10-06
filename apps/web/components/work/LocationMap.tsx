"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

// OpenStreetMap tiles by default. Their tile servers ask for low, non-bulk use with
// attribution; set NEXT_PUBLIC_MAP_TILE_URL (and _ATTRIBUTION) to switch to a hosted provider.
// The tile server sees which map area is viewed, never the coordinates themselves.
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const COLORS = { point: "#2563eb", SITE: "#047857", HOME: "#7c3aed" } as const;

export type MapPoint = { latitude: number; longitude: number; accuracyMeters?: number | null; label: string };
export type MapPlace = { latitude: number; longitude: number; radiusMeters: number; name: string; kind: "SITE" | "HOME" };

type Leaflet = typeof import("leaflet");

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * A pin (with its GPS accuracy ring) and approved places drawn as their radius. Leaflet is
 * loaded in the browser only. `onPick` makes a click on the map choose a point.
 */
export function LocationMap({
  point,
  places = [],
  onPick,
  label,
  className = "h-64",
}: {
  point?: MapPoint | null;
  places?: MapPlace[];
  onPick?: (latitude: number, longitude: number) => void;
  label: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: Leaflet; map: LeafletMap; layer: LayerGroup } | null>(null);
  const onPickRef = useRef(onPick);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    import("leaflet")
      .then((mod) => {
        const L = ((mod as unknown as { default?: Leaflet }).default ?? mod) as Leaflet;
        const el = containerRef.current;
        if (cancelled || !el) return;
        const map = L.map(el, { scrollWheelZoom: false });
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
        const layer = L.layerGroup().addTo(map);
        map.on("click", (e) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
        // Dialogs animate in, so the first measured size can be wrong.
        observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(el);
        mapRef.current = { L, map, layer };
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw only when the data changes, not on every render.
  const key = JSON.stringify({ point: point ?? null, places });
  useEffect(() => {
    const current = mapRef.current;
    if (!ready || !current) return;
    const { L, map, layer } = current;
    const data = JSON.parse(key) as { point: MapPoint | null; places: MapPlace[] };

    layer.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const place of data.places) {
      const circle = L.circle([place.latitude, place.longitude], {
        radius: place.radiusMeters,
        color: COLORS[place.kind],
        weight: 2,
        fillOpacity: 0.12,
        interactive: !onPickRef.current,
      })
        .bindTooltip(`${escapeHtml(place.name)} · ${place.radiusMeters} m`)
        .addTo(layer);
      bounds.extend(circle.getBounds());
    }
    if (data.point) {
      const at: [number, number] = [data.point.latitude, data.point.longitude];
      if (data.point.accuracyMeters) {
        const ring = L.circle(at, { radius: data.point.accuracyMeters, color: COLORS.point, weight: 1, dashArray: "4 4", fillOpacity: 0.06, interactive: false }).addTo(layer);
        bounds.extend(ring.getBounds());
      }
      L.circleMarker(at, { radius: 8, color: "#ffffff", weight: 2, fillColor: COLORS.point, fillOpacity: 1 })
        .bindTooltip(escapeHtml(data.point.label))
        .addTo(layer);
      bounds.extend(at);
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
    else map.setView([0, 20], 2);
  }, [ready, key]);

  if (failed) {
    return <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">The map could not be loaded.</p>;
  }
  // `isolate` keeps Leaflet's high z-index panes beneath dialogs and menus.
  return <div ref={containerRef} role="region" aria-label={label} className={`isolate z-0 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${className}`} />;
}

/** Colour key for the map's marks; identity is never colour alone. */
export function MapLegend({ point, site, home }: { point?: string; site?: boolean; home?: boolean }) {
  const item = (color: string, text: string, ring = false) => (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${ring ? "border-2 bg-transparent" : ""}`} style={ring ? { borderColor: color } : { backgroundColor: color }} />
      {text}
    </span>
  );
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {point && item(COLORS.point, point)}
      {site && item(COLORS.SITE, "Company location", true)}
      {home && item(COLORS.HOME, "Approved home", true)}
    </p>
  );
}
