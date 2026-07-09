import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import type { DateRange } from "react-day-picker";
import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";

interface DateRangeFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  required?: boolean;
}

/**
 * Wrapper RHF sobre DateRangePickerField. Almacena `DateRange | undefined`.
 * En submit mapear `.from`/`.to` con `toYMD()` para persistir en columnas `date`.
 */
export function DateRangeField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  required,
}: DateRangeFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormControl>
            <DateRangePickerField
              label={label}
              dateRange={field.value as DateRange | undefined}
              onSelect={field.onChange}
              placeholder={placeholder}
              required={required}
              error={fieldState.error?.message}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
