"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  readUrlView,
  updateUrlView,
  replaceUrlView,
  URL_VIEW_EVENT,
  type UrlSchema,
  type UrlValues,
  type UrlContext,
} from "@/lib/url-view-state";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(URL_VIEW_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(URL_VIEW_EVENT, listener);
  };
}
const getSnapshot = () => window.location.href;
const getServerSnapshot = () => null;

export function useUrlViewState<S extends UrlSchema>(
  prefix: string,
  schema: S,
  context?: UrlContext,
) {
  const snapshot = useSyncExternalStore<string | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const contextKey = context?.key;
  const contextValue = context?.value;
  const update = useCallback(
    (patch: Partial<UrlValues<S>>) => {
      replaceUrlView(
        updateUrlView(
          new URL(window.location.href),
          prefix,
          schema,
          patch,
          contextKey !== undefined && contextValue !== undefined
            ? { key: contextKey, value: contextValue }
            : undefined,
        ),
      );
    },
    [prefix, schema, contextKey, contextValue],
  );
  const state = readUrlView(
    new URL(snapshot ?? "http://localhost/"),
    prefix,
    schema,
    context,
  );
  return { state, update, ready: snapshot !== null };
}
