import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { CustomerFormData } from "../../../lib/customerFormSchema";
import { SectionHeading } from "./SectionHeading";

export function IdentitySection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <div className="space-y-3">
      <SectionHeading>Identidad</SectionHeading>
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre / Razón Social *</FormLabel>
            <FormControl>
              <Input placeholder="MONTACARGAS DEL NORTE" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
