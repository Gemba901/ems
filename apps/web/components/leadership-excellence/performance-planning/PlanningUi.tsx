"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const card =
  "rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6";
export const control =
  "mt-1.5 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-gemba-navy focus:ring-2 focus:ring-gemba-navy/10 disabled:cursor-not-allowed disabled:opacity-60";
export const categories = {
  S: {
    label: "Strengths",
    singular: "Strength",
    hint: "Internal capabilities and advantages",
    className: "border-blue-200 bg-blue-50/60",
    ink: "text-blue-800",
  },
  W: {
    label: "Weaknesses",
    singular: "Weakness",
    hint: "Internal gaps and limitations",
    className: "border-purple-200 bg-purple-50/60",
    ink: "text-purple-800",
  },
  O: {
    label: "Opportunities",
    singular: "Opportunity",
    hint: "External conditions that could help",
    className: "border-emerald-200 bg-emerald-50/60",
    ink: "text-emerald-800",
  },
  T: {
    label: "Threats",
    singular: "Threat",
    hint: "External conditions that could harm",
    className: "border-rose-200 bg-rose-50/60",
    ink: "text-rose-800",
  },
};
export const frequencies = [
  ["DAILY", "Daily"],
  ["WEEKLY", "Weekly"],
  ["FORTNIGHTLY", "Every two weeks (14 days)"],
  ["TWICE_MONTHLY", "Twice monthly"],
  ["MONTHLY", "Monthly"],
  ["QUARTERLY", "Quarterly"],
  ["HALF_YEARLY", "Half-yearly"],
  ["YEARLY", "Yearly"],
];
export const responseLabels: Record<string, string> = {
  "": "Not decided",
  OBJECTIVE: "Create / link an objective",
  ACTION: "Action within an existing plan",
  MONITOR: "Monitor",
  NONE: "No action now",
};
export function Status({
  status,
  swot = false,
}: {
  status: string;
  swot?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === "APPROVED" ? "bg-gemba-lime/15 text-gemba-lime-ink" : status === "IN_REVIEW" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}
    >
      {status === "APPROVED"
        ? swot
          ? "Reviewed & finalised"
          : "Approved & locked"
        : status === "IN_REVIEW"
          ? "Under review"
          : "Draft"}
    </span>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const field = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          "aria-labelledby"?: string;
          "aria-describedby"?: string;
        }>,
        {
          "aria-labelledby": id,
          "aria-describedby": hint ? `${id}-hint` : undefined,
        },
      )
    : children;
  return (
    <label className="block min-w-0 text-sm font-medium text-gemba-navy">
      <span id={id} className="block">
        {label}
      </span>
      {field}
      {hint && (
        <span
          id={`${id}-hint`}
          className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground"
        >
          {hint}
        </span>
      )}
    </label>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={`${card} py-12 text-center`}>
      <h2 className="text-lg font-semibold text-gemba-navy">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {children}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </section>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  description,
  progress,
  footer,
  scrollKey,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  description?: string;
  progress?: ReactNode;
  footer?: ReactNode;
  scrollKey?: string | number;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    ref.current
      ?.querySelector("[data-planning-modal-body]")
      ?.scrollTo({ top: 0 });
  }, [scrollKey]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40 ${wide ? "max-w-5xl" : "max-w-3xl"}`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <h2 id={id} className="text-lg font-semibold text-gemba-navy">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </Button>
        </div>
        {progress && (
          <div className="shrink-0 border-b border-border px-5 py-3 sm:px-7">
            {progress}
          </div>
        )}
        <div
          data-planning-modal-body
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7"
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-muted/25 px-4 py-3 sm:px-7">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
export function Tabs({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  items: [string, string][];
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {items.map(([key, title]) => (
        <button
          type="button"
          key={key}
          onClick={() => onChange(key)}
          aria-current={value === key ? "page" : undefined}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${value === key ? "bg-gemba-navy text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
        >
          {title}
        </button>
      ))}
    </nav>
  );
}
export function ErrorList({ error }: { error: string }) {
  return error ? (
    <div
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm whitespace-pre-line text-destructive"
    >
      {error}
    </div>
  ) : null;
}
