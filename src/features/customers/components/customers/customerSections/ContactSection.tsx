import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SectionHeading } from "@/components/forms/SectionHeading";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function ContactSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <div className="space-y-3 border-t pt-4">
      <SectionHeading>Contacto</SectionHeading>
      <FormField control={control} name="contact_person" render={({ field }) => (
        <FormItem><FormLabel>Persona de Contacto</FormLabel><FormControl><Input placeholder="María García" {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <div className="grid grid-cols-2 gap-4">
        <FormField control={control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Correo</FormLabel><FormControl><Input placeholder="contacto@empresa.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input placeholder="+52 81 1234 5678" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <FormField control={control} name="website" render={({ field }) => (
        <FormItem><FormLabel>Sitio Web</FormLabel><FormControl><Input placeholder="https://empresa.com" {...field} /></FormControl><FormMessage /></FormItem>
      )} />
    </div>
  );
}
