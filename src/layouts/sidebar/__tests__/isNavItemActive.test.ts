import { describe, expect, it } from "vitest";
import { isNavItemActive } from "../isNavItemActive";

const URLS = ["/", "/invoices", "/invoices/reconciliation", "/customers"];

describe("isNavItemActive", () => {
  it("resalta sólo la ruta más específica", () => {
    expect(isNavItemActive("/invoices/reconciliation", "/invoices/reconciliation", URLS)).toBe(true);
    expect(isNavItemActive("/invoices/reconciliation", "/invoices", URLS)).toBe(false);
  });

  it("mantiene el padre activo en rutas de detalle", () => {
    expect(isNavItemActive("/invoices/ca8243c4", "/invoices", URLS)).toBe(true);
    expect(isNavItemActive("/invoices", "/invoices", URLS)).toBe(true);
  });

  it("no coincide por prefijo parcial de segmento", () => {
    expect(isNavItemActive("/invoicesx", "/invoices", URLS)).toBe(false);
  });

  it("la raíz sólo coincide exactamente", () => {
    expect(isNavItemActive("/", "/", URLS)).toBe(true);
    expect(isNavItemActive("/customers", "/", URLS)).toBe(false);
  });

  it("devuelve false cuando no hay coincidencia", () => {
    expect(isNavItemActive("/fleet", "/invoices", URLS)).toBe(false);
  });
});
