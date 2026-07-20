import type { SupplierFormData } from "./supplierFormSchema";

/**
 * Helpers puros para el payload del formulario de Proveedor.
 * Extraídos del dialog para permitir cobertura de tests aislada.
 */

function nullable(v: string): string | null {
  return v.trim() ? v.trim() : null;
}

export type SupplierPayload = {
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  rfc: string | null;
  regimen_fiscal: string | null;
  category: string | null;
  notes: string | null;
  default_payment_terms_days: number | null;
};

export function buildSupplierPayload(data: SupplierFormData): SupplierPayload {
  const termsRaw = data.default_payment_terms_days.trim();
  const terms = termsRaw === "" ? null : Number(termsRaw);
  return {
    name: data.name.trim(),
    contact_person: nullable(data.contact_person),
    email: nullable(data.email),
    phone: nullable(data.phone),
    website: nullable(data.website),
    address: nullable(data.address),
    rfc: data.rfc.trim() ? data.rfc.trim().toUpperCase() : null,
    regimen_fiscal: nullable(data.regimen_fiscal),
    category: nullable(data.category),
    notes: nullable(data.notes),
    default_payment_terms_days: terms,
  };
}

export function supplierToFormData(supplier: {
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  rfc?: string | null;
  regimen_fiscal?: string | null;
  category?: string | null;
  notes?: string | null;
  default_payment_terms_days?: number | null;
}): SupplierFormData {
  return {
    name: supplier.name,
    contact_person: supplier.contact_person || "",
    email: supplier.email || "",
    phone: supplier.phone || "",
    website: supplier.website || "",
    address: supplier.address || "",
    rfc: supplier.rfc || "",
    regimen_fiscal: supplier.regimen_fiscal || "",
    category: supplier.category || "",
    notes: supplier.notes || "",
    default_payment_terms_days:
      supplier.default_payment_terms_days != null
        ? String(supplier.default_payment_terms_days)
        : "",
  };
}
