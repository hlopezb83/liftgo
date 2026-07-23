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
    it("agrupa y convierte pagos por invoice_id", () => {
      const map = buildPaidByInvoice([
        { invoice_id: "a", amount: 100, currency: "MXN", exchange_rate: null },
        { invoice_id: "a", amount: 50, currency: "USD", exchange_rate: 20 },
        { invoice_id: "b", amount: 30, currency: "MXN", exchange_rate: null },
      ]);
      expect(map.get("a")).toBe(1100);
      expect(map.get("b")).toBe(30);
    });
  });

  describe("invoiceToItem", () => {
    const base = {
      id: "i1",
      invoice_number: "FAC-001",
      total: 1000,
      due_date: "2026-07-01",
      customer_name: "Acme",
      moneda: "MXN",
      tipo_cambio: null,
      credited_amount: null,
    };
    it("devuelve null si no hay fecha de vencimiento", () => {
      expect(invoiceToItem({ ...base, due_date: null }, new Map())).toBeNull();
    });
    it("devuelve null si está totalmente pagada", () => {
      expect(invoiceToItem(base, new Map([["i1", 1000]]))).toBeNull();
    });
    it("calcula el saldo pendiente en MXN", () => {
      const item = invoiceToItem(base, new Map([["i1", 200]]));
      expect(item?.amountMxn).toBe(800);
      expect(item?.kind).toBe("in");
    });
    // v7.209.0 A4: forecast descuenta NCs timbradas
    it("descuenta credited_amount (NC timbrada) en MXN", () => {
      const item = invoiceToItem(
        { ...base, total: 10000, credited_amount: 6000 },
        new Map(),
      );
      expect(item?.amountMxn).toBe(4000);
    });
    it("descuenta credited_amount convertido por tipo_cambio en USD", () => {
      const item = invoiceToItem(
        { ...base, total: 1000, moneda: "USD", tipo_cambio: 20, credited_amount: 100 },
        new Map(),
      );
      // (1000 - 100) * 20 = 18000
      expect(item?.amountMxn).toBe(18000);
    });
    it("null si NC deja el saldo en cero", () => {
      const item = invoiceToItem(
        { ...base, total: 1000, credited_amount: 1000 },
        new Map(),
      );
      expect(item).toBeNull();
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
  });
});
