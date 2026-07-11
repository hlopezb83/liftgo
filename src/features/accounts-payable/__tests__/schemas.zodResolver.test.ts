/**
 * Tests de validación y tipos para los formularios de Cuentas por Pagar
 * que dependen del wrapper `zodResolver` sobre Zod 4.
 *
 * Cubre:
 * - Schema exportado `supplierBillFormSchema` (useSupplierBillForm)
 * - Schema exportado `supplierPaymentSchema` (RegisterSupplierPaymentDialog)
 * - Integración con `zodResolver` (contrato con react-hook-form)
 * - Preservación de defaults y coerción de números
 * - Compatibilidad de tipos `z.infer` con la firma `useForm<z.infer<typeof schema>>`
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodResolver } from "@/lib/forms/zodResolver";
import { supplierBillFormSchema } from "../hooks/useSupplierBillForm";
import { supplierPaymentSchema } from "../lib/supplierPaymentSchema";

// Utilidad: invoca el resolver como lo hace RHF (values, context, options).
async function runResolver<T extends z.ZodTypeAny>(
  schema: T,
  values: unknown,
) {
  const resolver = zodResolver(schema as never);
  return resolver(
    values as never,
    undefined,
    { fields: {}, shouldUseNativeValidation: false } as never,
  );
}

// ---------------------------------------------------------------------------
// supplierBillFormSchema
// ---------------------------------------------------------------------------

const validBill = () => ({
  supplier_id: "sup-1",
  category: "servicios",
  description: "Renta oficinas",
  issue_date: new Date(2026, 0, 15),
  due_date: new Date(2026, 1, 15),
  currency: "MXN" as const,
  exchange_rate: 1,
  subtotal: 10000,
  tax_amount: 1600,
  retention_iva: 0,
  retention_isr: 0,
  cfdi_uuid: "",
  payment_method_sat: "PUE" as const,
});

describe("supplierBillFormSchema — validación", () => {
  it("acepta un payload válido", () => {
    const r = supplierBillFormSchema.safeParse(validBill());
    expect(r.success).toBe(true);
  });

  it("exige supplier_id no vacío", () => {
    const r = supplierBillFormSchema.safeParse({ ...validBill(), supplier_id: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Selecciona un proveedor")).toBe(true);
    }
  });

  it("exige categoría no vacía", () => {
    const r = supplierBillFormSchema.safeParse({ ...validBill(), category: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Selecciona una categoría")).toBe(true);
    }
  });

  it("exige issue_date con mensaje custom", () => {
    const r = supplierBillFormSchema.safeParse({ ...validBill(), issue_date: undefined });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Fecha de emisión requerida")).toBe(true);
    }
  });

  it("due_date es opcional", () => {
    const r = supplierBillFormSchema.safeParse({ ...validBill(), due_date: undefined });
    expect(r.success).toBe(true);
  });

  it("rechaza currency fuera de MXN | USD", () => {
    const r = supplierBillFormSchema.safeParse({ ...validBill(), currency: "EUR" });
    expect(r.success).toBe(false);
  });

  it("coerce strings numéricos en subtotal / tax_amount / retenciones", () => {
    const r = supplierBillFormSchema.safeParse({
      ...validBill(),
      subtotal: "5000",
      tax_amount: "800",
      retention_iva: "50",
      retention_isr: "25",
      exchange_rate: "1.05",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subtotal).toBe(5000);
      expect(r.data.tax_amount).toBe(800);
      expect(r.data.retention_iva).toBe(50);
      expect(r.data.retention_isr).toBe(25);
      expect(r.data.exchange_rate).toBe(1.05);
    }
  });

  it("rechaza subtotal negativo", () => {
    const r = supplierBillFormSchema.safeParse({ ...validBill(), subtotal: -1 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Subtotal inválido")).toBe(true);
    }
  });

  it("rechaza exchange_rate ≤ 0", () => {
    const r = supplierBillFormSchema.safeParse({ ...validBill(), exchange_rate: 0 });
    expect(r.success).toBe(false);
  });

  it("aplica defaults en campos opcionales", () => {
    const minimal = {
      supplier_id: "sup-1",
      category: "servicios",
      issue_date: new Date(2026, 0, 15),
      currency: "USD" as const,
      subtotal: 100,
    };
    const r = supplierBillFormSchema.safeParse(minimal);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBe("");
      expect(r.data.cfdi_uuid).toBe("");
      expect(r.data.exchange_rate).toBe(1);
      expect(r.data.tax_amount).toBe(0);
      expect(r.data.retention_iva).toBe(0);
      expect(r.data.retention_isr).toBe(0);
      expect(r.data.payment_method_sat).toBeUndefined();
    }
  });

  it("payment_method_sat sólo acepta PUE | PPD", () => {
    const ok = supplierBillFormSchema.safeParse({ ...validBill(), payment_method_sat: "PPD" });
    expect(ok.success).toBe(true);
    const bad = supplierBillFormSchema.safeParse({ ...validBill(), payment_method_sat: "XX" });
    expect(bad.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// supplierPaymentSchema
// ---------------------------------------------------------------------------

const validPayment = () => ({
  amount: 2500,
  payment_date: new Date(2026, 0, 20),
  payment_method: "transferencia",
  bank_account: "acc-1",
  reference: "REF-001",
  receipt_url: "",
  notes: "",
});

describe("supplierPaymentSchema — validación", () => {
  it("acepta payload válido", () => {
    const r = supplierPaymentSchema.safeParse(validPayment());
    expect(r.success).toBe(true);
  });

  it("rechaza amount ≤ 0 con mensaje es-MX", () => {
    const r = supplierPaymentSchema.safeParse({ ...validPayment(), amount: 0 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/mayor a 0/);
    }
  });

  it("rechaza amount no numérico (sin coerción)", () => {
    const r = supplierPaymentSchema.safeParse({ ...validPayment(), amount: "2500" });
    expect(r.success).toBe(false);
  });

  it("exige payment_date como Date", () => {
    const r = supplierPaymentSchema.safeParse({ ...validPayment(), payment_date: undefined });
    expect(r.success).toBe(false);
  });

  it("aplica defaults al omitir campos opcionales", () => {
    const r = supplierPaymentSchema.safeParse({
      amount: 100,
      payment_date: new Date(2026, 0, 1),
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.payment_method).toBe("transferencia");
      expect(r.data.bank_account).toBe("");
      expect(r.data.reference).toBe("");
      expect(r.data.receipt_url).toBe("");
      expect(r.data.notes).toBe("");
    }
  });
});

// ---------------------------------------------------------------------------
// Integración con zodResolver (contrato RHF)
// ---------------------------------------------------------------------------

describe("zodResolver — integración con schemas de Cuentas por Pagar", () => {
  it("supplierBillFormSchema: resolver devuelve values y errors={} en payload válido", async () => {
    const { values, errors } = await runResolver(supplierBillFormSchema, validBill());
    expect(errors).toEqual({});
    expect(values).toBeTruthy();
    expect((values as { supplier_id: string }).supplier_id).toBe("sup-1");
  });

  it("supplierBillFormSchema: resolver devuelve errores por campo en payload inválido", async () => {
    const { values, errors } = await runResolver(supplierBillFormSchema, {
      ...validBill(),
      supplier_id: "",
      subtotal: -10,
    });
    expect(values).toEqual({});
    expect(errors).toHaveProperty("supplier_id");
    expect(errors).toHaveProperty("subtotal");
  });

  it("supplierPaymentSchema: resolver reporta amount + payment_date en payload vacío", async () => {
    const { errors } = await runResolver(supplierPaymentSchema, {});
    expect(errors).toHaveProperty("amount");
    expect(errors).toHaveProperty("payment_date");
  });

  it("supplierPaymentSchema: resolver aplica defaults en payload mínimo válido", async () => {
    const { values, errors } = await runResolver(supplierPaymentSchema, {
      amount: 500,
      payment_date: new Date(2026, 0, 1),
    });
    expect(errors).toEqual({});
    expect((values as { payment_method: string }).payment_method).toBe("transferencia");
  });
});

// ---------------------------------------------------------------------------
// Tipos — chequeados en compile-time por tsgo/tsc.
// ---------------------------------------------------------------------------

describe("tipos — z.infer preserva la firma esperada por useForm", () => {
  it("supplierBillFormSchema infiere el shape esperado", () => {
    type Bill = z.infer<typeof supplierBillFormSchema>;
    const sample: Bill = validBill();
    // Assertions de tipo (compile-time). En runtime sólo verificamos las claves.
    expect(Object.keys(sample)).toEqual(
      expect.arrayContaining([
        "supplier_id",
        "category",
        "issue_date",
        "currency",
        "subtotal",
        "exchange_rate",
        "tax_amount",
        "retention_iva",
        "retention_isr",
      ]),
    );
  });

  it("supplierPaymentSchema infiere el shape esperado", () => {
    type Payment = z.infer<typeof supplierPaymentSchema>;
    const sample: Payment = validPayment();
    expect(Object.keys(sample)).toEqual(
      expect.arrayContaining(["amount", "payment_date", "payment_method"]),
    );
  });
});
