import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/forms/RequiredMark";

type Currency = "MXN" | "USD";

interface CurrencyFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  currency?: Currency;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  className?: string;
}

/**
 * Campo de moneda. Almacena `number | null`, muestra prefijo $ y sufijo (MXN/USD).
 * Formatea con separador de miles al hacer blur; edita como número plano al enfocarse.
 */
export function CurrencyField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  currency = "MXN",
  description,
  placeholder = "0.00",
  required,
  disabled,
  min = 0,
  className,
}: CurrencyFieldProps<TFieldValues>) {
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
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={min}
                  value={displayValue}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      field.onChange(null);
                      return;
                    }
                    const n = Number(raw);
                    field.onChange(Number.isFinite(n) ? n : null);
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  placeholder={placeholder}
                  disabled={disabled}
                  className="pl-6 pr-14 text-right tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">
                  {currency}
                </span>
              </div>
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
