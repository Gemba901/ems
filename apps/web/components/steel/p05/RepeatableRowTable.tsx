"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveButton } from "./shared";
import { toOperatorMessage } from "@/services/steel-melting.service";

export interface RepeatableColumn<T> {
  key: string;
  header: string;
  align?: "right";
  render: (row: T) => React.ReactNode;
}

export type RepeatableFieldType = "text" | "number" | "select";

export interface RepeatableField {
  key: string;
  type: RepeatableFieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  step?: string;
  defaultValue?: string;
}

interface Props<T> {
  rows: T[];
  rowKey: (row: T) => string;
  columns: RepeatableColumn<T>[];
  fields: RepeatableField[];
  submitLabel: string;
  /** Called with the current field values on submit. Throw to surface an error. */
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
  /** Disable the submit button beyond the built-in "any required field empty" check. */
  canSubmit?: (values: Record<string, string>) => boolean;
  submitting?: boolean;
  /** Hides the add-row form entirely (e.g. record closed/on hold/cancelled). */
  disabled?: boolean;
  emptyLabel?: string;
  maxHeightClass?: string;
}

/**
 * Generalized repeatable-row table + add-row form — table+add-row pattern
 * shared by material charges, monitor-melt readings, and additions. Owns
 * the add-row field state locally; what "submit" does (call a persistence
 * endpoint immediately, or just append to a caller-held local list) is left
 * entirely to onSubmit, so the same component works for both live-saved
 * rows (material charges, readings) and locally-buffered rows (additions,
 * saved once as a batch).
 */
export function RepeatableRowTable<T>({
  rows, rowKey, columns, fields, submitLabel, onSubmit, canSubmit, submitting, disabled, emptyLabel = "None recorded yet.", maxHeightClass,
}: Props<T>) {
  const initialValues = () => Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === "select" ? f.options?.[0]?.value ?? "" : "")]));
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const handleSubmit = async () => {
    setError(null);
    try {
      await onSubmit(values);
      setValues(initialValues());
    } catch (err) {
      setError(toOperatorMessage(err));
    }
  };

  const submitDisabled = !!submitting || (canSubmit ? !canSubmit(values) : false);

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className={"overflow-x-auto " + (maxHeightClass ?? "")}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b">
                {columns.map((c) => (
                  <th key={c.key} className={"py-1 pr-2" + (c.align === "right" ? " text-right" : "")}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="border-b border-slate-100">
                  {columns.map((c) => (
                    <td key={c.key} className={"py-1 pr-2" + (c.align === "right" ? " text-right" : "")}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 && <p className="text-xs text-slate-400">{emptyLabel}</p>}

      {!disabled && (
        <div className="space-y-2 pt-2 border-t">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fields.map((f) =>
              f.type === "select" ? (
                <select
                  key={f.key}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <Input
                  key={f.key}
                  type={f.type}
                  step={f.step}
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              ),
            )}
          </div>
          <Button size="sm" variant="outline" disabled={submitDisabled} onClick={handleSubmit}>
            <SaveButton pending={!!submitting} label={submitLabel} />
          </Button>
        </div>
      )}
    </div>
  );
}
