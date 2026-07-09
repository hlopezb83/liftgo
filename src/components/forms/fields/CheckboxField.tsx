import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormControl, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";

interface CheckboxFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function CheckboxField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: CheckboxFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={`flex flex-row items-start gap-3 space-y-0 ${className ?? ""}`}>
          <FormControl>
            <Checkbox
              checked={!!field.value}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
          </FormControl>
          <div className="space-y-1 leading-none">
            <FormLabel className="cursor-pointer">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}
