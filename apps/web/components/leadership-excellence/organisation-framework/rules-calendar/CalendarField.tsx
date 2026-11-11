"use client";
import {
  createContext,
  useContext,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  type HTMLAttributes,
} from "react";
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
  const invalid = !!field && shown && issues.some((i) => i.field === field);
  const control =
    field && isValidElement(children)
      ? cloneElement(children as ReactElement<HTMLAttributes<HTMLElement>>, {
          "aria-invalid": invalid
            ? true
            : (children.props as HTMLAttributes<HTMLElement>)["aria-invalid"],
          "aria-describedby": invalid
            ? `${fieldId(field)}-error`
            : (children.props as HTMLAttributes<HTMLElement>)[
                "aria-describedby"
              ],
        })
      : children;
  return (
    <FieldFrame field={field}>
      <label className={`${styles.formField} text-sm`}>
        <span>{label}</span>
        {control}
      </label>
    </FieldFrame>
  );
}
