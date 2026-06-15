import { describe, it, expect } from "vitest";
import {
  buildPieData,
  buildFinancials,
  computeUtilizationPercent,
  mapMaintenanceAlerts,
  mapInvoiceBreakdown,
  mapMonthlyUtilization,
  mapCashFlow,
  EMPTY_COUNTS,
} from "../dashboardSectionHelpers";

describe("buildPieData", () => {
  it("filtra segmentos con value 0", () => {
    const data = buildPieData({ ...EMPTY_COUNTS, available: 5, rented: 3 });
    expect(data).toHaveLength(2);
    expect(data.map((d) => d.name)).toEqual(["Disponibles", "Rentados"]);
  });

  it("devuelve [] cuando todos son 0", () => {
    expect(buildPieData(EMPTY_COUNTS)).toEqual([]);
  });
});

describe("computeUtilizationPercent", () => {
  it("calcula % de rentados sobre flota activa", () => {
    expect(computeUtilizationPercent({ ...EMPTY_COUNTS, rented: 7 }, 10)).toBe(70);
  });

  it("devuelve 0 cuando no hay flota activa", () => {
    expect(computeUtilizationPercent(EMPTY_COUNTS, 0)).toBe(0);
  });
});

describe("buildFinancials", () => {
  it("usa defaults 0 cuando faltan KPIs", () => {
    expect(buildFinancials(undefined)).toEqual({ mrr: 0, dso: 0, overdueTotal: 0 });
  });

  it("propaga valores presentes", () => {
    expect(buildFinancials({ mrr: 100000, dso: 35, overdue_total: 5000 })).toEqual({
      mrr: 100000, dso: 35, overdueTotal: 5000,
    });
  });
});

describe("mapMaintenanceAlerts", () => {
  it("transforma snake_case a camelCase", () => {
    const result = mapMaintenanceAlerts([
      { forklift_name: "MC-001", next_date: "2026-06-01", forklift_id: "f1" },
    ]);
    expect(result[0]).toEqual({ forkliftName: "MC-001", nextDate: "2026-06-01", forkliftId: "f1" });
  });

  it("tolera undefined", () => {
    expect(mapMaintenanceAlerts(undefined)).toEqual([]);
  });
});

describe("mapInvoiceBreakdown", () => {
  it("asigna color por status", () => {
    const r = mapInvoiceBreakdown([
      { status: "paid", count: 5, total: 100 },
      { status: "draft", count: 1, total: 0 },
      { status: "unknown_status", count: 1, total: 0 },
    ]);
    expect(r[0].color).toContain("--status-available");
    expect(r[1].color).toContain("--status-draft");
    expect(r[2].color).toContain("--status-draft");
  });
});

describe("mapMonthlyUtilization / mapCashFlow", () => {
  it("devuelven [] sin stats", () => {
    expect(mapMonthlyUtilization(undefined)).toEqual([]);
    expect(mapCashFlow(undefined)).toEqual([]);
  });

  it("pasan datos relevantes tal cual", () => {
    expect(mapMonthlyUtilization({ monthly_utilization: [{ month_label: "May 26", utilization: 80 }] }))
      .toEqual([{ month_label: "May 26", utilization: 80 }]);
    expect(mapCashFlow({ cash_flow: [{ month: "May", invoiced: 100, paid: 80 }] }))
      .toEqual([{ month: "May", invoiced: 100, paid: 80 }]);
  });
});
