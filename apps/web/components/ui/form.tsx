"use client";

import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { useRender } from "@base-ui/react/use-render";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const Form = FormProvider;
const FieldContext = React.createContext<{ name: string } | null>(null);
const ItemContext = React.createContext<string | null>(null);

function FormField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>(props: ControllerProps<TValues, TName>) {
  return (
    <FieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FieldContext.Provider>
  );
}

function useFormField() {
  const field = React.useContext(FieldContext);
  const id = React.useContext(ItemContext);
  const form = useFormContext();
  if (!form || !field || !id) {
    throw new Error("Form helpers require Form, FormField and FormItem");
  }
  const state = useFormState({ control: form.control, name: field.name });
  return {
    ...form.getFieldState(field.name, state),
    id: `${id}-control`,
    labelId: `${id}-label`,
    descriptionId: `${id}-description`,
    messageId: `${id}-message`,
  };
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();
  return (
    <ItemContext.Provider value={id}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </ItemContext.Provider>
  );
}

function FormLabel(props: React.ComponentProps<typeof Label>) {
  const { id, labelId, error } = useFormField();
  return (
    <Label
      data-slot="form-label"
      id={labelId}
      htmlFor={id}
      data-invalid={!!error}
      {...props}
    />
  );
}

// Base UI's render composition merges the child's handlers and refs without a Radix Slot.
// Include FormDescription beside the control; its stable ID remains available on errors.
function FormControl({ children }: { children: React.ReactElement }) {
  const { id, labelId, error, descriptionId, messageId } = useFormField();
  return useRender({
    defaultTagName: "div",
    render: children,
    props: {
      id,
      "data-slot": "form-control",
      "aria-invalid": !!error,
      "aria-labelledby": labelId,
      "aria-describedby": error
        ? `${descriptionId} ${messageId}`
        : descriptionId,
    },
  });
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { descriptionId } = useFormField();
  return (
    <p
      data-slot="form-description"
      id={descriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function FormMessage({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  const { error, messageId } = useFormField();
  const message = error?.message ? String(error.message) : children;
  if (!message) return null;
  return (
    <p
      data-slot="form-message"
      id={messageId}
      role="alert"
      className={cn("text-sm text-danger", className)}
      {...props}
    >
      {message}
    </p>
  );
}

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
};
