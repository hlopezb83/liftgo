import { describe, it, expect } from "vitest";
import {
  invoiceFormSchema,
  lineItemSchema,
  cfdiSchema,
  buildEmptyInvoiceValues,
  EMPTY_CFDI,
  EMPTY_LINE,
} from "./invoiceFormSchema";

describe("lineItemSchema", () => {
  it("acepta una partida válida", () => {
    const result = lineItemSchema.safeParse({
      description: "Renta mensual",
      quantity: 2,
      unit_price: 1000,
      total: 2000,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza cantidad menor a 1", () => {
    const result = lineItemSchema.safeParse({
      description: "x", quantity: 0, unit_price: 100, total: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Cantidad ≥ 1");
    }
  });

  it("rechaza precio unitario negativo", () => {
    const result = lineItemSchema.safeParse({
      description: "x", quantity: 1, unit_price: -1, total: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Precio ≥ 0");
    }
  });

  it("permite discount_type '%' o '$'", () => {
    expect(lineItemSchema.safeParse({
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 10, discount_type: "%",
    }).success).toBe(true);
    expect(lineItemSchema.safeParse({
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount: 10, discount_type: "$",
    }).success).toBe(true);
  });

  it("rechaza discount_type inválido", () => {
    const result = lineItemSchema.safeParse({
      description: "x", quantity: 1, unit_price: 100, total: 100,
      discount_type: "USD",
    });
    expect(result.success).toBe(false);
  });
});

describe("cfdiSchema", () => {
  it("acepta un CFDI válido (EMPTY_CFDI)", () => {
    expect(cfdiSchema.safeParse(EMPTY_CFDI).success).toBe(true);
  });

  it("rechaza tipoCambio negativo", () => {
    const result = cfdiSchema.safeParse({ ...EMPTY_CFDI, tipoCambio: -0.5 });
    expect(result.success).toBe(false);
  });
});

describe("invoiceFormSchema", () => {
  it("acepta valores válidos con al menos 1 partida", () => {
    const values = {
      ...buildEmptyInvoiceValues(),
      customerName: "ACME",
      lineItems: [{ ...EMPTY_LINE, description: "Renta", total: 1000, unit_price: 1000 }],
    };
    const result = invoiceFormSchema.safeParse(values);
    expect(result.success).toBe(true);
  });

  it("rechaza factura sin partidas con mensaje en español", () => {
    const result = invoiceFormSchema.safeParse(buildEmptyInvoiceValues());
    expect(result.success).toBe(false);
    if (!result.success) {
      const lineErr = result.error.issues.find((i) => i.path.join(".") === "lineItems");
      expect(lineErr?.message).toBe("Agrega al menos una partida");
    }
  });

  it("rechaza taxRate negativo", () => {
    const values = { ...buildEmptyInvoiceValues(), lineItems: [EMPTY_LINE], taxRate: -1 };
    expect(invoiceFormSchema.safeParse(values).success).toBe(false);
  });
});

describe("buildEmptyInvoiceValues", () => {
  it("aplica defaults coherentes (IVA 16%, MXN, sin partidas)", () => {
    const v = buildEmptyInvoiceValues();
    expect(v.taxRate).toBe(16);
    expect(v.cfdi.moneda).toBe("MXN");
    expect(v.cfdi.tipoCambio).toBe(1);
    expect(v.lineItems).toEqual([]);
    expect(v.customerId).toBeNull();
    expect(v.issueDate).toBeInstanceOf(Date);
  });

  it("devuelve una nueva referencia de CFDI por llamada (no comparte estado)", () => {
    const a = buildEmptyInvoiceValues();
    const b = buildEmptyInvoiceValues();
    a.cfdi.serie = "A";
    expect(b.cfdi.serie).toBe("");
  });
});
