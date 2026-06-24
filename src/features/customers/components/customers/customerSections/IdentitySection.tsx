import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSection } from "@/components/forms/FormSection";
import { RequiredMark } from "@/components/forms/RequiredMark";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function IdentitySection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <FormSection title="Identidad" first>
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre / Razón Social <RequiredMark /></FormLabel>
            <FormControl>
              <Input placeholder="MONTACARGAS DEL NORTE" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormSection>
  );
}
