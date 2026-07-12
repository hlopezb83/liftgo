import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import type { Matcher } from "react-day-picker";

interface DateFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  required?: boolean;
  disabledMatcher?: Matcher | Matcher[];
}

/**
 * Wrapper RHF sobre DatePickerField. Almacena `Date | undefined` en el form.
 * En submit conviene mapear con `toYMD(value)` para columnas Postgres tipo `date`.
 */
export function DateField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  required,
  disabledMatcher,
}: DateFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormControl>
            <DatePickerField
              label={label}
              date={field.value as Date | undefined}
              onSelect={field.onChange}
              placeholder={placeholder}
              required={required}
              error={fieldState.error?.message}
              disabled={disabledMatcher}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
