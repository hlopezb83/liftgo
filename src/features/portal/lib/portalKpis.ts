import { isFxMissing } from "@/features/cash-flow";
import { sumMoney, toMxn } from "@/lib/money";

import { BALANCE_EPSILON } from "./statementRows";

type Invoice = {
  status?: string | null;
  balance?: number | string | null;
  moneda?: string | null;
  tipo_cambio?: number | string | null;
};

/**
 * R12 A3: saldo real MXN — usar `balance` (no `total`).
 * F1: la conversión usa `toMxn` (misma fuente de verdad que Estado de Cuenta),
 * que solo aplica `tipo_cambio` cuando la moneda NO es MXN.
 *
 * R8-03: la regla de "sin tipo de cambio" es la CANÓNICA compartida
 * (`isFxMissing` de cash-flow): divisa con TC nulo, <= 0 o exactamente 1.
 * Antes el portal aceptaba TC = 1 y sumaba dólares como si fueran pesos.
 */
export function derivePortalKpis<B extends { status: string }, I extends Invoice>(
  bookings: B[] | undefined,
  invoices: I[] | undefined,
) {
  const bookingList = bookings ?? [];
  const invoiceList = invoices ?? [];
  const activeBookings = bookingList.filter((b) => b.status === "confirmed");
  const unpaidInvoices = invoiceList.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const convertible = unpaidInvoices.filter((i) => !isFxMissing(i.moneda, i.tipo_cambio));
  const outstanding = sumMoney(
    convertible.map((i) => toMxn(Number(i.balance ?? 0), i.moneda ?? "MXN", i.tipo_cambio)),
  );
  /**
   * R9-09: solo avisamos por tipo de cambio faltante cuando hay saldo real por
   * convertir. Una factura en dólares ya saldada no distorsiona ningún total,
   * así que no debe generar alerta. Se usa la misma tolerancia monetaria
   * (`BALANCE_EPSILON`) del Estado de Cuenta.
   */
  const fxMissingCount = unpaidInvoices.filter(
    (i) => isFxMissing(i.moneda, i.tipo_cambio) && Number(i.balance ?? 0) > BALANCE_EPSILON,
  ).length;
  return {
    invoiceList,
    activeBookings,
    unpaidInvoices,
    recentInvoices: invoiceList.slice(0, 5),
    outstanding,
    fxMissingCount,
  };
}
