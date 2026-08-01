type Invoice = { status?: string | null; balance?: number | string | null; tipo_cambio?: number | string | null };

/**
 * R12 A3: saldo real MXN — usar `balance` (no `total`) y multiplicar por
 * `tipo_cambio` para normalizar facturas en USD.
 */
export function derivePortalKpis<B extends { status: string }, I extends Invoice>(
  bookings: B[] | undefined,
  invoices: I[] | undefined,
) {
  const bookingList = bookings ?? [];
  const invoiceList = invoices ?? [];
  const activeBookings = bookingList.filter((b) => b.status === "confirmed");
  const unpaidInvoices = invoiceList.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const outstanding = unpaidInvoices.reduce(
    (sum, i) => sum + Number(i.balance ?? 0) * Number(i.tipo_cambio ?? 1),
    0,
  );
  return {
    invoiceList,
    activeBookings,
    unpaidInvoices,
    recentInvoices: invoiceList.slice(0, 5),
    outstanding,
  };
}
