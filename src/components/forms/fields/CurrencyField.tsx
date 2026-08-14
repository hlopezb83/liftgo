import { useEffect, useRef, useState } from "react";
import { type FieldPath, type FieldValues, type Control, type ControllerRenderProps } from "react-hook-form";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/lib/config";

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
 * Normaliza la entrada del usuario: solo dígitos, un punto decimal, hasta 2 decimales.
 *
 * Regla es-MX (`,` = separador de miles, `.` = separador decimal). Una coma NO
 * puede tratarse siempre como decimal: el display en reposo es "1,234.50" y al
 * copiar/pegarlo la versión anterior lo corrompía a "1.23" (~1000× menos).
 * Pre-proceso de comas, antes de la regla de punto único:
 * 1. Si hay AMBOS `,` y `.` → se eliminan TODAS las `,` (son miles).
 * 2. Si solo hay `,`:
 *    - más de una `,` → se eliminan todas (miles);
 *    - exactamente una `,` → si va seguida de EXACTAMENTE 3 dígitos hasta el
 *      final se elimina (miles: "1,234" → "1234"); en otro caso se reemplaza
 *      por `.` (decimal: "0,5" → "0.5", "12,34" → "12.34").
 */
export function sanitizeNumericInput(raw: string): string {
  let input = raw;
  if (input.includes(",") && input.includes(".")) {
    input = input.replace(/,/g, "");
  } else if (input.includes(",")) {
    const commas = input.split(",").length - 1;
    if (commas > 1) {
      input = input.replace(/,/g, "");
    } else {
      const tail = input.slice(input.indexOf(",") + 1);
      input = /^\d{3}$/.test(tail) ? input.replace(",", "") : input.replace(",", ".");
    }
  }
  let out = "";
  let dotSeen = false;
  let decimals = 0;
  for (const ch of input) {
    if (ch >= "0" && ch <= "9") {
      if (dotSeen) {
        if (decimals >= 2) continue;
        decimals += 1;
      }
      out += ch;
    } else if (ch === "." && !dotSeen) {
      dotSeen = true;
      out += ".";
    }
  }
  return out;
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
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const prevValueRef = useRef<unknown>(field.value);

  // Sincroniza cambios externos del valor (reset de form, initialValues
  // diferidos) mientras el campo NO está en edición.
  useEffect(() => {
    if (prevValueRef.current === field.value) return;
    prevValueRef.current = field.value;
    if (!editing) setRaw("");
  }, [field.value, editing]);

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
              field.onBlur();
            }}
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
}
