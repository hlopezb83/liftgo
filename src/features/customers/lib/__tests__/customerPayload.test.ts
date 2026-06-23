import { describe, it, expect } from "vitest";
import { buildCustomerPayload, getE2ECustomerMetadata } from "../customerPayload";
import type { CustomerFormData } from "../customerFormSchema";

const base: CustomerFormData = {
  name: "Acme",
  email: "",
  phone: "",
  address: "",
  notes: "",
  website: "",
  contact_person: "",
  rfc: "",
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

  it("agrega metadata E2E sólo cuando Playwright la activa", () => {
    window.localStorage.removeItem("liftgo:e2e");
    expect(getE2ECustomerMetadata()).toEqual({});

    window.localStorage.setItem("liftgo:e2e", "true");
    window.localStorage.setItem("liftgo:e2e_scope", "customer-create-test");
    expect(getE2ECustomerMetadata()).toEqual({ is_e2e: true, e2e_scope: "customer-create-test" });
  });
});
