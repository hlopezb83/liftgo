import { addDays } from "date-fns";
import { nowMty, parseDateLocal } from "@/lib/utils";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import type { RentalLine } from "@/features/quotes/components/quotes/RentalLineItems";
import type { useQuoteFormState } from "./useQuoteFormState";

export type QuoteFormState = ReturnType<typeof useQuoteFormState>;

export type EquipmentModel = {
  id: string; manufacturer: string; model: string;
  default_daily_rate?: number | null; default_weekly_rate?: number | null; default_monthly_rate?: number | null;
};

export type ExistingQuote = {
  quote_type?: string; customer_id?: string | null; customer_name?: string | null;
  start_date?: string | null; end_date?: string | null;
  tax_rate: number | string; currency?: string; notes?: string | null;
  valid_until?: string | null; line_items?: unknown; rental_meta?: unknown;
};

const matchModel = (item: LineItem, models: EquipmentModel[]) =>
  models.find((m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model));

export function applyBaseFields(q: ExistingQuote, state: QuoteFormState, isSale: boolean) {
  state.setQuoteType(isSale ? "sale" : "rental");
  state.setCustomerId(q.customer_id || "");
  state.setCustomerName(q.customer_name || "");
  if (q.start_date && q.end_date) {
    state.setDateRange({ from: parseDateLocal(q.start_date), to: parseDateLocal(q.end_date) });
  }
  state.setTaxRate(String(q.tax_rate));
  state.setCurrency(q.currency || "MXN");
  state.setNotes(q.notes || "");
  state.setValidUntil(q.valid_until ? parseDateLocal(q.valid_until) : undefined);
}

export function applyLogistics(allItems: LineItem[], state: QuoteFormState) {
  const logisticsItem = allItems.find((item) => item.description?.includes("Logística"));
  if (!logisticsItem) return;
  state.setIncludeLogistics(true);
  state.setLogisticsCost(logisticsItem.unit_price || logisticsItem.total || 0);
}

export function applySaleLines(items: LineItem[], models: EquipmentModel[], state: QuoteFormState) {
  if (items.length === 0) return;
  const rebuilt = items.map((item) => {
    const found = matchModel(item, models);
    return {
      modelId: found?.id || "",
      quantity: item.quantity || 1,
      unitPrice: item.unit_price || 0,
      discount: item.discount || 0,
      discountType: (item.discount_type || "%") as "%" | "$",
    };
  });
  state.setSaleLines(rebuilt);
}

function lineToRentalLine(item: LineItem, found: EquipmentModel): RentalLine {
  return {
    modelId: found.id,
    quantity: 1,
    dailyRate: found.default_daily_rate ?? 0,
    weeklyRate: found.default_weekly_rate ?? 0,
    monthlyRate: found.default_monthly_rate ?? 0,
    discount: item.discount || 0,
    discountType: (item.discount_type || "%") as "%" | "$",
  };
}

function getRentalMeta(q: ExistingQuote, items: LineItem[]): RentalLine[] | undefined {
  const direct = q.rental_meta as RentalLine[] | undefined;
  if (direct) return direct;
  const firstItem = (items as Array<LineItem & { _rentalMeta?: RentalLine[] }>)?.[0];
  return firstItem?._rentalMeta;
}

function rebuildRentalLinesFromItems(items: LineItem[], models: EquipmentModel[]): RentalLine[] {
  const matched = new Map<string, RentalLine>();
  for (const item of items) {
    const found = matchModel(item, models);
    if (found && !matched.has(found.id)) {
      matched.set(found.id, lineToRentalLine(item, found));
    }
  }
  return Array.from(matched.values());
}

export function applyRentalLines(items: LineItem[], q: ExistingQuote, models: EquipmentModel[], state: QuoteFormState) {
  const meta = getRentalMeta(q, items);
  if (meta && meta.length > 0) {
    state.setRentalLines(meta);
    return;
  }
  if (items.length === 0) return;
  const rebuilt = rebuildRentalLinesFromItems(items, models);
  if (rebuilt.length > 0) state.setRentalLines(rebuilt);
}

export function defaultValidUntil() {
  return addDays(nowMty(), 30);
}
