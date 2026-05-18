import type { CustomerFormData } from "@/features/customers/components/customers/CustomerForm";

export function buildCustomerPayload(form: CustomerFormData) {
  return {
    name: form.name,
    company: form.name,
    email: form.email || null,
    phone: form.phone || null,
    address: form.address || null,
    notes: form.notes || null,
    website: form.website || null,
    contact_person: form.contact_person || null,
    rfc: form.rfc || null,
    razon_social: form.razon_social || null,
    regimen_fiscal: form.regimen_fiscal || null,
    uso_cfdi: form.uso_cfdi || null,
    domicilio_fiscal_cp: form.domicilio_fiscal_cp || null,
    representante_legal: form.representante_legal || null,
  };
}
