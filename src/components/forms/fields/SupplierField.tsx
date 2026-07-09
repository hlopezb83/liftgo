import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { useSuppliers } from "@/features/suppliers/hooks/useSuppliers";

interface SupplierFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Si true, incluye opción "Sin proveedor" que persiste null. */
  allowEmpty?: boolean;
  className?: string;
}

const EMPTY = "_none";

export function SupplierField<TFieldValues extends FieldValues>({
  control,
  name,
  label = "Proveedor",
  description,
  required,
  disabled,
  allowEmpty = false,
  className,
}: SupplierFieldProps<TFieldValues>) {
  const { data: suppliers, isLoading } = useSuppliers();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const rawValue = (field.value as string | null | undefined) ?? "";
        const value = rawValue === "" && allowEmpty ? EMPTY : rawValue;
        return (
          <FormItem className={className}>
            <FormLabel>
              {label}
              {required && <RequiredMark />}
            </FormLabel>
            <Select
              value={value}
              onValueChange={(v) => field.onChange(v === EMPTY ? null : v)}
              disabled={disabled || isLoading}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? "Cargando…" : "Seleccionar proveedor"} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {allowEmpty && <SelectItem value={EMPTY}>Sin proveedor</SelectItem>}
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
