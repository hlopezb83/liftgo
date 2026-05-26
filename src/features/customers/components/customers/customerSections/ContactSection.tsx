import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { CustomerFormData } from "@/features/customers/lib/customerFormSchema";
import { SectionHeading } from "./SectionHeading";

export function ContactSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <div className="space-y-3">
      <SectionHeading>Contacto</SectionHeading>
      <div className="grid grid-cols-2 gap-4">
        <FormField control={control} name="contact_person" render={({ field }) => (
          <FormItem><FormLabel>Persona de Contacto</FormLabel><FormControl><Input placeholder="María García" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="representante_legal" render={({ field }) => (
          <FormItem><FormLabel>Representante Legal (opcional)</FormLabel><FormControl><Input placeholder="Lic. Juan Pérez" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField control={control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Correo</FormLabel><FormControl><Input placeholder="contacto@empresa.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input placeholder="+52 55 1234 5678" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <FormField control={control} name="website" render={({ field }) => (
        <FormItem><FormLabel>Sitio Web</FormLabel><FormControl><Input placeholder="https://example.com" {...field} /></FormControl><FormMessage /></FormItem>
      )} />
    </div>
  );
}
