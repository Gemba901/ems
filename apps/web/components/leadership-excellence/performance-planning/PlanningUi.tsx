"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button as SharedButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";

const buttonStyles = {
  default: "bg-[#52618a] text-primary-foreground hover:bg-[#445174]",
  outline:
    "border-border bg-card text-foreground hover:border-border hover:bg-muted hover:text-foreground",
  secondary: "bg-primary/10 text-primary hover:bg-primary/10",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  destructive:
    "bg-danger-subtle text-danger hover:bg-danger-subtle focus-visible:border-danger focus-visible:ring-danger/20",
  link: "text-primary hover:text-primary",
  // Kit variant with no local override; the shared Button styling applies.
  "destructive-solid": "",
};
const buttonSizes = {
  default: "h-auto min-h-10 gap-2 px-4 py-2",
  xs: "h-auto min-h-7 gap-1 px-2 py-1 text-xs",
  sm: "h-auto min-h-9 gap-1.5 px-3 py-1.5 text-xs",
  lg: "h-auto min-h-11 gap-2 px-5 py-2.5",
  icon: "size-10",
  "icon-xs": "size-7",
  "icon-sm": "size-9",
  "icon-lg": "size-11",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<typeof SharedButton>) {
  return (
    <SharedButton
      variant={variant}
      size={size}
      className={cn(
        "min-w-0 max-w-full whitespace-normal rounded-lg leading-5 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
        buttonStyles[variant || "default"],
        buttonSizes[size || "default"],
        className,
      )}
      {...props}
    />
  );
}

export const card =
  "min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6";
export const control =
  "mt-1.5 min-h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60";
export const categories = {
  S: {
    label: "Strengths",
    singular: "Strength",
    hint: "Internal capabilities and advantages",
    className: "border-info/30 bg-info-subtle/60",
    ink: "text-info",
  },
  W: {
    label: "Weaknesses",
    singular: "Weakness",
    hint: "Internal gaps and limitations",
    className: "border-primary/30 bg-primary/5",
    ink: "text-primary",
  },
  O: {
    label: "Opportunities",
    singular: "Opportunity",
    hint: "External conditions that could help",
    className: "border-success/30 bg-success-subtle/60",
    ink: "text-success",
  },
  T: {
    label: "Threats",
    singular: "Threat",
    hint: "External conditions that could harm",
    className: "border-danger/30 bg-danger-subtle/60",
    ink: "text-danger",
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
  MAINTAIN: "Maintain strength",
  USE: "Use for opportunity",
  DEFER: "Defer",
  VERIFY: "Verify evidence",
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
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-medium ${status === "APPROVED" ? "bg-success-subtle text-success" : status === "IN_REVIEW" ? "bg-warning-subtle text-warning" : "bg-muted text-muted-foreground"}`}
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
    <label className="block min-w-0 text-sm font-medium text-foreground">
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
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
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
        // Escape dismisses only the top dialog, including portalled pickers.
        event.stopPropagation();
        onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-primary/40 ${wide ? "max-w-5xl" : "max-w-3xl"}`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={id} className="text-lg font-semibold text-foreground">
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
          <div className="shrink-0 border-b border-border bg-muted/70 px-4 py-3 sm:px-6">
            {progress}
          </div>
        )}
        <div
          data-planning-modal-body
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-muted px-4 py-3 sm:px-6">
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
        <UiButton variant="ghost"
          type="button"
          key={key}
          onClick={() => onChange(key)}
          aria-current={value === key ? "page" : undefined}
          className={`whitespace-normal min-h-10 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${value === key ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          {title}
        </UiButton>
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
