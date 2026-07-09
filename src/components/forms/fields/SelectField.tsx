import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequiredMark } from "@/components/forms/RequiredMark";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: SelectOption[];
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  description,
  placeholder = "Seleccionar…",
  required,
  disabled,
  className,
}: SelectFieldProps<TFieldValues>) {
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
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
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
