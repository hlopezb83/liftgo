import { describe, it, expect } from "vitest";
import {
  invoiceFormSchema,
  cfdiSchema,
  lineItemSchema,
  EMPTY_CFDI,
  EMPTY_LINE,
  buildEmptyInvoiceValues,
} from "../invoiceFormSchema";

/**
 * Schemas Zod del formulario de facturas + CFDI 4.0.
 * Riesgo: aceptar partidas inválidas o cfdi sin campos = rechazo en timbrado.
 */

describe("lineItemSchema", () => {
  it("acepta partida válida con defaults SAT", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 100, total: 100 });
    expect(res.success).toBe(true);
  });

  it("rechaza description vacía (después de trim)", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "   ", quantity: 1, unit_price: 100, total: 100 });
    expect(res.success).toBe(false);
  });

  it("rechaza quantity < 1", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "x", quantity: 0, unit_price: 100, total: 0 });
    expect(res.success).toBe(false);
  });

  it("rechaza unit_price negativo", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "x", quantity: 1, unit_price: -1, total: -1 });
    expect(res.success).toBe(false);
  });

  it("acepta unit_price = 0 (servicios cortesía)", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "x", quantity: 1, unit_price: 0, total: 0 });
    expect(res.success).toBe(true);
  });
});

describe("cfdiSchema", () => {
  it("acepta CFDI mínimo en MXN", () => {
    const res = cfdiSchema.safeParse(EMPTY_CFDI);
    expect(res.success).toBe(true);
  });

  it("rechaza tipoCambio negativo", () => {
    const res = cfdiSchema.safeParse({ ...EMPTY_CFDI, tipoCambio: -0.5 });
    expect(res.success).toBe(false);
  });
});

describe("invoiceFormSchema", () => {
  it("buildEmptyInvoiceValues produce estructura parseable salvo lineItems vacíos", () => {
    const empty = buildEmptyInvoiceValues();
    const res = invoiceFormSchema.safeParse(empty);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "Agrega al menos una partida")).toBe(true);
    }
  });

  it("acepta payload con al menos una partida válida", () => {
    const v = buildEmptyInvoiceValues();
    const res = invoiceFormSchema.safeParse({
      ...v,
      lineItems: [{ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 1000, total: 1000 }],
    });
    expect(res.success).toBe(true);
  });

  it("rechaza taxRate negativo", () => {
    const v = buildEmptyInvoiceValues();
    const res = invoiceFormSchema.safeParse({
      ...v,
      taxRate: -1,
      lineItems: [{ ...EMPTY_LINE, description: "x", quantity: 1, unit_price: 1, total: 1 }],
    });
    expect(res.success).toBe(false);
  });
});
