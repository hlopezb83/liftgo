import { useFormContext } from "react-hook-form";
import { TextField } from "@/components/forms/fields";
import { FormSection } from "@/components/forms/FormSection";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function IdentitySection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <FormSection title="Identidad" first>
      <TextField
        control={control}
        name="name"
        label="Nombre / Razón Social"
        required
        placeholder="MONTACARGAS DEL NORTE"
      />
    </FormSection>
  );
}
