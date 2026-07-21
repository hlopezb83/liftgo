import { describe, it, expect } from "vitest";
import { billToItem, type BillRow } from "../cashFlowTransformers";

const base: BillRow = {
  id: "b1",
  bill_number: "CP-0001",
  balance: 500,
  due_date: "2026-08-01",
  currency: "MXN",
  exchange_rate: null,
  suppliers: { name: "Proveedor SA" },
};

describe("billToItem — Bloque 5.3 (R4) sanitización de balance", () => {
  it("mapea normalmente balances positivos", () => {
    const item = billToItem(base);
    expect(item?.amountMxn).toBe(500);
    expect(item?.kind).toBe("out");
  });

  it("descarta cuando balance es null → 0", () => {
    expect(billToItem({ ...base, balance: null as unknown as number })).toBeNull();
  });

  it("descarta cuando balance es NaN o string inválido", () => {
    expect(billToItem({ ...base, balance: Number.NaN })).toBeNull();
    expect(billToItem({ ...base, balance: "abc" as unknown as number })).toBeNull();
  });

  it("descarta cuando falta due_date", () => {
    expect(billToItem({ ...base, due_date: null })).toBeNull();
  });
});
