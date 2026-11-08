import type { HistoricalInvoice } from "./invoiceHistory.ts";

export type Forklift = {
  name?: string;
  model?: string;
  serial_number?: string | null;
  daily_rate?: number;
  weekly_rate?: number;
  monthly_rate?: number;
};

export type PreviewLine = {
  bookingId: string;
  // Fase 1 multiempresa: organización dueña de la reserva (nunca del payload).
  organizationId: string | null;
  bookingCode: string | null;
  customerId: string | null;
  customerName: string | null;
  forkliftName: string | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  monthlyRate: number;
  // BL-12: monto efectivo a facturar. Igual a monthlyRate salvo el primer
  // ciclo prorrateado (start_date a mitad de mes).
  billedAmount: number;
  // M-13: tasa de IVA del cliente (porcentaje 0–100). La vista previa la usa
  // para totalizar igual que la generación real (frontera 8%, exento 0%).
  taxRate?: number | null;
  isProrated: boolean;
  proratedDays?: number;
  eligible: boolean;
  isFuture?: boolean;
  previewFingerprint?: string;
  reason?:
    | "period_overlap_review"
    | "legacy_period_review"
    | "already_invoiced"
    | "no_customer"
    | "no_monthly_rate"
    | "period_in_future"
    | "booking_ended"
    | "no_exchange_rate"
    | "quote_discount_review"
    | "quote_source_missing"
    | "quote_charge_review";
  // A1-1: bandera para exponer al operador que la reserva no es MXN.
  currency?: string;
  // B5-01: la tarifa pudo cambiar después de este período (booking.updated_at
  // posterior al fin del período facturado) — advertencia, no bloqueo.
  rateWarning?: boolean;
  existingInvoiceId?: string;
  existingInvoiceNumber?: string;
  quoteId?: string;
};

export type PlanItem = {
  fiscalFingerprint?: string;
  isFuture?: boolean;
  bookingId: string;
  // Fase 1 multiempresa: organización de la reserva de origen; se hereda
  // explícitamente en la agrupación y en la factura resultante.
  organizationId: string;
  customerId: string;
  customerName: string | null;
  forkliftName: string | null;
  forkliftSerial: string | null;
  monthlyRate: number;
  billedAmount: number;
  isProrated: boolean;
  proratedDays: number;
  billingStart: Date;
  billingEnd: Date;
  startStr: string;
  endStr: string;
  // A1-1: moneda/tipo de cambio de la reserva, propagados al RPC.
  currency: string;
  tipoCambio: number;
  // B5-01: advertencia de tarifa potencialmente desactualizada para el periodo.
  rateWarning: boolean;
  // Persistent source quote for remaining charge quantities across siblings.
  quoteId: string | null;
};

export type BookingSource = {
  id: string;
  organization_id: string;
  booking_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  quote_id: string | null;
  start_date: string;
  end_date: string | null;
  monthly_rate: number | null;
  currency: string | null;
  tipo_cambio: number | null;
  updated_at: string | null;
  forklifts: Forklift | null;
  quotes:
    | { organization_id: string; line_items: unknown; rental_meta: unknown }
    | null;
};

export type PlanningContext = {
  booking: BookingSource;
  invoices: HistoricalInvoice[];
  fiscal: Record<string, unknown> | null;
  quoteIssue: PreviewLine["reason"] | null;
  chargeSnapshot: unknown;
};

export type RecurringPlan = {
  lines: PreviewLine[];
  items: PlanItem[];
  truncated: boolean;
  pendingCount: number;
};
