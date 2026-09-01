import { sumMoney, toMxn } from "@/lib/money";

type Invoice = {
  status?: string | null;
  balance?: number | string | null;
  moneda?: string | null;
  tipo_cambio?: number | string | null;
};

/**
 * R12 A3: saldo real MXN — usar `balance` (no `total`).
 * F1: la conversión usa `toMxn` (misma fuente de verdad que Estado de Cuenta),
 * que solo aplica `tipo_cambio` cuando la moneda NO es MXN. Antes multiplicaba
 * siempre, inflando el saldo de facturas en MXN con tipo de cambio heredado.
 */
export function derivePortalKpis<B extends { status: string }, I extends Invoice>(
  bookings: B[] | undefined,
  invoices: I[] | undefined,
) {
  const bookingList = bookings ?? [];
  const invoiceList = invoices ?? [];
  const activeBookings = bookingList.filter((b) => b.status === "confirmed");
  const unpaidInvoices = invoiceList.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  // R7-05: una factura en moneda extranjera SIN tipo de cambio se sumaba 1:1
  // (toMxn devuelve el monto tal cual), subestimando el saldo. Se excluye del
  // total y se reporta el conteo para avisarlo en la UI.
  const fxMissing = (i: Invoice) => {
    const code = (i.moneda ?? "MXN").toUpperCase();
    if (code === "MXN") return false;
    const rate = Number(i.tipo_cambio ?? 0);
    return !(Number.isFinite(rate) && rate > 0);
  };
  const convertible = unpaidInvoices.filter((i) => !fxMissing(i));
  const outstanding = sumMoney(
    convertible.map((i) => toMxn(Number(i.balance ?? 0), i.moneda ?? "MXN", i.tipo_cambio)),
  );
  const fxMissingCount = unpaidInvoices.length - convertible.length;
  return {
    invoiceList,
    activeBookings,
    unpaidInvoices,
    recentInvoices: invoiceList.slice(0, 5),
    outstanding,
    fxMissingCount,
  };
}
