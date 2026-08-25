"use client";

import { CheckCircle2, Circle, Info } from "lucide-react";

export type DocSectionStatus = "done" | "active" | "locked";

// "locked" here means "not reached yet", not "you are blocked" — the backend
// is the real gate, so this renders as a plain upcoming-step indicator
// rather than a padlock implying the user is trapped.
export function DocStatusBadge({ status }: { status: DocSectionStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> Done
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
        <Circle className="h-3.5 w-3.5 fill-blue-100" /> In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
      <Circle className="h-3 w-3" /> Upcoming
    </span>
  );
}

/**
 * A numbered section of a steel process document — a flowing document
 * section, not a floating card. Sections are separated by a top divider
 * (except the first) and are always rendered (locked sections dim, they
 * never collapse) so the whole document reads top-to-bottom like a real
 * process record rather than an accordion or per-activity wizard step.
 *
 * Shared across P01-P06 — originally built for P02 (see git history of
 * components/steel/p02/document.tsx, which now re-exports this).
 */
export function DocSection({
  number, title, status, action, children, first,
}: {
  number: string;
  title: string;
  status?: DocSectionStatus;
  action?: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={(first ? "" : "border-t border-input pt-5 ") + "pb-1" + (status === "locked" ? " opacity-60" : "")}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
          <span className="text-xs font-mono text-muted-foreground">{number}</span>
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {status && <DocStatusBadge status={status} />}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Two-column (responsive) inline field grid for document data. */
export function DocGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const colClass = cols === 4 ? "sm:grid-cols-4" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return <div className={`grid grid-cols-2 ${colClass} gap-x-4 gap-y-3`}>{children}</div>;
}

/** How a DocField's value came to be — drives its read-only styling and caption. */
export type DocFieldKind = "inherited" | "configured" | "calculated";

const DOC_FIELD_KIND_STYLE: Record<DocFieldKind, { box: string; caption: string; label: (source?: string) => string }> = {
  inherited: {
    box: "bg-muted/40 border-input/60",
    caption: "text-muted-foreground/80",
    label: (source) => `Read-only · ${source ?? "Inherited"}`,
  },
  configured: {
    box: "bg-indigo-50/60 border-indigo-200/70",
    caption: "text-indigo-500/90",
    label: (source) => `Read-only · ${source ?? "Configuration"}`,
  },
  calculated: {
    box: "bg-amber-50/60 border-amber-200/70",
    caption: "text-amber-600/90",
    label: (source) => `Calculated · ${source ?? "System"}`,
  },
};

/**
 * A single labeled value in a steel process document. Every field is one of:
 *
 * - INPUT (default) — no `source`/`kind` — a normal editable/entered value.
 * - INHERITED — `kind="inherited"` (or just `source` with no kind, for
 *   backwards compatibility) — came from an earlier process/screen (e.g. P01).
 * - CONFIGURED — `kind="configured"` — came from Configuration/master data.
 * - CALCULATED — `kind="calculated"` — system-derived, never manually
 *   editable, regardless of screen stage.
 *
 * Pass `source` for a short caption naming exactly where the value came from
 * (e.g. "Production Plan (P01)", "Material Master"). This is the one
 * consistent convention for that distinction — screens should reuse it
 * rather than inventing their own styling.
 */
export function DocField({
  label, value, source, kind,
}: { label: string; value: React.ReactNode; source?: string; kind?: DocFieldKind }) {
  if (value === null || value === undefined || value === "") return null;
  const effectiveKind: DocFieldKind | undefined = kind ?? (source ? "inherited" : undefined);
  if (effectiveKind) {
    const style = DOC_FIELD_KIND_STYLE[effectiveKind];
    return (
      <div className={`rounded-md border px-2 py-1.5 -mx-2 ${style.box}`}>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
        <p className={`text-[10px] mt-0.5 ${style.caption}`}>{style.label(source)}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

/** Highlighted callout block for guidance, exceptions, or summaries. */
export function SummaryBlock({
  tone = "neutral", children,
}: { tone?: "neutral" | "info" | "warning" | "success"; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    neutral: "bg-muted/50 border-l-4 border-muted-foreground/30 text-muted-foreground",
    info: "bg-blue-50 border-l-4 border-blue-400 text-blue-800",
    warning: "bg-amber-50 border-l-4 border-amber-400 text-amber-800",
    success: "bg-emerald-50 border-l-4 border-emerald-400 text-emerald-800",
  };
  return <div className={`rounded-r-md p-3 text-xs leading-relaxed ${styles[tone]}`}>{children}</div>;
}

/** Compact segmented pill control — for a small, fixed set of mutually exclusive options. */
export function PillSelect<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-input bg-muted/30 p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={
            "px-3 h-7 rounded-[calc(var(--radius-md)-2px)] text-xs font-medium transition-colors " +
            (value === o.value ? "bg-background text-foreground shadow-sm border border-input" : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Sticky action row anchored to the bottom of the document card — the persistent bottom action area. */
export function DocumentActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 md:-mx-6 mt-2 flex items-center justify-end gap-2 border-t border-input bg-background/95 backdrop-blur px-4 md:px-6 py-3">
      {children}
    </div>
  );
}

/** @deprecated use DocumentActions */
export const StickyActions = DocumentActions;

/**
 * Two-column process document shell: the document on the left, a persistent
 * contextual guidance card on the right (below the document on narrow
 * screens). Not an accordion or popup — both stay visible together. Shared
 * page shell for every P01-P06 process document screen.
 */
export function ProcessDocumentLayout({ children, info }: { children: React.ReactNode; info: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
      <div className="min-w-0">{children}</div>
      <aside className="lg:sticky lg:top-4">{info}</aside>
    </div>
  );
}

/** @deprecated use ProcessDocumentLayout */
export const P02Layout = ProcessDocumentLayout;

/**
 * Persistent per-stage guidance card, kept deliberately short — what's
 * already provided, what to enter, and a couple of quick checks before
 * continuing. It must not restate what the document body already shows; it
 * only orients the user. Content is data, not markup: each screen passes its
 * own stage-specific copy rather than duplicating this component.
 */
export function InfoCard({
  whatToDo, alreadyProvided, whatToEnter, beforeYouContinue,
}: {
  /** Optional one-line framing of the goal of this screen/section. */
  whatToDo?: string;
  /** One concise line: what's inherited from an earlier process/master data for this stage. */
  alreadyProvided?: string;
  /** One concise line: what the user actually needs to type/pick here. */
  whatToEnter?: string;
  /** 2-3 short checks, not a restatement of the form. */
  beforeYouContinue?: string[];
}) {
  return (
    <div className="rounded-lg border border-input bg-muted/20 p-4 space-y-3.5 text-sm">
      {whatToDo && (
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide">
            <Info className="h-3.5 w-3.5 text-blue-500" /> What to do
          </h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{whatToDo}</p>
        </div>
      )}

      {alreadyProvided && (
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide">
            {!whatToDo && <Info className="h-3.5 w-3.5 text-blue-500" />} Already provided
          </h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{alreadyProvided}</p>
        </div>
      )}

      {whatToEnter && (
        <div>
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">What to enter</h4>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{whatToEnter}</p>
        </div>
      )}

      {beforeYouContinue && beforeYouContinue.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">Before continuing</h4>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground list-disc pl-4">
            {beforeYouContinue.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** @deprecated use InfoCard */
export const P02InfoCard = InfoCard;

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 flex items-start gap-2">
      <span className="mt-0.5">⚠</span>
      <span>{message}</span>
    </div>
  );
}

/** Compact created/updated-by line for the bottom of a document. */
export function AuditMeta({
  createdLabel, createdBy, createdAt, updatedLabel, updatedBy, updatedAt,
}: {
  createdLabel?: string;
  createdBy?: string | null;
  createdAt?: string | Date | null;
  updatedLabel?: string;
  updatedBy?: string | null;
  updatedAt?: string | Date | null;
}) {
  const fmt = (d?: string | Date | null) => (d ? new Date(d).toLocaleString() : null);
  const created = fmt(createdAt);
  const updated = fmt(updatedAt);
  if (!created && !updated) return null;
  return (
    <p className="text-[11px] text-muted-foreground/80">
      {created && <>{createdLabel ?? "Created"}{createdBy ? ` by ${createdBy}` : ""} on {created}</>}
      {created && updated && " · "}
      {updated && <>{updatedLabel ?? "Last updated"}{updatedBy ? ` by ${updatedBy}` : ""} on {updated}</>}
    </p>
  );
}
