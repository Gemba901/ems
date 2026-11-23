"use client";

import { useEffect, useState } from "react";

/** Only navigation state is written to the URL; unsaved form text stays in memory. */
export function setPlanningUrl(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(values)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  // Next copies its internal history state itself. Passing that state here
  // bypasses its router synchronization and leaves useSearchParams stale.
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event("planning-url-change"));
}

export function usePlanningUrlFilter(name: string) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const restore = () => setValue(new URL(window.location.href).searchParams.get(name) || "");
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("planning-url-change", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("planning-url-change", restore);
    };
  }, [name]);
  return [value, (value: string) => { setValue(value); setPlanningUrl({ [name]: value }); }] as const;
}
