import { describe, expect, it } from "vitest";
import { buildStatementRows, filterWithBalance, sumStatementTotals } from "../statementRows";

type Inv = {
  id: string;
  total: number;
  paid_amount?: number;
  credited_amount?: number;
  balance?: number;
  moneda?: string | null;
  tipo_cambio?: number | null;
};

const pagos: { invoice_id: string | null }[] = [];

function rowsOf(invs: Inv[]) {
  return buildStatementRows(invs, pagos);
}

describe("R8-04 · estado de cuenta del portal", () => {
  it("matriz de tipo de cambio", () => {
    const invs: Inv[] = [
      { id: "mxn", total: 100, balance: 100, moneda: "MXN", tipo_cambio: null },
      { id: "usd-null", total: 100, balance: 100, moneda: "USD", tipo_cambio: null },
      { id: "usd-cero", total: 100, balance: 100, moneda: "USD", tipo_cambio: 0 },
      { id: "usd-neg", total: 100, balance: 100, moneda: "USD", tipo_cambio: -5 },
      { id: "usd-uno", total: 100, balance: 100, moneda: "USD", tipo_cambio: 1 },
      { id: "usd-ok", total: 100, balance: 100, moneda: "USD", tipo_cambio: 18 },
    ];
    const rows = rowsOf(invs);
    expect(rows.map((r) => r.fxMissing)).toEqual([false, true, true, true, true, false]);
    expect(rows[rows.length - 1].balanceMxn).toBe(1800);
    expect(rows[1].balanceMxn).toBeNull();
  });

  it("excluye del total las facturas sin tipo de cambio y las cuenta", () => {
    const totals = sumStatementTotals(
      rowsOf([
        { id: "a", total: 100, balance: 100, moneda: "MXN" },
        { id: "b", total: 100, balance: 100, moneda: "USD", tipo_cambio: 1 },
        { id: "c", total: 100, balance: 100, moneda: "USD", tipo_cambio: 18 },
      ]),
    );
    expect(totals.balance).toBe(1900);
    expect(totals.invoiced).toBe(1900);
    expect(totals.fxMissingCount).toBe(1);
  });

  it("filtra 'solo con saldo' usando el saldo en pesos", () => {
    const rows = rowsOf([
      { id: "cero", total: 100, balance: 0, moneda: "USD", tipo_cambio: 18 },
      { id: "centavo", total: 100, balance: 0.005, moneda: "MXN" },
      { id: "con-saldo", total: 100, balance: 10, moneda: "USD", tipo_cambio: 18 },
      { id: "sin-tc", total: 100, balance: 10, moneda: "USD", tipo_cambio: null },
    ]);
    expect(filterWithBalance(rows).map((r) => r.inv.id)).toEqual(["con-saldo", "sin-tc"]);
  });
});
