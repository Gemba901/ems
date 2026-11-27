"use client";
import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
export interface FormFieldControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}
export interface FormFieldProps {
  label: string;
  description?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactElement<FormFieldControlProps>;
  id?: string;
}
/** Visual field wrapper. RHF callers pass field props to the child; do not nest ui/form FormControl. */
export function FormField({
  label,
  description,
  error,
  required,
  children,
  id,
}: FormFieldProps) {
  const generated = useId();
  const controlId = id ?? children.props.id ?? generated;
  const described =
    [
      children.props["aria-describedby"],
      description ? `${controlId}-help` : null,
      error ? `${controlId}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={controlId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
      {cloneElement(children, {
        id: controlId,
        "aria-describedby": described,
        "aria-invalid": !!error,
        "aria-required": required,
      })}
      {description && (
        <p
          id={`${controlId}-help`}
          className="text-caption text-muted-foreground"
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={`${controlId}-error`}
          role="alert"
          className="text-caption text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
