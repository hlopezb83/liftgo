import { describe, it, expect } from "vitest";
import {
  toMxn,
  buildPaidByInvoice,
  invoiceToItem,
  billToItem,
} from "../cashFlowTransformers";

describe("cashFlowTransformers", () => {
  describe("toMxn", () => {
    it("retorna el monto sin cambios si la moneda es MXN", () => {
      expect(toMxn(100, "MXN", 20)).toBe(100);
    });
    it("convierte USD a MXN usando el tipo de cambio", () => {
      expect(toMxn(100, "USD", 18.5)).toBe(1850);
    });
    it("retorna el monto sin cambios si el tipo de cambio es 0 o nulo", () => {
      expect(toMxn(100, "USD", 0)).toBe(100);
      expect(toMxn(100, "USD", null)).toBe(100);
    });
    it("trata moneda nula como MXN", () => {
      expect(toMxn(50, null, 18)).toBe(50);
    });
  });

  describe("buildPaidByInvoice", () => {
    // Fix 6.4: los pagos se suman EN MONEDA DEL DOCUMENTO (sin convertir a
    // MXN individualmente) — el Fix 3.2 garantiza que siempre coinciden con
    // la moneda de la factura, así que sumar el monto crudo es correcto y
    // evita mezclar tipos de cambio distintos.
    it("agrupa pagos por invoice_id en moneda del documento", () => {
      const map = buildPaidByInvoice([
        { invoice_id: "a", amount: 100, currency: "MXN", exchange_rate: null },
        { invoice_id: "a", amount: 50, currency: "USD", exchange_rate: 20 },
        { invoice_id: "b", amount: 30, currency: "MXN", exchange_rate: null },
      ]);
      expect(map.get("a")).toBe(150);
      expect(map.get("b")).toBe(30);
    });
  });

  describe("invoiceToItem", () => {
    // A2-1: el saldo viene ya calculado y convertido a MXN por
    // `v_invoices_with_balance.balance_mxn` (FX-aware, NCs timbradas
    // descontadas). El transformer sólo filtra y mapea.
    const base = {
      id: "i1",
      invoice_number: "FAC-001",
      total: 1000,
      due_date: "2026-07-01",
      customer_name: "Acme",
      moneda: "MXN",
      tipo_cambio: null,
      credited_amount: null,
      balance_mxn: 1000,
    };
    it("devuelve null si no hay fecha de vencimiento", () => {
      expect(invoiceToItem({ ...base, due_date: null })).toBeNull();
    });
    it("devuelve null si está totalmente pagada", () => {
      expect(invoiceToItem({ ...base, balance_mxn: 0 })).toBeNull();
    });
    it("usa el saldo en MXN de la vista", () => {
      const item = invoiceToItem({ ...base, balance_mxn: 800 });
      expect(item?.amountMxn).toBe(800);
      expect(item?.kind).toBe("in");
    });
    it("usa el saldo convertido de una factura USD", () => {
      const item = invoiceToItem({ ...base, moneda: "USD", tipo_cambio: 20, balance_mxn: 18000 });
      expect(item?.amountMxn).toBe(18000);
    });
    // A2-1: pago en MXN sobre factura USD. Antes el cliente restaba el monto
    // crudo (8500 "USD" sobre 1000) y la factura desaparecía de la proyección.
    it("no desaparece por un pago en otra moneda (regresión A2-1)", () => {
      const item = invoiceToItem({
        ...base, total: 1000, moneda: "USD", tipo_cambio: 17, balance_mxn: 8500,
      });
      expect(item?.amountMxn).toBe(8500);
    });
    it("null si la vista no pudo calcular el saldo (TC faltante)", () => {
      expect(invoiceToItem({ ...base, balance_mxn: null })).toBeNull();
    });
    // R17-X#1: saldo de $0.01 debe proyectarse
    it("incluye saldos de $0.01", () => {
      expect(invoiceToItem({ ...base, balance_mxn: 0.01 })?.amountMxn).toBe(0.01);
    });
    it("descarta saldos menores a $0.005", () => {
      expect(invoiceToItem({ ...base, balance_mxn: 0.004 })).toBeNull();
    });
  });

  describe("billToItem", () => {
    it("normaliza el nombre del proveedor desde objeto o arreglo", () => {
      const asObject = billToItem({
        id: "b1", bill_number: "B-1", balance: 100, due_date: "2026-07-01",
        currency: "MXN", exchange_rate: null, suppliers: { name: "Prov" },
      });
      expect(asObject?.partyName).toBe("Prov");

      const asArray = billToItem({
        id: "b2", bill_number: "B-2", balance: 100, due_date: "2026-07-01",
        currency: "MXN", exchange_rate: null, suppliers: [{ name: "Prov2" }],
      });
      expect(asArray?.partyName).toBe("Prov2");
    });
    // R17-X#1: saldo de $0.01 en bills también debe proyectarse
    it("incluye saldos de $0.01", () => {
      const item = billToItem({
        id: "b3", bill_number: "B-3", balance: 0.01, due_date: "2026-07-01",
        currency: "MXN", exchange_rate: null, suppliers: { name: "Prov3" },
      });
      expect(item?.amountMxn).toBe(0.01);
    });
    it("descarta saldos menores a $0.005", () => {
      const item = billToItem({
        id: "b4", bill_number: "B-4", balance: 0.004, due_date: "2026-07-01",
        currency: "MXN", exchange_rate: null, suppliers: { name: "Prov4" },
      });
      expect(item).toBeNull();
    });
  });
});
