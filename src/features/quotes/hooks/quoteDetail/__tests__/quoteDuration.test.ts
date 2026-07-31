import { describe, expect, it } from "vitest";
import { differenceInDays } from "date-fns";

/**
 * R8-FE-14 (BL-R8-18): la duración de la cotización debe ser inclusiva
 * (inicio y fin cuentan), igual que BookingPeriodCard (R17-L) y el cálculo
 * de tarifas de buildRentalItems.
 */
function inclusiveDurationDays(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  return Math.max(1, differenceInDays(new Date(endDate), new Date(startDate)) + 1);
}

describe("duración inclusiva de cotización (R8-FE-14)", () => {
  it("una cotización del 01 al 10 del mes cuenta 11 días (no 10)", () => {
    expect(inclusiveDurationDays("2025-06-01", "2025-06-10")).toBe(11);
  });

  it("una renta de un solo día (inicio = fin) cuenta 1 día (no 0)", () => {
    expect(inclusiveDurationDays("2025-06-01", "2025-06-01")).toBe(1);
  });

  it("sin fechas, la duración es 0", () => {
    expect(inclusiveDurationDays(null, null)).toBe(0);
    expect(inclusiveDurationDays("2025-06-01", null)).toBe(0);
  });
});
