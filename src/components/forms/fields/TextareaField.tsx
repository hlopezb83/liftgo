import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/forms/RequiredMark";

interface TextareaFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
  className?: string;
}

export function TextareaField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  required,
  disabled,
  rows = 3,
  maxLength,
  showCount,
  className,
}: TextareaFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = (field.value ?? "") as string;
        return (
          <FormItem className={className}>
            <FormLabel>
              {label}
              {required && <RequiredMark />}
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                rows={rows}
                maxLength={maxLength}
              />
            </FormControl>
            {(description || (showCount && maxLength)) && (
              <div className="flex justify-between">
                {description ? <FormDescription>{description}</FormDescription> : <span />}
                {showCount && maxLength && (
                  <span className="text-xs text-muted-foreground">
                    {value.length} / {maxLength}
                  </span>
                )}
              </div>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
