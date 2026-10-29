import type { ReactNode } from "react";
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-border p-card">
      <legend className="px-1 text-section-title">{title}</legend>
      {description && (
        <p className="text-body text-muted-foreground">{description}</p>
      )}
      {children}
    </fieldset>
  );
}
