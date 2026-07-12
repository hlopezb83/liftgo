import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface NumberFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Si true, cadena vacía se convierte a null; si false, a undefined. Default: null. */
  nullOnEmpty?: boolean;
  className?: string;
}

/**
 * Input numérico. Almacena `number | null | undefined` en el form.
 * Los strings de entrada se convierten a Number en onChange.
 */
export function NumberField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  required,
  disabled,
  min,
  max,
  step,
  nullOnEmpty = true,
  className,
}: NumberFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const displayValue =
          field.value === null || field.value === undefined ? "" : String(field.value);
        return (
          <FormItem className={className}>
            <FormLabel>
              {label}
              {required && <RequiredMark />}
            </FormLabel>
            <FormControl>
              <Input
                type="number"
                inputMode="decimal"
                value={displayValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    field.onChange(nullOnEmpty ? null : undefined);
                    return;
                  }
                  const n = Number(raw);
                  field.onChange(Number.isFinite(n) ? n : nullOnEmpty ? null : undefined);
                }}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
                placeholder={placeholder}
                disabled={disabled}
                min={min}
                max={max}
                step={step}
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
