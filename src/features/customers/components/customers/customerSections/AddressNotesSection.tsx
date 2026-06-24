import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSection } from "@/components/forms/FormSection";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function AddressNotesSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <>
      <FormSection title="Dirección">
        <FormField control={control} name="address" render={({ field }) => (
          <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input placeholder="Av. Industrial 123, Col. Centro, 64000, Monterrey" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </FormSection>
      <FormSection title="Interno">
        <FormField control={control} name="notes" render={({ field }) => (
          <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea placeholder="Notas internas sobre el cliente…" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </FormSection>
    </>
  );
}
