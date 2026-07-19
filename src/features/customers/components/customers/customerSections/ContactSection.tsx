import { useFormContext } from "react-hook-form";
import { TextField } from "@/components/forms/fields";
import { FormSection } from "@/components/forms/FormSection";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function ContactSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <FormSection title="Contacto">
      <TextField
        control={control}
        name="contact_person"
        label="Persona de Contacto"
        placeholder="María García"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          control={control}
          name="email"
          label="Correo"
          type="email"
          placeholder="contacto@empresa.com"
        />
        <TextField
          control={control}
          name="phone"
          label="Teléfono"
          placeholder="+52 81 1234 5678"
        />
      </div>
      <TextField
        control={control}
        name="website"
        label="Sitio Web"
        placeholder="https://empresa.com"
      />
    </FormSection>
  );
}
