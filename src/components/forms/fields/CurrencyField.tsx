import { useState } from "react";
import { type FieldPath, type FieldValues, type Control, type ControllerRenderProps } from "react-hook-form";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/lib/config";
import { sanitizeNumericInput } from "./sanitizeNumericInput";

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

// Instancia única (mismo criterio de caché que formatCurrency): separador de
// miles es-MX, siempre 2 decimales para el display en reposo.
const displayFormatter = new Intl.NumberFormat(APP_CONFIG.LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isRenderableNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Campo de moneda. Almacena `number | null`, muestra prefijo $ y sufijo (MXN/USD).
 * Formatea con separador de miles al hacer blur; edita como número plano al enfocarse.
 *
 * El input es `type="text"` (con `inputMode="decimal"`) porque un `type="number"`
 * no puede mostrar separadores de miles: el navegador rechaza el value formateado
 * y el campo aparecería vacío. El valor de RHF siempre es el número crudo, sin
 * separadores; el string formateado es solo display local.
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
      render={({ field }) => (
        <CurrencyFieldInner
          field={field}
          label={label}
          currency={currency}
          description={description}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          min={min}
          className={className}
        />
      )}
    />
  );
}

function CurrencyFieldInner<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  field,
  label,
  currency,
  description,
  placeholder,
  required,
  disabled,
  min = 0,
  className,
}: {
  field: ControllerRenderProps<TFieldValues, TName>;
  label: string;
  currency: Currency;
  description?: string;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  className?: string;
}) {
  // `raw` solo vive mientras el campo está enfocado: al enfocar se siembra con
  // el valor crudo y al salir se descarta, de modo que un cambio externo del
  // valor (reset del form, initialValues diferidos) siempre se refleja.
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");

  const displayValue = editing
    ? raw
    : isRenderableNumber(field.value)
      ? displayFormatter.format(field.value)
      : "";

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
            {...field}
            type="text"
            inputMode="decimal"
            onInvalid={(e) =>
              e.currentTarget.setCustomValidity(
                min !== undefined ? `Introduce un valor mayor o igual a ${min}` : "Introduce un valor válido",
              )
            }
            onInput={(e) => e.currentTarget.setCustomValidity("")}
            value={displayValue}
            onChange={(e) => {
              const next = sanitizeNumericInput(e.target.value);
              setRaw(next);
              if (next === "") {
                field.onChange(null);
                return;
              }
              const n = Number(next);
              field.onChange(Number.isFinite(n) ? n : null);
            }}
            onFocus={() => {
              setRaw(isRenderableNumber(field.value) ? String(field.value) : "");
              setEditing(true);
            }}
            onBlur={() => {
              setEditing(false);
              setRaw("");
              field.onBlur();
            }}
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
}
