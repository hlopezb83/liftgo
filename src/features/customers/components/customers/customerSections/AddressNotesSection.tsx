import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SectionHeading } from "@/components/forms/SectionHeading";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function AddressNotesSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <>
      <div className="space-y-3 border-t pt-4">
        <SectionHeading>Dirección</SectionHeading>
        <FormField control={control} name="address" render={({ field }) => (
          <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input placeholder="Av. Industrial 123, Col. Centro, 64000, Monterrey" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="space-y-3 border-t pt-4">
        <SectionHeading>Interno</SectionHeading>
        <FormField control={control} name="notes" render={({ field }) => (
          <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea placeholder="Notas internas sobre el cliente…" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
    </>
  );
}
