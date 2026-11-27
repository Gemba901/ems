"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarX2, ImagePlus, Loader2, X } from "lucide-react";
import type { FormFieldControlProps } from "@/components/patterns/FormField";
import { StatCard as MetricCard } from "@/components/patterns/StatCard";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "@/lib/work/format";
import { formatLevel } from "@/lib/five-s/scoring";
import { PRACTICE_LABELS } from "@/lib/five-s/template";
import { useAuthStore } from "@/store/auth.store";
import { uploadImage } from "@/services/uploads.service";
import { TenantImage } from "@/components/files/TenantImage";
import { TenantFileLink } from "@/components/files/TenantFileLink";
import { useFiveSAreas, useFiveSDirectory } from "@/hooks/five-s/useFiveS";
import {
  ACTION_STATUS_LABELS,
  AUDIT_DUE_LABELS,
  OCCURRENCE_STATE_LABELS,
  RED_TAG_STATUS_LABELS,
  STANDARD_STATUS_LABELS,
  type ActionStatus,
  type AuditDueState,
  type AuditStatus,
  type OccurrenceState,
  type Practice,
  type RedTagStatus,
  type StandardStatus,
} from "@/services/five-s.service";

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const HEADER_ACTIONS = "flex shrink-0 flex-wrap gap-2 sm:justify-end [&>*]:whitespace-nowrap";

export function formatDate(date: string | null | undefined): string {
  return date ? formatDateOnly(date) : "—";
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** A 5S level on the 1.0–3.5 scale, or "Not assessed". Never a percentage. */
export function LevelValue({ level, className }: { level: number | null | undefined; className?: string }) {
  if (level == null) return <span className={cn("text-sm font-medium italic text-muted-foreground", className)}>Not assessed</span>;
  return <span className={cn("font-semibold tabular-nums text-foreground", className)}>{formatLevel(level)}</span>;
}

export function TargetBadge({ met }: { met: boolean | null | undefined }) {
  if (met == null) return <Badge variant="neutral">No result</Badge>;
  return <Badge variant={met ? "success" : "warning"}>{met ? "Target met" : "Below target"}</Badge>;
}

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  return <StatusBadge status={status} label={status === "DRAFT" ? "Draft – not submitted" : "Submitted"} />;
}

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return <StatusBadge status={status} label={ACTION_STATUS_LABELS[status]} />;
}

export function RedTagStatusBadge({ status }: { status: RedTagStatus }) {
  return <StatusBadge status={status} label={RED_TAG_STATUS_LABELS[status]} />;
}

export function StandardStatusBadge({ status }: { status: StandardStatus }) {
  return <StatusBadge status={status} label={STANDARD_STATUS_LABELS[status]} />;
}

export function OccurrenceBadge({ state }: { state: OccurrenceState }) {
  return <StatusBadge status={state} label={OCCURRENCE_STATE_LABELS[state]} />;
}

const DUE_TONES = {
  NEVER_AUDITED: "neutral",
  OVERDUE: "danger",
  DUE_SOON: "warning",
  ON_TRACK: "success",
} as const;

export function AuditDueBadge({ state, nextDueDate }: { state: AuditDueState; nextDueDate: string | null }) {
  return (
    <Badge variant={DUE_TONES[state]}>
      {AUDIT_DUE_LABELS[state]}
      {nextDueDate && state !== "NEVER_AUDITED" ? ` · ${formatDateOnly(nextDueDate)}` : ""}
    </Badge>
  );
}

export function PracticeBadge({ practice }: { practice: Practice }) {
  return <Badge variant="info">{PRACTICE_LABELS[practice]}</Badge>;
}

export function SampleBadge() {
  return (
    <Badge variant="info" title="Demonstration record created from Settings → Sample data">
      Sample data
    </Badge>
  );
}

/** "Due date not set" is shown plainly and is never treated as overdue. */
export function DueDate({ date, overdue }: { date: string | null; overdue?: boolean }) {
  if (!date)
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" /> Due date not set
      </span>
    );
  return (
    <span className={cn("text-sm", overdue ? "font-semibold text-danger" : "text-foreground")}>
      {formatDateOnly(date)}
      {overdue && " · Overdue"}
    </span>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default", href }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "warn" | "bad" | "good"; href?: string }) {
  const toneClass = { default: "", warn: "text-warning", bad: "text-danger", good: "text-success" }[tone];
  const metric = <MetricCard label={label} value={<span className={cn("tabular-nums", toneClass)}>{value}</span>} description={hint} className="h-full" />;
  return href ? (
    <Link href={href} className="block rounded-xl hover:ring-1 hover:ring-ring focus-visible:outline-ring">
      {metric}
    </Link>
  ) : metric;
}

// ── Pickers ───────────────────────────────────────────────────────────────────

export function PersonSelect({
  id,
  value,
  onChange,
  disabled,
  emptyLabel = "Not assigned",
  allowEmpty = true,
  ...accessibility
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
} & FormFieldControlProps) {
  const { data, isLoading } = useFiveSDirectory();
  return (
    <NativeSelect {...accessibility} id={id} className="w-full" value={value ?? ""} disabled={disabled || isLoading} onChange={(e) => onChange(e.target.value || null)}>
      {(allowEmpty || !value) && <option value="">{isLoading ? "Loading people…" : emptyLabel}</option>}
      {data?.employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
          {e.jobTitle ? ` – ${e.jobTitle}` : ""}
        </option>
      ))}
    </NativeSelect>
  );
}

export function DepartmentSelect({
  id,
  value,
  onChange,
  disabled,
  emptyLabel = "No department",
  ...accessibility
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
} & FormFieldControlProps) {
  const { data, isLoading } = useFiveSDirectory();
  return (
    <NativeSelect {...accessibility} id={id} className="w-full" value={value ?? ""} disabled={disabled || isLoading} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{isLoading ? "Loading…" : emptyLabel}</option>
      {data?.departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function AreaSelect({
  id,
  value,
  onChange,
  disabled,
  emptyLabel = "Choose an area",
  activeOnly = true,
  ...accessibility
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
  activeOnly?: boolean;
} & FormFieldControlProps) {
  const { data, isLoading } = useFiveSAreas({ status: activeOnly ? "active" : "all" });
  return (
    <NativeSelect {...accessibility} id={id} className="w-full" value={value ?? ""} disabled={disabled || isLoading} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{isLoading ? "Loading areas…" : emptyLabel}</option>
      {data?.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.isActive ? "" : " (inactive)"}
        </option>
      ))}
    </NativeSelect>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

export type FilterValues = { areaId?: string; departmentId?: string; ownerId?: string; from?: string; to?: string };

export function FilterBar<T extends FilterValues>({
  value,
  onChange,
  show = ["area", "department", "owner", "dates"],
  ownerLabel = "Owner",
  children,
}: {
  value: T;
  onChange: (next: T) => void;
  show?: ("area" | "department" | "owner" | "dates")[];
  ownerLabel?: string;
  children?: ReactNode;
}) {
  const set = (patch: Partial<FilterValues>) => onChange({ ...value, ...patch });
  const active = Object.values(value).some((v) => v);
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      {show.includes("area") && (
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Area
          <AreaSelect id="filter-area" value={value.areaId} onChange={(v) => set({ areaId: v ?? undefined })} emptyLabel="All areas" activeOnly={false} />
        </label>
      )}
      {show.includes("department") && (
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Department
          <DepartmentSelect id="filter-dept" value={value.departmentId} onChange={(v) => set({ departmentId: v ?? undefined })} emptyLabel="All departments" />
        </label>
      )}
      {show.includes("owner") && (
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          {ownerLabel}
          <PersonSelect id="filter-owner" value={value.ownerId} onChange={(v) => set({ ownerId: v ?? undefined })} emptyLabel="Anyone" />
        </label>
      )}
      {show.includes("dates") && (
        <>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            From
            <Input type="date" value={value.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            To
            <Input type="date" value={value.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} />
          </label>
        </>
      )}
      {children}
      {active && (
        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(Object.fromEntries(Object.keys(value).map((k) => [k, undefined])) as unknown as T)}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Evidence ──────────────────────────────────────────────────────────────────

/** Photos stored through the app's upload service. Shown as thumbnails that open the file. */
export function PhotoGallery({ urls, emptyText }: { urls: string[]; emptyText?: string }) {
  if (urls.length === 0) return emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null;
  return (
    <ul className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <li key={url}>
          <TenantFileLink href={url} className="block overflow-hidden rounded-lg border border-border" aria-label={`Open photo ${i + 1}`}>
            <TenantImage src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover" />
          </TenantFileLink>
        </li>
      ))}
    </ul>
  );
}

export function FileList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <p className="text-sm text-muted-foreground">No reference files.</p>;
  return (
    <ul className="space-y-1">
      {urls.map((url, i) => (
        <li key={url}>
          <TenantFileLink href={url} className="text-sm font-medium text-info hover:underline">
            Reference file {i + 1}
          </TenantFileLink>
        </li>
      ))}
    </ul>
  );
}

const MAX_FILES = 10;

/** Uploads files and returns their app URLs. Images only unless `accept` says otherwise. */
export function FileUploader({
  urls,
  onChange,
  folder,
  accept = "image/*",
  label = "Add photo",
  disabled,
  images = true,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  folder: string;
  accept?: string;
  label?: string;
  disabled?: boolean;
  images?: boolean;
}) {
  const token = useAuthStore((s) => s.accessToken);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || !token) return;
    setError(null);
    const room = MAX_FILES - urls.length;
    if (files.length > room) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    setBusy(true);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) added.push((await uploadImage(file, folder, token)).fileUrl);
      onChange([...urls, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {urls.map((url, i) => (
            <li key={url} className="relative">
              {images ? (
                <TenantImage src={url} alt={`Attachment ${i + 1}`} className="h-20 w-20 rounded-lg border border-border object-cover" />
              ) : (
                <TenantFileLink href={url} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm text-info">
                  File {i + 1}
                </TenantFileLink>
              )}
              {!disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="absolute -right-2 -top-2 rounded-full hover:text-danger"
                  aria-label={`Remove attachment ${i + 1}`}
                  onClick={() => onChange(urls.filter((u) => u !== url))}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && urls.length < MAX_FILES && (
        <>
          <Input ref={input} type="file" accept={accept} multiple className="sr-only" onChange={(e) => void upload(e.target.files)} tabIndex={-1} />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="min-h-10 border-dashed"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Uploading…" : label}
          </Button>
        </>
      )}
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function today(): string {
  // Fallback only; screens prefer the company "today" from capabilities.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
