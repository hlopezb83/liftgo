import { describe, it, expect } from "vitest";
import { buildUtilizationRows, getUtilColor } from "../utilizationHelpers";
import type { Tables } from "@/integrations/supabase/types";

const f = (over: Partial<Tables<"forklifts">>): Tables<"forklifts"> =>
  ({
    id: "id", name: "x", manufacturer: null, model: null, status: "available",
    daily_rate: 0, weekly_rate: 0, monthly_rate: 0, fuel_type: "LPG",
    ...over,
  } as unknown as Tables<"forklifts">);

describe("getUtilColor", () => {
  it("verde >75%, amarillo 40-75%, rojo <40%", () => {
    expect(getUtilColor(90)).toContain("--status-available");
    expect(getUtilColor(50)).toContain("--status-warning");
    expect(getUtilColor(10)).toContain("--status-overdue");
  });
});

describe("buildUtilizationRows", () => {
  it("excluye sold/retired y agrupa por modelo", () => {
    const forklifts = [
      f({ id: "f1", name: "MC-1", manufacturer: "Toyota", model: "8FGCU25", status: "rented" }),
      f({ id: "f2", name: "MC-2", manufacturer: "Toyota", model: "8FGCU25", status: "available" }),
      f({ id: "f3", name: "MC-3", manufacturer: "Hyster", model: "H50FT", status: "sold" }),
      f({ id: "f4", name: "MC-4", manufacturer: "Hyster", model: "H50FT", status: "retired" }),
    ];
    const rows = buildUtilizationRows(forklifts, [], new Date("2026-05-01"), new Date("2026-05-31"));
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("Toyota 8FGCU25");
    expect(rows[0].units).toBe(2);
    expect(rows[0].available).toBe(1);
    expect(rows[0].rented).toBe(1);
  });

  it("calcula % de utilización con reservas activas", () => {
    const forklifts = [f({ id: "f1", name: "MC-1", manufacturer: "T", model: "M", status: "rented" })];
    const bookings = [
      { forklift_id: "f1", start_date: "2026-05-01", end_date: "2026-05-15", status: "active" },
    ];
    const rows = buildUtilizationRows(forklifts, bookings, new Date("2026-05-01"), new Date("2026-05-31"));
    // 15 días reservados / 31 días = ~48%
    expect(rows[0].bookedDays).toBe(15);
    expect(rows[0].utilization).toBeGreaterThan(40);
    expect(rows[0].utilization).toBeLessThan(60);
  });

  it("ignora reservas canceladas", () => {
    const forklifts = [f({ id: "f1", name: "MC-1", manufacturer: "T", model: "M", status: "rented" })];
    const bookings = [
      { forklift_id: "f1", start_date: "2026-05-01", end_date: "2026-05-31", status: "cancelled" },
    ];
    const rows = buildUtilizationRows(forklifts, bookings, new Date("2026-05-01"), new Date("2026-05-31"));
    expect(rows[0].bookedDays).toBe(0);
    expect(rows[0].utilization).toBe(0);
  });
});
