import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps<TFieldValues extends FieldValues, TContext = unknown, TTransformedValues = TFieldValues> {
  control: Control<TFieldValues, TContext, TTransformedValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: SelectOption[];
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Keep long option labels readable within the trigger and viewport width. */
  wrapOptions?: boolean;
  /** Runs after the field value changes through user selection. */
  onValueChange?: (value: string) => void;
}

export function SelectField<TFieldValues extends FieldValues, TContext = unknown, TTransformedValues = TFieldValues>({
  control,
  name,
  label,
  options,
  description,
  placeholder = "Seleccionar…",
  required,
  disabled,
  className,
  wrapOptions = false,
  onValueChange,
}: SelectFieldProps<TFieldValues, TContext, TTransformedValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {required && <RequiredMark />}
          </FormLabel>
          <Select
            value={(field.value as string | undefined) ?? ""}
            onValueChange={(value) => { field.onChange(value); onValueChange?.(value); }}
            disabled={disabled}
          >
            <FormControl>
              {/* R7-FE-07b (N7-UX-08): nombre accesible explícito — el select
                  nativo oculto de Radix no hereda el FormLabel. */}
              <SelectTrigger aria-label={label}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent className={wrapOptions ? "w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]" : undefined}>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}
                  className={wrapOptions ? "[&>span:last-child]:min-w-0" : undefined}>
                  {wrapOptions ? <span className="block whitespace-normal [overflow-wrap:anywhere]">{opt.label}</span> : opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
