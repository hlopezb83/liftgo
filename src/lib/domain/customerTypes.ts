/**
 * DTOs del resumen de clientes. Viven en `lib/domain` para que
 * `lib/pdf` y otras capas de infraestructura los consuman sin
 * acoplarse a hooks de `features/`.
 */
export interface CustomerSummaryBooking {
  id: string;
  booking_number: string;
  start_date: string;
  end_date: string;
  status: string;
  forklift: { name: string | null; model: string | null } | null;
}

export interface CustomerSummaryInvoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string | null;
  total: number;
  status: string;
  currency?: string | null;
  tipo_cambio?: number | null;
}

export interface CustomerSummary {
  bookings: CustomerSummaryBooking[];
  invoices: CustomerSummaryInvoice[];
  /**
   * `outstanding_revenue` es la definición canónica de saldo por cobrar del
   * ERP (facturas por cobrar en MXN, sin canceladas), la misma que aplica el
   * backend al archivar un cliente.
   */
  totals: {
    total_invoiced: number;
    total_paid: number;
    /** B5-02: notas de crédito aplicadas (MXN), restan al saldo del estado de cuenta. */
    total_credited?: number;
    outstanding_revenue?: number;
  };
}
