import { describe, it, expect } from "vitest";
import { buildCustomerPayload } from "@/features/customers/lib/customerPayload";
import type { CustomerFormData } from "@/features/customers/lib/customerFormSchema";

const base: CustomerFormData = {
  name: "Acme",
  email: "",
  phone: "",
  address: "",
  notes: "",
  website: "",
  contact_person: "",
  rfc: "",
  razon_social: "",
  regimen_fiscal: "",
  uso_cfdi: "",
  domicilio_fiscal_cp: "",
  representante_legal: "",
};

describe("buildCustomerPayload", () => {
  it("convierte strings vacíos a null y duplica name en company", () => {
    const r = buildCustomerPayload(base);
    expect(r.name).toBe("Acme");
    expect(r.company).toBe("Acme");
    expect(r.email).toBeNull();
    expect(r.rfc).toBeNull();
  });

  it("preserva valores no vacíos", () => {
    const r = buildCustomerPayload({ ...base, email: "a@b.c", rfc: "XAXX010101000" });
    expect(r.email).toBe("a@b.c");
    expect(r.rfc).toBe("XAXX010101000");
  });
});
