import { useFormContext } from "react-hook-form";
import { FormSection } from "@/components/forms/FormSection";
import { TextField, TextareaField } from "@/components/forms/fields";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function AddressNotesSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <>
      <FormSection title="Dirección">
        <TextField
          control={control}
          name="address"
          label="Dirección"
          placeholder="Av. Industrial 123, Col. Centro, 64000, Monterrey"
        />
      </FormSection>
      <FormSection title="Interno">
        <TextareaField
          control={control}
          name="notes"
          label="Notas"
          rows={3}
          placeholder="Notas internas sobre el cliente…"
        />
      </FormSection>
    </>
  );
}
