import { createContext, useContext, useId } from "react";
import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributes, Ref } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
  type FieldError,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const ORPHAN_NAME = "__orphan__";

const useFormField = () => {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  // R10 Bloque 1a: `useFormContext()` puede devolver null si un `Form*` se
  // renderiza fuera de <Form>. Degradamos sin crashear.
  const ctx = useFormContext();
  const control = ctx?.control;
  // Hooks siempre llamados, incluso sin fieldContext, con un nombre inofensivo
  // que no toca ningún slice real del form.
  const name = fieldContext?.name ?? ORPHAN_NAME;
  const { errors } = useFormState({ control, name });

  const id = itemContext?.id ?? "";
  const baseIds = {
    id,
    formItemId: id ? `${id}-form-item` : "",
    formDescriptionId: id ? `${id}-form-item-description` : "",
    formMessageId: id ? `${id}-form-item-message` : "",
  };

  if (!fieldContext || !control) {
    // Degradación segura: componente huérfano se renderiza sin wiring de error.
    return { name: "", error: undefined as FieldError | undefined, ...baseIds };
  }

  const error = fieldContext.name
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), errors) as
    | FieldError
    | undefined;

  return {
    name: fieldContext.name,
    error,
    ...baseIds,
  };
};


type FormItemContextValue = {
  id: string;
};

const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);

const FormItem = ({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) => {
    const id = useId();

    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn("space-y-2", className)} {...props} />
      </FormItemContext.Provider>
    );
  };
FormItem.displayName = "FormItem";

const FormLabel = ({ className, ref, ...props }: ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { ref?: Ref<ElementRef<typeof LabelPrimitive.Root>> }) => {
  const { error, formItemId } = useFormField();

  return <Label ref={ref} className={cn(error && "text-destructive", className)} htmlFor={formItemId} {...props} />;
};
FormLabel.displayName = "FormLabel";

const FormControl = ({ ref, ...props }: ComponentPropsWithoutRef<typeof Slot> & { ref?: Ref<ElementRef<typeof Slot>> }) => {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

    return (
      <Slot
        ref={ref}
        id={formItemId}
        aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
        aria-invalid={!!error}
        {...props}
      />
    );
  };
FormControl.displayName = "FormControl";

const FormDescription = ({ className, ref, ...props }: HTMLAttributes<HTMLParagraphElement> & { ref?: Ref<HTMLParagraphElement> }) => {
    const { formDescriptionId } = useFormField();

    return <p ref={ref} id={formDescriptionId} className={cn("text-sm text-muted-foreground", className)} {...props} />;
  };
FormDescription.displayName = "FormDescription";

// Bloque 19a (R7): errores de arrays (`rentalLines[]`) llegan como objeto sin
// `.message` en la raíz y `String(undefined)` renderizaba literal "undefined".
// Buscamos recursivamente el primer `message` disponible en la sub-estructura.
function extractFirstMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { message?: unknown; types?: Record<string, unknown> };
  if (typeof e.message === "string" && e.message.length > 0) return e.message;
  for (const key of Object.keys(err)) {
    if (key === "ref" || key === "type" || key === "types") continue;
    const found = extractFirstMessage((err as Record<string, unknown>)[key]);
    if (found) return found;
  }
  return undefined;
}

const FormMessage = ({ className, children, ref, ...props }: HTMLAttributes<HTMLParagraphElement> & { ref?: Ref<HTMLParagraphElement> }) => {
    const { error, formMessageId } = useFormField();
    const body = error ? extractFirstMessage(error) : children;

    if (!body) {
      return null;
    }

    return (
      <p ref={ref} id={formMessageId} className={cn("text-sm font-medium text-destructive", className)} {...props}>
        {body}
      </p>
    );
  };
FormMessage.displayName = "FormMessage";

export { useFormField, Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField };
