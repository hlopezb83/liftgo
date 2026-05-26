import type { CustomerFormData } from "@/features/customers/lib/customerFormSchema";

const NULLABLE_FIELDS = [
  "email", "phone", "address", "notes", "website", "contact_person",
  "rfc", "razon_social", "regimen_fiscal", "uso_cfdi", "domicilio_fiscal_cp", "representante_legal",
] as const satisfies readonly (keyof CustomerFormData)[];

type NullableField = typeof NULLABLE_FIELDS[number];

export function buildCustomerPayload(form: CustomerFormData) {
  const base: Record<NullableField, string | null> = NULLABLE_FIELDS.reduce((acc, key) => {
    acc[key] = (form[key] as string | undefined) || null;
    return acc;
  }, {} as Record<NullableField, string | null>);
  return { name: form.name, company: form.name, ...base };
}
