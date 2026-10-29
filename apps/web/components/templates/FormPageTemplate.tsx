"use client";
import { useId, type ReactNode, type FormEventHandler } from "react";
import {
  PageHeader,
  type PageHeaderProps,
} from "@/components/patterns/PageHeader";
import { FormSection } from "@/components/patterns/FormSection";
import {
  FormActions,
  type FormActionsProps,
} from "@/components/patterns/FormActions";
export interface FormPageSection {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
}
export interface FormPageTemplateProps {
  header: PageHeaderProps;
  sections: FormPageSection[];
  onSubmit: FormEventHandler<HTMLFormElement>;
  actions?: FormActionsProps;
  error?: string;
  noValidate?: boolean;
  id?: string;
}
/** The caller owns validation, pending state and persistence. Do not nest another form. */
export function FormPageTemplate({
  header,
  sections,
  onSubmit,
  actions,
  error,
  noValidate = false,
  id,
}: FormPageTemplateProps) {
  const generated = useId();
  const formId = id ?? generated;
  return (
    <div
      data-slot="form-page-template"
      className="min-w-0 space-y-section text-body"
    >
      <PageHeader {...header} />
      <form
        id={formId}
        aria-label={header.title}
        aria-busy={actions?.pending || undefined}
        noValidate={noValidate}
        onSubmit={(event) => {
          if (actions?.pending || actions?.disabled) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
        className="min-w-0 space-y-section [&_input]:scroll-mb-32 [&_textarea]:scroll-mb-32 [&_button]:scroll-mb-32"
      >
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger bg-danger-subtle p-card text-danger"
          >
            {error}
          </p>
        )}
        {sections.map((section) => (
          <FormSection
            key={section.id}
            title={section.title}
            description={section.description}
          >
            {section.content}
          </FormSection>
        ))}
        <div
          data-slot="sticky-form-actions"
          className="sticky bottom-0 z-10 bg-background pb-4"
        >
          <FormActions {...actions} />
        </div>
      </form>
    </div>
  );
}
