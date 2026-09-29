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
  // El formulario define vacío como IVA general del 16 %. En una edición,
  // omitir la columna conservaría una tasa anterior (por ejemplo 8 %).
  const rawRate = (form.tax_rate ?? "").trim();
  const taxRate = rawRate === "" ? 16 : Number(rawRate);
  // razon_social se mantiene sincronizada con name: el cliente ya no la captura
  // por separado, pero la columna en BD sigue alimentando CFDI, PDFs y snapshots.
  return {
    name: form.name,
    company: form.name,
    razon_social: form.name,
    ...base,
    tax_rate: Number.isFinite(taxRate) ? taxRate : 16,
  };
}


export function getE2ECustomerMetadata() {
  if (typeof window === "undefined") return {};
  if (window.localStorage.getItem("liftgo:e2e") !== "true") return {};
  return {
    is_e2e: true,
    e2e_scope: window.localStorage.getItem("liftgo:e2e_scope") || "ui",
  };
}
