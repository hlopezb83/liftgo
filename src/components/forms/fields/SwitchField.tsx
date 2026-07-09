import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormControl, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";

interface SwitchFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function SwitchField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: SwitchFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={`flex flex-row items-center justify-between rounded-md border p-3 ${className ?? ""}`}>
          <div className="space-y-0.5 pr-4">
            <FormLabel className="cursor-pointer">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </div>
          <FormControl>
            <Switch
              checked={!!field.value}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
