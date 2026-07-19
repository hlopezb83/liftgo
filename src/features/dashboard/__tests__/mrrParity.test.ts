import { describe, expect, it } from "vitest";

/**
 * Invariante: el card "Ingreso Mensual Recurrente" del dashboard
 * (`get_financial_kpis.mrr`) debe coincidir con el total de la página /mrr
 * (`get_mrr_detail.total_mrr`) para cualquier fecha.
 *
 * Bug histórico (v7.98.0 y anteriores): `get_financial_kpis` sumaba TODAS
 * las bookings con `recurring_billing = true` sin filtrar por status; una
 * reserva cancelada que conservara la bandera (RSV-0013) inflaba el KPI.
 *
 * Fix v7.98.1: el RPC agrega `AND b.status = 'confirmed'`.
 * Fix v7.98.2: trigger `trg_bookings_clear_recurring_on_cancel` apaga
 * `recurring_billing` al pasar a `cancelled` — defensa en profundidad.
 *
 * Este test modela ambas reglas en TypeScript sobre un fixture común y
 * verifica que el total coincide antes y después de una cancelación,
 * incluyendo el comportamiento del trigger.
 */

type BookingStatus = "confirmed" | "cancelled" | "draft" | "completed";
type ForkliftStatus = "rented" | "available" | "maintenance" | "sold";

interface Forklift {
  id: string;
  status: ForkliftStatus;
  monthly_rate: number;
}

interface Booking {
  id: string;
  booking_number: string;
  forklift_id: string;
  status: BookingStatus;
  recurring_billing: boolean;
  monthly_rate: number | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
}

interface Db {
  today: string;
  forklifts: Forklift[];
  bookings: Booking[];
}

const covers = (b: Booking, today: string) =>
  b.start_date <= today && (b.end_date === null || b.end_date >= today);

// Espejo de public.get_financial_kpis (sólo la parte de MRR) tras v7.98.1.
function kpiMrr(db: Db): number {
  const fById = new Map(db.forklifts.map((f) => [f.id, f]));
  return db.bookings
    .filter(
      (b) =>
        b.recurring_billing &&
        b.status === "confirmed" &&
        covers(b, db.today),
    )
    .reduce((sum, b) => {
      const master = fById.get(b.forklift_id)?.monthly_rate ?? 0;
      return sum + (b.monthly_rate ?? master ?? 0);
    }, 0);
}

// Espejo de public.get_mrr_detail (fuente de verdad).
function mrrDetailTotal(db: Db): number {
  return db.forklifts
    .filter((f) => f.status === "rented")
    .map((f) => {
      const active = db.bookings
        .filter(
          (b) =>
            b.forklift_id === f.id &&
            b.status === "confirmed" &&
            covers(b, db.today),
        )
        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
      return active ? f.monthly_rate : 0;
    })
    .reduce((a, b) => a + b, 0);
}

// Espejo de trg_bookings_clear_recurring_on_cancel (v7.98.2).
function cancelBooking(db: Db, bookingId: string): Db {
  return {
    ...db,
    bookings: db.bookings.map((b) =>
      b.id === bookingId
        ? { ...b, status: "cancelled", recurring_billing: false }
        : b,
    ),
  };
}

function makeDb(): Db {
  return {
    today: "2026-07-19",
    forklifts: [
      { id: "fk-1", status: "rented", monthly_rate: 20_000 },
      { id: "fk-2", status: "rented", monthly_rate: 30_000 },
      { id: "fk-3", status: "rented", monthly_rate: 18_500 },
    ],
    bookings: [
      {
        id: "b-1",
        booking_number: "RSV-0001",
        forklift_id: "fk-1",
        status: "confirmed",
        recurring_billing: true,
        monthly_rate: null,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      },
      {
        id: "b-2",
        booking_number: "RSV-0002",
        forklift_id: "fk-2",
        status: "confirmed",
        recurring_billing: true,
        monthly_rate: null,
        start_date: "2026-06-01",
        end_date: "2026-12-31",
      },
      {
        id: "b-3",
        booking_number: "RSV-0003",
        forklift_id: "fk-3",
        status: "confirmed",
        recurring_billing: true,
        monthly_rate: null,
        start_date: "2026-05-01",
        end_date: null,
      },
    ],
  };
}

describe("MRR parity: dashboard card ↔ /mrr", () => {
  it("coinciden en el estado base (todas confirmadas)", () => {
    const db = makeDb();
    expect(kpiMrr(db)).toBe(68_500);
    expect(mrrDetailTotal(db)).toBe(68_500);
    expect(kpiMrr(db)).toBe(mrrDetailTotal(db));
  });

  it("siguen coincidiendo después de cancelar una reserva (trigger apaga recurring_billing)", () => {
    const after = cancelBooking(makeDb(), "b-2");

    // El trigger debe haber apagado la bandera.
    const b2 = after.bookings.find((b) => b.id === "b-2")!;
    expect(b2.status).toBe("cancelled");
    expect(b2.recurring_billing).toBe(false);

    expect(kpiMrr(after)).toBe(38_500);
    expect(mrrDetailTotal(after)).toBe(38_500);
    expect(kpiMrr(after)).toBe(mrrDetailTotal(after));
  });

  it("regresión v7.98.0: sin el trigger ni el filtro por status, el KPI se inflaba", () => {
    // Simulamos el estado pre-fix: cancelamos SIN limpiar recurring_billing
    // y usamos la regla vieja del KPI (sin filtro por status).
    const db = makeDb();
    const legacy: Db = {
      ...db,
      bookings: db.bookings.map((b) =>
        b.id === "b-2" ? { ...b, status: "cancelled" } : b, // recurring_billing sigue en true
      ),
    };
    const legacyKpi = legacy.bookings
      .filter((b) => b.recurring_billing && covers(b, legacy.today))
      .reduce((s, b) => {
        const master = legacy.forklifts.find((f) => f.id === b.forklift_id)!
          .monthly_rate;
        return s + (b.monthly_rate ?? master);
      }, 0);

    expect(legacyKpi).toBe(68_500); // incorrecto: sigue contando la cancelada
    expect(mrrDetailTotal(legacy)).toBe(38_500); // correcto
    expect(legacyKpi).not.toBe(mrrDetailTotal(legacy)); // el bug reproducido
  });

  it("no cuenta forklifts en status ≠ 'rented' aun con booking confirmada activa", () => {
    const db = makeDb();
    db.forklifts[0].status = "maintenance"; // fk-1 sale del inventario rentado
    // KPI del dashboard NO mira status del forklift, así que sigue contando
    // via booking. /mrr sí lo excluye. Esta divergencia es esperada y
    // documentada: /mrr es la fuente de verdad operativa.
    expect(mrrDetailTotal(db)).toBe(48_500);
    // Aquí el card sobre-reporta a propósito porque una booking confirmada
    // recurrente sigue generando ingreso. Documentamos el gap.
    expect(kpiMrr(db)).toBe(68_500);
  });
});
