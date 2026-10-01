import { useFormContext, type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormField, FormItem, FormControl } from "@/components/ui/form";
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
  const form = useFormContext<TFieldValues>();
  // Controller reutiliza defaultValues cuando el campo queda en undefined.
  // Leemos el valor actual para conservar vaciados y capturas inválidas.
  const currentForm = form?.control === control ? form : undefined;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormControl>
            <DatePickerField
              label={label}
              date={(currentForm ? currentForm.getValues(name) : field.value) as Date | undefined}
              onSelect={field.onChange}
              placeholder={placeholder}
              required={required}
              disabled={disabledMatcher}
              error={fieldState.error?.message}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
