"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ContextField {
  label: string;
  value: React.ReactNode;
}

interface Props {
  title: string;
  /** e.g. "From P01 — read only." */
  subtitle: string;
  fields: ContextField[];
}

/**
 * Canonical "read-only context from the previous process" card, used on
 * P03/P04/P05/P06 detail screens — replaces 4 near-identical per-process
 * copies. Fields (and which are shown) are entirely caller-supplied, same
 * as before: each process still decides exactly what upstream data is real
 * and worth surfacing. A field with a null/undefined/empty value is
 * omitted, matching the previous per-process behavior.
 */
export function ContextSummary({ title, subtitle, fields }: Props) {
  const visible = fields.filter((f) => f.value !== null && f.value !== undefined && f.value !== "");
  if (visible.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {visible.map((f) => (
            <div key={f.label}>
              <p className="text-xs text-slate-400">{f.label}</p>
              <p className="font-medium text-slate-800">{f.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
