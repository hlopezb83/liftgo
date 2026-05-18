import { format } from "date-fns";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { toJsonArray } from "@/lib/lineItems";
import { nowMty } from "@/lib/utils";
import type { RentalLine, SaleLine } from "./quoteFormBuilders";

export interface BuildQuotePayloadArgs {
  existingQuote: { quote_number?: string | null; status?: string | null } | null | undefined;
  nextNumber: string | null | undefined;
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

function pickFirstModelId(a: BuildQuotePayloadArgs): string | null {
  const lines = a.quoteType === "sale" ? a.saleLines : a.rentalLines;
  return lines.find((l) => l.modelId)?.modelId ?? null;
}

function resolveDateStrings(a: BuildQuotePayloadArgs): { startStr: string; endStr: string } {
  const today = format(nowMty(), "yyyy-MM-dd");
  const isRental = a.quoteType === "rental";
  return {
    startStr: isRental && a.startDate ? format(a.startDate, "yyyy-MM-dd") : today,
    endStr: isRental && a.endDate ? format(a.endDate, "yyyy-MM-dd") : today,
  };
}

export function buildQuotePayload(a: BuildQuotePayloadArgs) {
  const { startStr, endStr } = resolveDateStrings(a);
  return {
    quote_number: a.existingQuote?.quote_number || a.nextNumber || "COT-0001",
    customer_id: a.customerId || null,
    customer_name: a.customerName || null,
    forklift_id: null,
    equipment_model_id: pickFirstModelId(a),
    start_date: startStr,
    end_date: endStr,
    line_items: toJsonArray(a.lineItems),
    subtotal: a.subtotal,
    tax_rate: Number(a.taxRate),
    tax_amount: a.taxAmount,
    total: a.total,
    status: a.existingQuote?.status || "draft",
    valid_until: a.validUntil ? format(a.validUntil, "yyyy-MM-dd") : null,
    notes: a.notes || null,
    quote_type: a.quoteType,
    currency: a.currency,
    rental_meta: a.quoteType === "rental" ? toJsonArray(a.rentalLines) : null,
  };
}
