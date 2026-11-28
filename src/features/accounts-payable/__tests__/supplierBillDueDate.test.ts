import { describe, it, expect } from "vitest";

/**
 * Espeja la lógica del trigger SQL `set_supplier_bill_due_date`:
 * si la factura no trae due_date y el proveedor tiene días default,
 * el due_date = issue_date + días.
 */
function computeBillDueDate(
  issueDateYmd: string,
  providedDueDate: string | null,
  defaultDays: number | null,
): string | null {
  if (providedDueDate) return providedDueDate;
  if (defaultDays == null) return null;
  // Anclado a mediodía local: con `T00:00:00` el `toISOString()` retrocedía un
  // día en zonas horarias al este de UTC (p.ej. TZ=Asia/Shanghai en CI).
  const d = new Date(`${issueDateYmd}T12:00:00`);
  d.setDate(d.getDate() + defaultDays);
  return d.toISOString().slice(0, 10);

}

describe("supplier_bills auto due_date", () => {
  it("aplica los días default cuando no hay due_date", () => {
    expect(computeBillDueDate("2026-06-09", null, 30)).toBe("2026-07-09");
    expect(computeBillDueDate("2026-06-09", null, 45)).toBe("2026-07-24");
    expect(computeBillDueDate("2026-06-09", null, 0)).toBe("2026-06-09");
  });
  it("respeta due_date explícito del usuario", () => {
    expect(computeBillDueDate("2026-06-09", "2026-12-31", 30)).toBe("2026-12-31");
  });
  it("devuelve null si proveedor no tiene términos default", () => {
    expect(computeBillDueDate("2026-06-09", null, null)).toBeNull();
  });
});
