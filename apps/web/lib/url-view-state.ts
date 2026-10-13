export type UrlParam<T> = {
  defaultValue: T;
  parse: (value: string) => T | null;
};
export type UrlSchema = Record<string, UrlParam<unknown>>;
export type UrlValues<S extends UrlSchema> = {
  [K in keyof S]: S[K]["defaultValue"];
};

export function enumParam<T extends string>(
  values: readonly T[],
  defaultValue: T,
): UrlParam<T> {
  return {
    defaultValue,
    parse: (value) => (values.includes(value as T) ? (value as T) : null),
  };
}
export const textParam: UrlParam<string> = {
  defaultValue: "",
  parse: (value) => (value.length <= 200 ? value : null),
};
export const pageParam: UrlParam<number> = {
  defaultValue: 1,
  parse: (value) =>
    /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
      ? Number(value)
      : null,
};
export const booleanParam: UrlParam<boolean> = {
  defaultValue: false,
  parse: (value) =>
    value === "true" ? true : value === "false" ? false : null,
};
export const dateParam: UrlParam<string> = {
  defaultValue: "",
  parse: (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
      ? value
      : null,
};
export type UrlContext = { key: string; value: string };

export function readUrlView<S extends UrlSchema>(
  url: URL,
  prefix: string,
  schema: S,
  context?: UrlContext,
): UrlValues<S> {
  const matches =
    !context ||
    url.searchParams.get(`${prefix}.${context.key}`) === context.value;
  return Object.fromEntries(
    Object.entries(schema).map(([key, spec]) => {
      const raw = matches ? url.searchParams.get(`${prefix}.${key}`) : null;
      return [
        key,
        raw === null
          ? spec.defaultValue
          : (spec.parse(raw) ?? spec.defaultValue),
      ];
    }),
  ) as UrlValues<S>;
}

export function updateUrlView<S extends UrlSchema>(
  url: URL,
  prefix: string,
  schema: S,
  patch: Partial<UrlValues<S>>,
  context?: UrlContext,
): URL {
  const next = new URL(url);
  if (
    context &&
    next.searchParams.get(`${prefix}.${context.key}`) !== context.value
  ) {
    for (const key of [...next.searchParams.keys()])
      if (key.startsWith(`${prefix}.`)) next.searchParams.delete(key);
  }
  if (context) next.searchParams.set(`${prefix}.${context.key}`, context.value);
  for (const [key, value] of Object.entries(patch)) {
    const spec = schema[key];
    if (!spec) continue;
    const parsed = spec.parse(String(value));
    if (parsed === null || parsed === spec.defaultValue)
      next.searchParams.delete(`${prefix}.${key}`);
    else next.searchParams.set(`${prefix}.${key}`, String(parsed));
  }
  return next;
}

export const URL_VIEW_EVENT = "dwms-url-view-change";
export function clearUrlView(prefix: string) {
  const next = new URL(window.location.href);
  for (const key of [...next.searchParams.keys()])
    if (key.startsWith(`${prefix}.`)) next.searchParams.delete(key);
  replaceUrlView(next);
}
export function replaceUrlView(next: URL) {
  if (next.href === window.location.href) return;
  window.history.replaceState(
    null,
    "",
    `${next.pathname}${next.search}${next.hash}`,
  );
  window.dispatchEvent(new Event(URL_VIEW_EVENT));
}
