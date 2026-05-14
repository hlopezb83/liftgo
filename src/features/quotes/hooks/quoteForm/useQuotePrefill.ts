import { useEffect } from "react";
import { addDays } from "date-fns";
import { nowMty, parseDateLocal } from "@/lib/utils";
import type { LineItem } from "@/lib/invoiceUtils";
import type { RentalLine } from "@/features/quotes/components/quotes/RentalLineItems";
import type { useQuoteFormState } from "./useQuoteFormState";

type State = ReturnType<typeof useQuoteFormState>;
type EquipmentModel = { id: string; manufacturer: string; model: string; default_daily_rate?: number | null; default_weekly_rate?: number | null; default_monthly_rate?: number | null };

type ExistingQuote = {
  quote_type?: string; customer_id?: string | null; customer_name?: string | null;
  start_date?: string | null; end_date?: string | null;
  tax_rate: number | string; currency?: string; notes?: string | null;
  valid_until?: string | null; line_items?: unknown; rental_meta?: unknown;
};
interface Props {
  existingQuote: ExistingQuote | null | undefined;
  equipmentModels: EquipmentModel[] | undefined;
  state: State;
}

const matchModel = (item: LineItem, models: EquipmentModel[]) =>
  models.find((m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model));

function applyBaseFields(q: ExistingQuote, state: State, isSale: boolean) {
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

function applyLogistics(allItems: LineItem[], state: State) {
  const logisticsItem = allItems.find((item) => item.description?.includes("Logística"));
  if (!logisticsItem) return;
  state.setIncludeLogistics(true);
  state.setLogisticsCost(logisticsItem.unit_price || logisticsItem.total || 0);
}

function applySaleLines(items: LineItem[], models: EquipmentModel[], state: State) {
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

function applyRentalLines(items: LineItem[], q: ExistingQuote, models: EquipmentModel[], state: State) {
  const meta = (q.rental_meta as RentalLine[] | undefined)
    || ((items as Array<LineItem & { _rentalMeta?: RentalLine[] }>)?.[0]?._rentalMeta);
  if (meta && meta.length > 0) {
    state.setRentalLines(meta);
    return;
  }
  if (items.length === 0) return;
  const matched = new Map<string, RentalLine>();
  for (const item of items) {
    const found = matchModel(item, models);
    if (found && !matched.has(found.id)) {
      matched.set(found.id, {
        modelId: found.id,
        quantity: 1,
        dailyRate: found.default_daily_rate ?? 0,
        weeklyRate: found.default_weekly_rate ?? 0,
        monthlyRate: found.default_monthly_rate ?? 0,
        discount: item.discount || 0,
        discountType: (item.discount_type || "%") as "%" | "$",
      });
    }
  }
  if (matched.size > 0) state.setRentalLines(Array.from(matched.values()));
}

export function useQuotePrefill({ existingQuote, equipmentModels, state }: Props) {
  useEffect(() => {
    if (!existingQuote) {
      if (!state.validUntil) state.setValidUntil(addDays(nowMty(), 30));
      return;
    }
    const isSale = existingQuote.quote_type === "sale";
    applyBaseFields(existingQuote, state, isSale);

    const allItems = (existingQuote.line_items as LineItem[]) || [];
    applyLogistics(allItems, state);

    if (!equipmentModels) return;
    const nonLogistics = allItems.filter((item) => !item.description?.includes("Logística"));
    if (isSale) applySaleLines(nonLogistics, equipmentModels, state);
    else applyRentalLines(nonLogistics, existingQuote, equipmentModels, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingQuote, equipmentModels]);
}
