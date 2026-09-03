import { describe, expect, it } from "vitest";
import {
  bookingIncompatibilityReason,
  periodOutsideBookingsError,
  prefillBillingPeriod,
  validateBookingSelection,
  type BillableBooking,
} from "../bookingCompatibility";

/**
 * Regresión v7.423.0 (P2/P3):
 * - La factura tiene UN periodo/moneda/TC globales → sólo se combinan
 *   reservas del mismo cliente, misma moneda/TC y exactamente el mismo
 *   periodo facturable canónico (prefillBillingPeriod/firstBillingPeriod).
 * - El periodo capturado debe caber en el rango de TODAS las reservas
 *   (espejo cliente del guard de servidor en sync_invoice_bookings).
 */

const issue = new Date(2026, 8, 15); // 15-sep-2026

const recurring = (over: Partial<BillableBooking> = {}): BillableBooking => ({
  id: "b-1",
  customer_id: "c-1",
  start_date: "2026-09-10",
  end_date: "2027-03-15",
  recurring_billing: true,
  currency: "MXN",
  tipo_cambio: 1,
  ...over,
});

const oneShot = (over: Partial<BillableBooking> = {}): BillableBooking => ({
  id: "b-2",
  customer_id: "c-1",
  start_date: "2026-09-10",
  end_date: "2026-09-20",
  recurring_billing: false,
  currency: "MXN",
  tipo_cambio: 1,
  ...over,
});

describe("bookingIncompatibilityReason", () => {
  it("acepta dos recurrentes idénticas (mismo cliente/moneda/periodo canónico)", () => {
    expect(bookingIncompatibilityReason(recurring(), recurring({ id: "b-9" }), issue)).toBeNull();
  });

  it("acepta dos no recurrentes con exactamente el mismo rango", () => {
    expect(bookingIncompatibilityReason(oneShot(), oneShot({ id: "b-9" }), issue)).toBeNull();
  });

  it("rechaza cliente distinto", () => {
    const r = bookingIncompatibilityReason(recurring(), recurring({ id: "b-9", customer_id: "c-2" }), issue);
    expect(r).toMatch(/cliente distinto/);
  });

  it("rechaza moneda distinta (USD vs MXN) sin conversión automática", () => {
    const r = bookingIncompatibilityReason(recurring(), recurring({ id: "b-9", currency: "USD", tipo_cambio: 17.5 }), issue);
    expect(r).toMatch(/moneda distinta/);
  });

  it("rechaza tipo de cambio distinto en moneda extranjera", () => {
    const a = recurring({ currency: "USD", tipo_cambio: 17.2 });
    const b = recurring({ id: "b-9", currency: "USD", tipo_cambio: 17.5 });
    expect(bookingIncompatibilityReason(a, b, issue)).toMatch(/tipo de cambio distinto/);
  });

  it("acepta misma moneda extranjera con el mismo TC", () => {
    const a = recurring({ currency: "USD", tipo_cambio: 17.2 });
    const b = recurring({ id: "b-9", currency: "USD", tipo_cambio: 17.2 });
    expect(bookingIncompatibilityReason(a, b, issue)).toBeNull();
  });

  it("TC sin capturar vs capturado en USD también es incompatible", () => {
    const a = recurring({ currency: "USD", tipo_cambio: 17.2 });
    const b = recurring({ id: "b-9", currency: "USD", tipo_cambio: null });
    expect(bookingIncompatibilityReason(a, b, issue)).toMatch(/tipo de cambio distinto/);
  });

  it("moneda null se normaliza a MXN (compatible con MXN explícito)", () => {
    expect(bookingIncompatibilityReason(recurring(), recurring({ id: "b-9", currency: null }), issue)).toBeNull();
  });

  it("rechaza periodo canónico distinto: recurrente vs no recurrente con mismas fechas", () => {
    // recurrente → primer ciclo 2026-09-10→2026-09-30; no recurrente → rango completo.
    const a = recurring(); // canónico: 10-sep → 30-sep
    const b = oneShot({ id: "b-9", start_date: "2026-09-10", end_date: "2027-03-15" });
    expect(bookingIncompatibilityReason(a, b, issue)).toMatch(/periodo facturable distinto/);
  });

  it("rechaza dos recurrentes que inician en meses distintos", () => {
    const a = recurring(); // sep
    const b = recurring({ id: "b-9", start_date: "2026-10-05", end_date: "2027-03-15" }); // oct
    expect(bookingIncompatibilityReason(a, b, issue)).toMatch(/periodo facturable distinto/);
  });

  it("rechaza dos no recurrentes con rangos distintos (clientes reales con varios patrones)", () => {
    const a = oneShot();
    const b = oneShot({ id: "b-9", end_date: "2026-09-25" });
    expect(bookingIncompatibilityReason(a, b, issue)).toMatch(/periodo facturable distinto/);
  });
});

describe("validateBookingSelection (validación al guardar, no sólo filtro visual)", () => {
  it("selección vacía o de una sola reserva es válida", () => {
    expect(validateBookingSelection([], issue)).toBeNull();
    expect(validateBookingSelection([recurring()], issue)).toBeNull();
  });

  it("acepta tres reservas compatibles", () => {
    const sel = [recurring(), recurring({ id: "b-8" }), recurring({ id: "b-9" })];
    expect(validateBookingSelection(sel, issue)).toBeNull();
  });

  it("rechaza cualquier incompatible con mensaje accionable", () => {
    const sel = [recurring(), recurring({ id: "b-9", currency: "USD", tipo_cambio: 17.5 })];
    const msg = validateBookingSelection(sel, issue);
    expect(msg).toMatch(/No se pueden facturar juntas/);
    expect(msg).toMatch(/Sepáralas en facturas distintas/);
  });
});

describe("periodOutsideBookingsError (espejo del guard de servidor)", () => {
  it("sin reservas seleccionadas no valida nada", () => {
    expect(periodOutsideBookingsError([], "2026-09-01", "2026-09-30")).toBeNull();
  });

  it("exige periodo completo", () => {
    expect(periodOutsideBookingsError([oneShot()], "2026-09-10", "")).toMatch(/inicio y fin/);
    expect(periodOutsideBookingsError([oneShot()], "", "2026-09-20")).toMatch(/inicio y fin/);
  });

  it("rechaza fin anterior al inicio", () => {
    expect(periodOutsideBookingsError([oneShot()], "2026-09-20", "2026-09-10")).toMatch(/anterior al inicio/);
  });

  it("rechaza periodo que inicia antes de la reserva (caso FAC-0113 histórico)", () => {
    // Reserva 2026-08-26 → 2027-08-25 con periodo del mes completo de agosto.
    const b = recurring({ start_date: "2026-08-26", end_date: "2027-08-25" });
    expect(periodOutsideBookingsError([b], "2026-08-01", "2026-08-31")).toMatch(/fuera del rango/);
  });

  it("rechaza periodo que termina después de la reserva", () => {
    expect(periodOutsideBookingsError([oneShot()], "2026-09-10", "2026-09-25")).toMatch(/fuera del rango/);
  });

  it("acepta periodo dentro del rango de TODAS las reservas", () => {
    const sel = [recurring(), recurring({ id: "b-9" })];
    expect(periodOutsideBookingsError(sel, "2026-09-10", "2026-09-30")).toBeNull();
  });

  it("acepta un tramo interior (p. ej. extensión ya reflejada en la reserva)", () => {
    expect(periodOutsideBookingsError([recurring()], "2026-10-01", "2026-10-15")).toBeNull();
  });
});

describe("prefillBillingPeriod (regla canónica, re-export estable)", () => {
  it("no recurrente → rango exacto de la reserva", () => {
    expect(prefillBillingPeriod(oneShot(), issue)).toEqual({ start: "2026-09-10", end: "2026-09-20" });
  });

  it("recurrente → primer ciclo acotado al mes inicial", () => {
    expect(prefillBillingPeriod(recurring(), issue)).toEqual({ start: "2026-09-10", end: "2026-09-30" });
  });

  it("sin reserva → mes de la fecha de emisión (fallback)", () => {
    expect(prefillBillingPeriod(undefined, issue)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });
});
