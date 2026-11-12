import { describe, expect, it } from "vitest";
import { parseAccountsPayableBillPage, parseAccountsPayableSummary } from "../accountsPayableRpc";
import { billPageRow, zeroSummary } from "./accountsPayable.fixture";

describe("accounts payable page SQL contract", () => {
  it("accepts a partial final page without inventing payments or missing SQL columns", () => {
    const page = parseAccountsPayableBillPage({ items: [billPageRow(26)], totalCount: 26 }, 1, 25);
    expect(page.items[0].bill_number).toBe("CXP-0026");
    expect(page.items[0]).not.toHaveProperty("payments");
    expect(page.items[0]).not.toHaveProperty("discount");
    expect(page.items[0]).not.toHaveProperty("rep_summary");
  });

  it("accepts zero rows and OFFSET beyond the last page so the UI can clamp", () => {
    expect(parseAccountsPayableBillPage({ items: [], totalCount: 0 }, 0, 25)).toEqual({ items: [], totalCount: 0 });
    expect(parseAccountsPayableBillPage({ items: [], totalCount: 26 }, 2, 25).totalCount).toBe(26);
  });

  it.each([null, 0, 1, -1])("preserves missing or placeholder FX (%s) on a foreign bill", (exchangeRate) => {
    const row = { ...billPageRow(), currency: "USD", exchange_rate: exchangeRate, due_date: null, suppliers: null };
    expect(parseAccountsPayableBillPage({ items: [row], totalCount: 1 }, 0, 25).items[0].exchange_rate).toBe(exchangeRate);
  });

  it.each([
    { id: "" }, { bill_number: null }, { issue_date: "2026-02-30" }, { due_date: "tomorrow" },
    { total: "116" }, { total: Infinity }, { balance: NaN }, { tax_amount: undefined },
    { exchange_rate: Infinity }, { currency: "" }, { status: "invented" }, { approval_status: null },
    { category: "invented" }, { suppliers: { id: billPageRow(2).id, name: "Wrong supplier" } },
  ])("rejects malformed row fields: %j", (patch) => {
    expect(() => parseAccountsPayableBillPage({ items: [{ ...billPageRow(), ...patch }], totalCount: 1 }, 0, 25)).toThrow();
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "1", null])("rejects invalid totalCount %s", (totalCount) => {
    expect(() => parseAccountsPayableBillPage({ items: [], totalCount }, 0, 25)).toThrow();
  });

  it("rejects duplicate rows, truncated pages and rows beyond the count", () => {
    expect(() => parseAccountsPayableBillPage({ items: [billPageRow(), billPageRow()], totalCount: 2 }, 0, 25)).toThrow();
    expect(() => parseAccountsPayableBillPage({ items: [billPageRow()], totalCount: 26 }, 0, 25)).toThrow();
    expect(() => parseAccountsPayableBillPage({ items: [billPageRow()], totalCount: 0 }, 0, 25)).toThrow();
    expect(() => parseAccountsPayableBillPage({ items: [billPageRow()], totalCount: 1 }, 1, 25)).toThrow();
  });

  it.each([null, [], {}, { totalCount: 0 }, { items: [null], totalCount: 1 }])("rejects incomplete payload %j", (value) => {
    expect(() => parseAccountsPayableBillPage(value, 0, 25)).toThrow();
  });
});

describe("accounts payable summary SQL contract", () => {
  it("accepts a complete legitimate zero summary", () => {
    expect(parseAccountsPayableSummary(zeroSummary())).toEqual(zeroSummary());
  });

  it("allows bills excluded for missing FX to have zero monetary totals", () => {
    const value = zeroSummary();
    value.availableMonths = ["2026-09", "2026-08"];
    value.kpis.countPorAprobar = 2;
    value.kpis.fxMissingCount = 3;
    expect(parseAccountsPayableSummary(value)).toEqual(value);
  });

  it.each(Object.keys(zeroSummary().kpis))("requires KPI %s instead of filling zero", (key) => {
    const value = zeroSummary();
    Reflect.deleteProperty(value.kpis, key);
    expect(() => parseAccountsPayableSummary(value)).toThrow();
  });

  it.each([
    { totalPendiente: NaN }, { totalVencido: Infinity }, { totalPorVencer: "0" },
    { pagadoMesActual: null }, { totalPorAprobar: -1 }, { countPorAprobar: 0.5 },
    { repPendientes: -1 }, { fxMissingCount: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed KPI values %j", (patch) => {
    expect(() => parseAccountsPayableSummary({ ...zeroSummary(), kpis: { ...zeroSummary().kpis, ...patch } })).toThrow();
  });

  it.each([["2026-13"], ["2026-9"], [null], ["2026-09", "2026-09"], ["2026-08", "2026-09"]])("rejects invalid month options %j", (...months) => {
    expect(() => parseAccountsPayableSummary({ ...zeroSummary(), availableMonths: months })).toThrow();
  });

  it("checks disjoint debt totals and approval counts without rejecting floating point rounding", () => {
    const value = zeroSummary();
    value.availableMonths = ["2026-09"];
    Object.assign(value.kpis, { totalPendiente: 0.3, totalVencido: 0.1, totalPorVencer: 0.2 });
    expect(parseAccountsPayableSummary(value)).toEqual(value);
    value.kpis.totalPorVencer = 0.21;
    expect(() => parseAccountsPayableSummary(value)).toThrow();
    value.kpis.totalPorVencer = 0.2;
    value.kpis.totalPorAprobar = 1;
    expect(() => parseAccountsPayableSummary(value)).toThrow();
  });

  it("rejects amounts with an empty month universe and missing summary members", () => {
    const value = zeroSummary();
    value.kpis.totalPendiente = 1;
    expect(() => parseAccountsPayableSummary(value)).toThrow();
    for (const malformed of [null, [], {}, { kpis: {} }, { availableMonths: [] }]) {
      expect(() => parseAccountsPayableSummary(malformed)).toThrow();
    }
  });
});
