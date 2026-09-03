import { describe, expect, it } from "vitest";
import {
  buildEmptyInvoiceValues,
  cfdiSchema,
  EMPTY_CFDI,
  EMPTY_LINE,
  invoiceFormSchema,
  lineItemSchema,
} from "../invoiceFormSchema";

/**
 * Schemas Zod del formulario de facturas + CFDI 4.0.
 * Riesgo: aceptar partidas inválidas o cfdi sin campos = rechazo en timbrado.
 *
 * TESTS-ARQ2 (v7.220.0 DIFF 6): consolidado del duplicado `../invoiceFormSchema.test.ts`
 * (127 l.) al canónico bajo `__tests__/` — casos únicos de discount_type y
 * buildEmptyInvoiceValues migrados aquí antes de borrar la copia.
 */

describe("lineItemSchema", () => {
  it("acepta partida válida con defaults SAT", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 100, total: 100 });
    expect(res.success).toBe(true);
  });

  it("rechaza description vacía (después de trim)", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "   ", quantity: 1, unit_price: 100, total: 100 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Descripción requerida");
    }
  });

  it("rechaza quantity < 1", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "x", quantity: 0, unit_price: 100, total: 0 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Cantidad ≥ 1");
    }
  });

  it("rechaza unit_price negativo", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "x", quantity: 1, unit_price: -1, total: -1 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Precio ≥ 0");
    }
  });

  it("acepta unit_price = 0 (servicios cortesía)", () => {
    const res = lineItemSchema.safeParse({ ...EMPTY_LINE, description: "x", quantity: 1, unit_price: 0, total: 0 });
    expect(res.success).toBe(true);
  });

  it("permite discount_type '%' o '$'", () => {
    expect(lineItemSchema.safeParse({
      ...EMPTY_LINE,
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 10, discount_type: "%",
    }).success).toBe(true);
    expect(lineItemSchema.safeParse({
      ...EMPTY_LINE,
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 10, discount_type: "$",
    }).success).toBe(true);
  });

  it("rechaza discount_type inválido", () => {
    const res = lineItemSchema.safeParse({
      ...EMPTY_LINE,
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount_type: "USD",
    });
    expect(res.success).toBe(false);
  });

  it("permite descuento fijo ('$') mayor a 100 (regresión del bug)", () => {
    const res = lineItemSchema.safeParse({
      ...EMPTY_LINE,
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 500, discount_type: "$",
    });
    expect(res.success).toBe(true);
  });

  it("rechaza descuento porcentual ('%') mayor a 100", () => {
    const res = lineItemSchema.safeParse({
      ...EMPTY_LINE,
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 150, discount_type: "%",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "El descuento no puede exceder 100%")).toBe(true);
    }
  });

  it("acepta descuento porcentual ('%') exactamente 100", () => {
    const res = lineItemSchema.safeParse({
      ...EMPTY_LINE,
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 100, discount_type: "%",
    });
    expect(res.success).toBe(true);
  });

  it("acepta descuento porcentual ('%') 0", () => {
    const res = lineItemSchema.safeParse({
      ...EMPTY_LINE,
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 0, discount_type: "%",
    });
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
      // R15 F-01: customerId es requerido (superficie de error visible).
      customerId: "cust-1",
      lineItems: [{ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 1000, total: 1000 }],
    });
    expect(res.success).toBe(true);
  });

  it("rechaza payload sin customerId (R15 F-01)", () => {
    const v = buildEmptyInvoiceValues();
    const res = invoiceFormSchema.safeParse({
      ...v,
      lineItems: [{ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 1000, total: 1000 }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "El cliente es requerido")).toBe(true);
    }
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

  it("B-11: rechaza tipoCambio 0 con moneda distinta de MXN", () => {
    const v = buildEmptyInvoiceValues();
    const res = invoiceFormSchema.safeParse({
      ...v,
      customerId: "cust-1",
      cfdi: { ...v.cfdi, moneda: "USD", tipoCambio: 0 },
      lineItems: [{ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 100, total: 100 }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("tipo de cambio debe ser mayor a 0"))).toBe(true);
    }
  });

  it("B-11: acepta tipoCambio > 0 con moneda USD", () => {
    const v = buildEmptyInvoiceValues();
    const res = invoiceFormSchema.safeParse({
      ...v,
      customerId: "cust-1",
      cfdi: { ...v.cfdi, moneda: "USD", tipoCambio: 18.5 },
      lineItems: [{ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 100, total: 100 }],
    });
    expect(res.success).toBe(true);
  });
});

describe("invoiceFormSchema — periodo de facturación (P3 v7.423.0)", () => {
  const withBooking = (over: Record<string, unknown> = {}) => ({
    ...buildEmptyInvoiceValues(),
    customerId: "cust-1",
    bookingId: "b-1",
    bookingIds: ["b-1"],
    lineItems: [{ ...EMPTY_LINE, description: "Renta", quantity: 1, unit_price: 1000, total: 1000 }],
    ...over,
  });

  it("rechaza reserva sin billingPeriodStart", () => {
    const res = invoiceFormSchema.safeParse(withBooking({ billingPeriodStart: "", billingPeriodEnd: "2026-09-30" }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "billingPeriodStart")).toBe(true);
    }
  });

  it("rechaza reserva sin billingPeriodEnd (antes caía a un fallback silencioso)", () => {
    const res = invoiceFormSchema.safeParse(withBooking({ billingPeriodStart: "2026-09-01", billingPeriodEnd: "" }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some(
        (i) => i.path.join(".") === "billingPeriodEnd" && i.message.includes("requerido"),
      )).toBe(true);
    }
  });

  it("rechaza fin anterior al inicio", () => {
    const res = invoiceFormSchema.safeParse(withBooking({ billingPeriodStart: "2026-09-30", billingPeriodEnd: "2026-09-01" }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some(
        (i) => i.message === "El fin del periodo no puede ser anterior al inicio",
      )).toBe(true);
    }
  });

  it("acepta periodo completo con inicio ≤ fin", () => {
    const res = invoiceFormSchema.safeParse(withBooking({ billingPeriodStart: "2026-09-01", billingPeriodEnd: "2026-09-30" }));
    expect(res.success).toBe(true);
  });

  it("acepta periodo de un solo día (inicio == fin)", () => {
    const res = invoiceFormSchema.safeParse(withBooking({ billingPeriodStart: "2026-09-15", billingPeriodEnd: "2026-09-15" }));
    expect(res.success).toBe(true);
  });

  it("sin reserva NO exige periodo (facturas de daño/venta sin reserva)", () => {
    const res = invoiceFormSchema.safeParse(withBooking({ bookingId: "", bookingIds: [], billingPeriodStart: "", billingPeriodEnd: "" }));
    expect(res.success).toBe(true);
  });
});

describe("buildEmptyInvoiceValues", () => {
  it("aplica defaults coherentes (IVA 16%, MXN, sin partidas)", () => {
    const v = buildEmptyInvoiceValues();
    expect(v.taxRate).toBe(16);
    expect(v.cfdi.moneda).toBe("MXN");
    expect(v.cfdi.tipoCambio).toBe(1);
    expect(v.lineItems).toEqual([]);
    expect(v.customerId).toBe("");
    expect(v.issueDate).toBeInstanceOf(Date);
  });

  it("devuelve una nueva referencia de CFDI por llamada (no comparte estado)", () => {
    const a = buildEmptyInvoiceValues();
    const b = buildEmptyInvoiceValues();
    a.cfdi.serie = "A";
    expect(b.cfdi.serie).toBe("");
  });
});
