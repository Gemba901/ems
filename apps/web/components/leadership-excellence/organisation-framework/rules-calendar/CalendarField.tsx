"use client";
import {
  createContext,
  useContext,
  useId,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  type HTMLAttributes,
} from "react";
import { Input } from "@/components/ui/input";
import { fieldId, type CalendarIssue } from "./calendar-issues";
import styles from "./rules-calendar.module.css";

export const CalendarFeedback = createContext<{
  issues: CalendarIssue[];
  shown: boolean;
  active: string;
}>({ issues: [], shown: false, active: "" });

export function FieldFrame({
  field,
  children,
  className = "",
}: {
  field?: string;
  children: ReactNode;
  className?: string;
}) {
  const feedback = useContext(CalendarFeedback);
  const issue =
    field && feedback.shown
      ? feedback.issues.find((i) => i.field === field)
      : undefined;
  return (
    <div
      id={field ? fieldId(field) : undefined}
      tabIndex={field ? -1 : undefined}
      className={`${styles.fieldFrame} ${className}`}
      data-highlighted={!!field && feedback.active === field}
      data-invalid={!!issue}
    >
      {children}
      {issue && (
        <p
          id={`${fieldId(field!)}-error`}
          className={styles.fieldError}
          role="alert"
        >
          {issue.message}
        </p>
      )}
    </div>
  );
}

export function CalendarField({
  field,
  label,
  children,
}: {
  field?: string;
  label: string;
  children: ReactNode;
}) {
  const { issues, shown } = useContext(CalendarFeedback);
  const generatedId = useId();
  const controlId =
    (isValidElement(children)
      ? (children.props as HTMLAttributes<HTMLElement>).id
      : undefined) ??
    (field ? `${fieldId(field)}-input` : `calendar-control-${generatedId}`);
  const invalid = !!field && shown && issues.some((i) => i.field === field);
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<HTMLAttributes<HTMLElement>>, {
        id: controlId,
        ...(children.type === Input
          ? {
              name: (children.props as { name?: string }).name ?? controlId,
              autoComplete: "off",
            }
          : {}),
        "aria-invalid": invalid
          ? true
          : (children.props as HTMLAttributes<HTMLElement>)["aria-invalid"],
        "aria-describedby": invalid
          ? `${fieldId(field!)}-error`
          : (children.props as HTMLAttributes<HTMLElement>)["aria-describedby"],
      })
    : children;
  return (
    <FieldFrame field={field}>
      <div className={`${styles.formField} text-sm`}>
        <label htmlFor={controlId} className={styles.fieldLabel}>
          {label}
        </label>
        {control}
      </div>
    </FieldFrame>
  );
}
