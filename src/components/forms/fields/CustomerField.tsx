import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";

interface CustomerFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Selector RHF de cliente. Guarda el `customer.id` en el form.
 * Para casos con nombre manual (walk-in), usar el `CustomerSelector` original.
 */
export function CustomerField<TFieldValues extends FieldValues>({
  control,
  name,
  label = "Cliente",
  description,
  required,
  disabled,
  className,
}: CustomerFieldProps<TFieldValues>) {
  const { data: customers, isLoading } = useCustomers();
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
            disabled={disabled || isLoading}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Cargando…" : "Seleccionar cliente"} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.company_name && c.company_name !== c.name ? ` — ${c.company_name}` : ""}
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
