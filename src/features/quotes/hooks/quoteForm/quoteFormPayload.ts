import { toYMD } from "@/lib/date/toYMD";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { toJsonArray } from "@/lib/domain/lineItems";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { roundMoney } from "@/lib/money";
import type { RentalLine, SaleLine } from "./quoteFormBuilders";

export interface BuildQuotePayloadArgs {
  existingQuote: { quote_number?: string | null; status?: string | null } | null | undefined;
  customerId: string;
  customerName: string;
  quoteType: "rental" | "sale" | string;
  rentalLines: RentalLine[];
  saleLines: SaleLine[];
  startDate?: Date;
  endDate?: Date;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number | string;
  taxAmount: number;
  total: number;
  validUntil?: Date | null;
  notes: string;
  currency: string;
}

/**
 * R12-FE-07 (P2 r11): la vigencia por defecto (hoy+30) puede caer antes del
 * fin del periodo cotizado, dejando la cotización vencida para su propio
 * rango. Se toma el máximo entre la vigencia elegida y la fecha fin.
 */
export function resolveValidUntil(validUntil?: Date | null, endDate?: Date | null): Date | null {
  if (!validUntil) return endDate ?? null;
  if (!endDate) return validUntil;
  return endDate.getTime() > validUntil.getTime() ? endDate : validUntil;
}

function pickFirstModelId(a: BuildQuotePayloadArgs): string | null {
  const lines = a.quoteType === "sale" ? a.saleLines : a.rentalLines;
  return lines.find((l) => l.modelId)?.modelId ?? null;
}

function resolveDateStrings(a: BuildQuotePayloadArgs): { startStr: string; endStr: string } {
  const today = todayKeyMty();
  const isRental = a.quoteType === "rental";
  return {
    startStr: (isRental && a.startDate ? toYMD(a.startDate) : null) ?? today,
    endStr: (isRental && a.endDate ? toYMD(a.endDate) : null) ?? today,
  };
}

export function buildQuotePayload(a: BuildQuotePayloadArgs) {
  const { startStr, endStr } = resolveDateStrings(a);
  // R6-FE-08: en creación se omite quote_number — lo asigna el trigger
  // `trg_assign_quote_number` (folio real, sin consumir secuencia por
  // display). Solo se conserva al editar una cotización existente.
  return {
    // Cadena vacía => el trigger `trg_assign_quote_number` asigna el folio real.
    quote_number: a.existingQuote?.quote_number ?? "",
    customer_id: a.customerId || null,
    customer_name: a.customerName || null,
    forklift_id: null as string | null,
    equipment_model_id: pickFirstModelId(a),
    start_date: startStr,
    end_date: endStr,
    line_items: toJsonArray(a.lineItems),
    subtotal: roundMoney(a.subtotal),
    tax_rate: Number(a.taxRate),
    tax_amount: roundMoney(a.taxAmount),
    total: roundMoney(a.total),
    status: a.existingQuote?.status || "draft",
    valid_until: a.validUntil ? toYMD(a.validUntil) ?? null : null,
    notes: a.notes || null,
    quote_type: a.quoteType,
    currency: a.currency,
    rental_meta: a.quoteType === "rental" ? toJsonArray(a.rentalLines) : null,
  };
}
