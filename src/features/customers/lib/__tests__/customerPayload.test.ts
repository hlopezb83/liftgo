import { afterEach, describe, it, expect, vi } from "vitest";
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
  tax_rate: "",
};

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

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

  it("permite el alta si el navegador bloquea el acceso al almacenamiento", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    expect(getE2ECustomerMetadata()).toEqual({});
  });

  it("omite toda la metadata opcional si falla la lectura de su alcance", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation((key) => {
      if (key === "liftgo:e2e") return "true";
      throw new DOMException("Storage blocked", "SecurityError");
    });
    expect(getE2ECustomerMetadata()).toEqual({});
  });
});

describe("buildCustomerPayload · tax_rate (FIX-3)", () => {
  it("usa 16 % cuando el campo va vacío, también al editar", () => {
    expect(buildCustomerPayload(base).tax_rate).toBe(16);
  });

  it("envía la tasa capturada como número", () => {
    const r = buildCustomerPayload({ ...base, tax_rate: "8" });
    expect(r.tax_rate).toBe(8);
  });

  it("preserva una tasa explícita de cero para clientes exentos", () => {
    expect(buildCustomerPayload({ ...base, tax_rate: "0" }).tax_rate).toBe(0);
  });
});
