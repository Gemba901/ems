"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarX2, ImagePlus, Loader2, X } from "lucide-react";
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

export {
  EmptyState,
  ErrorNote,
  Field,
  HelpTip,
  Loading,
  Surface,
  WorkDialog as FiveSDialog,
  errorMessage,
  inputClass,
  linkButton,
  primaryButton,
  secondaryButton,
} from "@/components/work/ui";

export const dangerButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const selectClass =
  "min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

function Pill({ className, children, title }: { className: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

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
  if (level == null) return <span className={cn("text-sm font-medium italic text-slate-500", className)}>Not assessed</span>;
  return <span className={cn("font-semibold tabular-nums text-slate-900", className)}>{formatLevel(level)}</span>;
}

export function TargetBadge({ met }: { met: boolean | null | undefined }) {
  if (met == null) return <Pill className="bg-slate-100 text-slate-600">No result</Pill>;
  return met ? <Pill className="bg-emerald-50 text-emerald-700">Target met</Pill> : <Pill className="bg-amber-50 text-amber-800">Below target</Pill>;
}

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  return status === "DRAFT" ? (
    <Pill className="border border-dashed border-amber-400 bg-amber-50 text-amber-800">Draft – not submitted</Pill>
  ) : (
    <Pill className="bg-blue-600 text-white">Submitted</Pill>
  );
}

const ACTION_STATUS_STYLES: Record<ActionStatus, string> = {
  OPEN: "bg-slate-100 text-slate-700",
  AWAITING_VERIFICATION: "bg-violet-50 text-violet-700",
  VERIFIED: "bg-emerald-50 text-emerald-700",
};

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return <Pill className={ACTION_STATUS_STYLES[status]}>{ACTION_STATUS_LABELS[status]}</Pill>;
}

const RED_TAG_STYLES: Record<RedTagStatus, string> = {
  PENDING: "bg-red-50 text-red-700",
  DECIDED: "bg-amber-50 text-amber-800",
  RESOLVED: "bg-emerald-50 text-emerald-700",
};

export function RedTagStatusBadge({ status }: { status: RedTagStatus }) {
  return <Pill className={RED_TAG_STYLES[status]}>{RED_TAG_STATUS_LABELS[status]}</Pill>;
}

const STANDARD_STYLES: Record<StandardStatus, string> = {
  DRAFT: "border border-dashed border-amber-400 bg-amber-50 text-amber-800",
  APPROVED: "bg-emerald-600 text-white",
  SUPERSEDED: "bg-slate-100 text-slate-500 line-through",
};

export function StandardStatusBadge({ status }: { status: StandardStatus }) {
  return <Pill className={STANDARD_STYLES[status]}>{STANDARD_STATUS_LABELS[status]}</Pill>;
}

const OCCURRENCE_STYLES: Record<OccurrenceState, string> = {
  DONE: "bg-emerald-50 text-emerald-700",
  DONE_WITH_EXCEPTION: "bg-amber-50 text-amber-800",
  NOT_DONE: "bg-red-50 text-red-700",
  MISSED: "bg-red-600 text-white",
  DUE_TODAY: "bg-blue-50 text-blue-700",
  UPCOMING: "bg-slate-100 text-slate-600",
};

export function OccurrenceBadge({ state }: { state: OccurrenceState }) {
  return <Pill className={OCCURRENCE_STYLES[state]}>{OCCURRENCE_STATE_LABELS[state]}</Pill>;
}

const DUE_STYLES: Record<AuditDueState, string> = {
  NEVER_AUDITED: "bg-slate-100 text-slate-600",
  OVERDUE: "bg-red-50 text-red-700",
  DUE_SOON: "bg-amber-50 text-amber-800",
  ON_TRACK: "bg-emerald-50 text-emerald-700",
};

export function AuditDueBadge({ state, nextDueDate }: { state: AuditDueState; nextDueDate: string | null }) {
  return (
    <Pill className={DUE_STYLES[state]}>
      {AUDIT_DUE_LABELS[state]}
      {nextDueDate && state !== "NEVER_AUDITED" ? ` · ${formatDateOnly(nextDueDate)}` : ""}
    </Pill>
  );
}

export function PracticeBadge({ practice }: { practice: Practice }) {
  return <Pill className="bg-blue-50 text-blue-800">{PRACTICE_LABELS[practice]}</Pill>;
}

export function SampleBadge() {
  return (
    <Pill className="border border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800" title="Demonstration record created from Settings → Sample data">
      Sample data
    </Pill>
  );
}

/** "Due date not set" is shown plainly and is never treated as overdue. */
export function DueDate({ date, overdue }: { date: string | null; overdue?: boolean }) {
  if (!date)
    return (
      <span className="inline-flex items-center gap-1 text-sm text-slate-500">
        <CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" /> Due date not set
      </span>
    );
  return (
    <span className={cn("text-sm", overdue ? "font-semibold text-red-700" : "text-slate-700")}>
      {formatDateOnly(date)}
      {overdue && " · Overdue"}
    </span>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "bad" | "good"; href?: string }) {
  const toneClass = { default: "text-slate-900", warn: "text-amber-700", bad: "text-red-700", good: "text-emerald-700" }[tone];
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", toneClass)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ── Pickers ───────────────────────────────────────────────────────────────────

export function PersonSelect({
  id,
  value,
  onChange,
  disabled,
  emptyLabel = "Not assigned",
  allowEmpty = true,
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
}) {
  const { data, isLoading } = useFiveSDirectory();
  return (
    <select id={id} className={selectClass} value={value ?? ""} disabled={disabled || isLoading} onChange={(e) => onChange(e.target.value || null)}>
      {(allowEmpty || !value) && <option value="">{isLoading ? "Loading people…" : emptyLabel}</option>}
      {data?.employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
          {e.jobTitle ? ` – ${e.jobTitle}` : ""}
        </option>
      ))}
    </select>
  );
}

export function DepartmentSelect({
  id,
  value,
  onChange,
  disabled,
  emptyLabel = "No department",
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const { data, isLoading } = useFiveSDirectory();
  return (
    <select id={id} className={selectClass} value={value ?? ""} disabled={disabled || isLoading} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{isLoading ? "Loading…" : emptyLabel}</option>
      {data?.departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

export function AreaSelect({
  id,
  value,
  onChange,
  disabled,
  emptyLabel = "Choose an area",
  activeOnly = true,
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
  activeOnly?: boolean;
}) {
  const { data, isLoading } = useFiveSAreas({ status: activeOnly ? "active" : "all" });
  return (
    <select id={id} className={selectClass} value={value ?? ""} disabled={disabled || isLoading} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{isLoading ? "Loading areas…" : emptyLabel}</option>
      {data?.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.isActive ? "" : " (inactive)"}
        </option>
      ))}
    </select>
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
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      {show.includes("area") && (
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Area
          <AreaSelect id="filter-area" value={value.areaId} onChange={(v) => set({ areaId: v ?? undefined })} emptyLabel="All areas" activeOnly={false} />
        </label>
      )}
      {show.includes("department") && (
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Department
          <DepartmentSelect id="filter-dept" value={value.departmentId} onChange={(v) => set({ departmentId: v ?? undefined })} emptyLabel="All departments" />
        </label>
      )}
      {show.includes("owner") && (
        <label className="space-y-1 text-xs font-medium text-slate-600">
          {ownerLabel}
          <PersonSelect id="filter-owner" value={value.ownerId} onChange={(v) => set({ ownerId: v ?? undefined })} emptyLabel="Anyone" />
        </label>
      )}
      {show.includes("dates") && (
        <>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            From
            <input type="date" className={selectClass} value={value.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            To
            <input type="date" className={selectClass} value={value.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} />
          </label>
        </>
      )}
      {children}
      {active && (
        <div className="flex items-end">
          <button
            type="button"
            className="min-h-10 text-sm font-medium text-blue-700 hover:underline"
            onClick={() => onChange(Object.fromEntries(Object.keys(value).map((k) => [k, undefined])) as unknown as T)}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

// ── Evidence ──────────────────────────────────────────────────────────────────

/** Photos stored through the app's upload service. Shown as thumbnails that open the file. */
export function PhotoGallery({ urls, emptyText }: { urls: string[]; emptyText?: string }) {
  if (urls.length === 0) return emptyText ? <p className="text-sm text-slate-500">{emptyText}</p> : null;
  return (
    <ul className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <li key={url}>
          <TenantFileLink href={url} className="block overflow-hidden rounded-lg border border-slate-200" aria-label={`Open photo ${i + 1}`}>
            <TenantImage src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover" />
          </TenantFileLink>
        </li>
      ))}
    </ul>
  );
}

export function FileList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <p className="text-sm text-slate-500">No reference files.</p>;
  return (
    <ul className="space-y-1">
      {urls.map((url, i) => (
        <li key={url}>
          <TenantFileLink href={url} className="text-sm font-medium text-blue-700 hover:underline">
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
                <TenantImage src={url} alt={`Attachment ${i + 1}`} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <TenantFileLink href={url} className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 text-sm text-blue-700">
                  File {i + 1}
                </TenantFileLink>
              )}
              {!disabled && (
                <button
                  type="button"
                  className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-slate-600 shadow ring-1 ring-slate-200 hover:text-red-600"
                  aria-label={`Remove attachment ${i + 1}`}
                  onClick={() => onChange(urls.filter((u) => u !== url))}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && urls.length < MAX_FILES && (
        <>
          <input ref={input} type="file" accept={accept} multiple className="sr-only" onChange={(e) => void upload(e.target.files)} tabIndex={-1} />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Uploading…" : label}
          </button>
        </>
      )}
      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
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
