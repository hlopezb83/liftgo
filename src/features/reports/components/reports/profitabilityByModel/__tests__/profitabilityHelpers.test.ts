import { describe, it, expect } from "vitest";
import {
  buildModelUnitsMap, buildRevenueMap, buildCostMap, aggregateRows,
} from "../profitabilityHelpers";

const forklifts = [
  { id: "f1", name: "MC-1", manufacturer: "Toyota", model: "8FGCU25" },
  { id: "f2", name: "MC-2", manufacturer: "Toyota", model: "8FGCU25" },
  { id: "f3", name: "MC-3", manufacturer: "Hyster", model: "H50FT" },
];

const start = new Date("2026-01-01");
const end = new Date("2026-12-31");

describe("buildModelUnitsMap", () => {
  it("agrupa unidades por modelo manufacturer+model", () => {
    const { modelUnits, forkliftModel } = buildModelUnitsMap(forklifts);
    expect(modelUnits.get("Toyota 8FGCU25")?.size).toBe(2);
    expect(modelUnits.get("Hyster H50FT")?.size).toBe(1);
    expect(forkliftModel.get("f1")).toBe("Toyota 8FGCU25");
  });

  it("usa name como fallback si no hay manufacturer/model", () => {
    const { modelUnits } = buildModelUnitsMap([{ id: "x", name: "Especial", manufacturer: null, model: null }]);
    expect(modelUnits.has("Especial")).toBe(true);
  });
});

describe("buildRevenueMap", () => {
  it("sólo cuenta facturas paid con paid_at en rango", () => {
    const map = buildRevenueMap(
      [
        { status: "paid", paid_at: "2026-03-01", booking_id: "b1", total: 5000 },
        { status: "paid", paid_at: "2025-01-01", booking_id: "b1", total: 9999 }, // fuera de rango
        { status: "sent", paid_at: "2026-03-01", booking_id: "b1", total: 9999 }, // no pagada
        { status: "paid", paid_at: "2026-03-01", booking_id: null, total: 100 },   // sin booking
      ],
      [{ id: "b1", forklift_id: "f1" }],
      start, end,
    );
    expect(map.get("f1")).toBe(5000);
  });

  it("EC-M1: incluye el primer y último día del rango (columnas date puras)", () => {
    const map = buildRevenueMap(
      [
        { status: "paid", paid_at: "2026-01-01", booking_id: "b1", total: 111 },
        { status: "paid", paid_at: "2026-12-31", booking_id: "b1", total: 222 },
      ],
      [{ id: "b1", forklift_id: "f1" }],
      start, end,
    );
    expect(map.get("f1")).toBe(333);
  });
});


describe("buildCostMap", () => {
  it("acumula costos por forklift dentro del rango", () => {
    const items = [
      { forklift_id: "f1", performed_at: "2026-05-01", cost: 1000 },
      { forklift_id: "f1", performed_at: "2026-06-01", cost: 500 },
      { forklift_id: "f2", performed_at: "2024-01-01", cost: 9999 }, // fuera
    ];
    const map = buildCostMap(items, (i) => i.performed_at, (i) => i.cost, start, end);
    expect(map.get("f1")).toBe(1500);
    expect(map.get("f2")).toBeUndefined();
  });
});

describe("aggregateRows", () => {
  it("calcula profit y margin por modelo", () => {
    const { modelUnits } = buildModelUnitsMap(forklifts);
    const revenue = new Map([["f1", 10000], ["f2", 5000], ["f3", 8000]]);
    const maint = new Map([["f1", 1000]]);
    const dmg = new Map([["f3", 800]]);
    const rows = aggregateRows(modelUnits, revenue, maint, dmg);
    const toyota = rows.find((r) => r.model === "Toyota 8FGCU25");
    const hyster = rows.find((r) => r.model === "Hyster H50FT");
    expect(toyota?.revenue).toBe(15000);
    expect(toyota?.profit).toBe(14000);
    expect(toyota?.margin).toBeCloseTo((14000 / 15000) * 100, 1);
    expect(hyster?.profit).toBe(7200);
  });

  it("margin = 0 cuando no hay revenue", () => {
    const { modelUnits } = buildModelUnitsMap(forklifts);
    const rows = aggregateRows(modelUnits, new Map(), new Map(), new Map());
    expect(rows.every((r) => r.margin === 0)).toBe(true);
  });
});
