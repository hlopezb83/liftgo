export interface SupplierForm {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  rfc: string;
  regimen_fiscal: string;
  category: string;
  notes: string;
  default_payment_terms_days: string;
}

export const emptySupplierForm: SupplierForm = {
  name: "", contact_person: "", email: "", phone: "", website: "",
  address: "", rfc: "", regimen_fiscal: "", category: "", notes: "",
  default_payment_terms_days: "",
};
