import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { CustomerFormData } from "../../../lib/customerFormSchema";
import { SectionHeading } from "./SectionHeading";

export function AddressNotesSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <>
      <div className="space-y-3">
        <SectionHeading>Dirección</SectionHeading>
        <FormField control={control} name="address" render={({ field }) => (
          <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input placeholder="Av. Reforma 123, Col. Centro, CDMX" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="space-y-3">
        <SectionHeading>Interno</SectionHeading>
        <FormField control={control} name="notes" render={({ field }) => (
          <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea placeholder="Notas adicionales..." rows={3} {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
    </>
  );
}
