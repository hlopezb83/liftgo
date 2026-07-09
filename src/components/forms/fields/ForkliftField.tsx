import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequiredMark } from "@/components/forms/RequiredMark";
import type { Tables } from "@/integrations/supabase/types";

interface ForkliftFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  forklifts: Tables<"forklifts">[];
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  showStatus?: boolean;
  className?: string;
}

/**
 * Selector RHF de montacargas. A diferencia de Customer/Supplier no consulta
 * datos por su cuenta — recibe la lista ya filtrada por disponibilidad/fechas.
 */
export function ForkliftField<TFieldValues extends FieldValues>({
  control,
  name,
  forklifts,
  label = "Montacargas",
  description,
  required,
  disabled,
  disabledReason,
  showStatus,
  className,
}: ForkliftFieldProps<TFieldValues>) {
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
            onValueChange={field.onChange}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={disabled ? (disabledReason ?? "No disponible") : "Seleccionar montacargas"} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {forklifts.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.manufacturer} {f.model} — {f.name}
                  {showStatus ? ` (${f.status})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          {!disabled && forklifts.length === 0 && (
            <FormDescription>No hay montacargas disponibles.</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
