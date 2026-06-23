import type { CustomerFormData } from "./customerFormSchema";

const NULLABLE_FIELDS = [
  "email", "phone", "address", "notes", "website", "contact_person",
  "rfc", "regimen_fiscal", "uso_cfdi", "domicilio_fiscal_cp", "representante_legal",
] as const satisfies readonly (keyof CustomerFormData)[];

type NullableField = typeof NULLABLE_FIELDS[number];

export function buildCustomerPayload(form: CustomerFormData) {
  const base: Record<NullableField, string | null> = NULLABLE_FIELDS.reduce((acc, key) => {
    acc[key] = (form[key] as string | undefined) || null;
    return acc;
  }, {} as Record<NullableField, string | null>);
  // razon_social se mantiene sincronizada con name: el cliente ya no la captura
  // por separado, pero la columna en BD sigue alimentando CFDI, PDFs y snapshots.
  return { name: form.name, company: form.name, razon_social: form.name, ...base };
}

export function getE2ECustomerMetadata() {
  if (typeof window === "undefined") return {};
  if (window.localStorage.getItem("liftgo:e2e") !== "true") return {};
  return {
    is_e2e: true,
    e2e_scope: window.localStorage.getItem("liftgo:e2e_scope") || "ui",
  };
}
