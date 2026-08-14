import { describe, it, expect } from "vitest";
import { buildLinesForBooking } from "@/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers";
import type { Forklift } from "@/features/fleet";

const forklift: Forklift = {
  id: "fk-1",
  name: "Toyota 8FGCU25",
  daily_rate: 500,
  weekly_rate: 2_000,
  monthly_rate: 10_000,
} as unknown as Forklift;

describe("buildLinesForBooking", () => {
  it("usa la tarifa pactada en la reserva cuando existe (no la del montacargas)", () => {
    const items = buildLinesForBooking(
      {
        id: "bk-1",
        forklift_id: "fk-1",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        // Reserva pactada a precio distinto (mayor) al del montacargas.
        daily_rate: 600,
        weekly_rate: 2_500,
        monthly_rate: 12_000,
      },
      [forklift],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "Toyota 8FGCU25 — Renta mensual",
      quantity: 1,
      unit_price: 12_000,
      total: 12_000,
    });
    expect(items[0].unit_price).not.toBe(10_000);
  });

  it("cae a la tarifa del montacargas cuando la reserva no capturó tarifa (null)", () => {
    const items = buildLinesForBooking(
      {
        id: "bk-2",
        forklift_id: "fk-1",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        daily_rate: null,
        weekly_rate: null,
        monthly_rate: null,
      },
      [forklift],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ unit_price: 10_000, total: 10_000 });
  });

  it("marca las partidas con clave_prod_serv, clave_unidad y objeto_imp", () => {
    const items = buildLinesForBooking(
      {
        id: "bk-3",
        forklift_id: "fk-1",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        daily_rate: 600,
        weekly_rate: 2_500,
        monthly_rate: 12_000,
      },
      [forklift],
    );
    expect(items[0]).toMatchObject({
      clave_prod_serv: "78181500",
      clave_unidad: "DAY",
      objeto_imp: "02",
    });
  });

  it("devuelve [] si no encuentra el montacargas", () => {
    const items = buildLinesForBooking(
      { id: "bk-4", forklift_id: "otro", start_date: "2026-01-01", end_date: "2026-01-31" },
      [forklift],
    );
    expect(items).toEqual([]);
  });
});
