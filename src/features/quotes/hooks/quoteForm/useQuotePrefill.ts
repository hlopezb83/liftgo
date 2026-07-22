import { useEffect, useState } from "react";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { parseDateLocal } from "@/lib/utils";
import { EMPTY_RENTAL_LINE, EMPTY_SALE_LINE, type QuoteFormReturn } from "./useQuoteForm";
import type { QuoteFormValues, RentalLineValues, SaleLineValues } from "../../lib/quoteFormSchema";

export type EquipmentModel = {
  id: string; manufacturer: string; model: string;
  default_daily_rate?: number | null; default_weekly_rate?: number | null; default_monthly_rate?: number | null;
};

export type ExistingQuote = {
  id?: string;
  quote_type?: string; customer_id?: string | null; customer_name?: string | null;
  start_date?: string | null; end_date?: string | null;
  tax_rate: number | string; currency?: string; notes?: string | null;
  valid_until?: string | null; line_items?: unknown; rental_meta?: unknown;
};

const matchModel = (item: LineItem, models: EquipmentModel[]) =>
  models.find((m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model));

function extractLogistics(items: LineItem[]): { include: boolean; cost: number } {
  const logisticsItem = items.find((item) => item.description?.includes("Logística"));
  if (!logisticsItem) return { include: false, cost: 0 };
  return { include: true, cost: logisticsItem.unit_price || logisticsItem.total || 0 };
}

function rebuildSaleLines(items: LineItem[], models: EquipmentModel[]): SaleLineValues[] {
  if (items.length === 0) return [{ ...EMPTY_SALE_LINE }];
  return items.map((item) => {
    const found = matchModel(item, models);
    return {
      modelId: found?.id || "",
      quantity: item.quantity || 1,
      unitPrice: item.unit_price || 0,
      discount: item.discount || 0,
      discountType: (item.discount_type || "%") as "%" | "$",
    };
  });
}

function lineToRentalLine(item: LineItem, found: EquipmentModel): RentalLineValues {
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

function getRentalMeta(q: ExistingQuote, items: LineItem[]): RentalLineValues[] | undefined {
  const direct = q.rental_meta as RentalLineValues[] | undefined;
  if (direct && direct.length > 0) return direct;
  const firstItem = (items as Array<LineItem & { _rentalMeta?: RentalLineValues[] }>)?.[0];
  return firstItem?._rentalMeta;
}

function rebuildRentalLines(items: LineItem[], q: ExistingQuote, models: EquipmentModel[]): RentalLineValues[] {
  const meta = getRentalMeta(q, items);
  if (meta && meta.length > 0) return meta;
  if (items.length === 0) return [{ ...EMPTY_RENTAL_LINE }];
  const matched = new Map<string, RentalLineValues>();
  for (const item of items) {
    const found = matchModel(item, models);
    if (found && !matched.has(found.id)) matched.set(found.id, lineToRentalLine(item, found));
  }
  const arr = Array.from(matched.values());
  return arr.length > 0 ? arr : [{ ...EMPTY_RENTAL_LINE }];
}

export function buildPrefillValues(q: ExistingQuote, models: EquipmentModel[]): QuoteFormValues {
  const isSale = q.quote_type === "sale";
  const allItems = (q.line_items as LineItem[]) || [];
  const logistics = extractLogistics(allItems);
  const nonLogistics = allItems.filter((item) => !item.description?.includes("Logística"));

  return {
    quoteType: isSale ? "sale" : "rental",
    customerId: q.customer_id || "",
    customerName: q.customer_name || "",
    currency: (q.currency as "MXN" | "USD") || "MXN",
    taxRate: String(q.tax_rate),
    notes: q.notes || "",
    validUntil: q.valid_until ? parseDateLocal(q.valid_until) : undefined,
    dateRange: q.start_date && q.end_date
      ? { from: parseDateLocal(q.start_date), to: parseDateLocal(q.end_date) }
      : undefined,
    rentalLines: isSale ? [{ ...EMPTY_RENTAL_LINE }] : rebuildRentalLines(nonLogistics, q, models),
    saleLines: isSale ? rebuildSaleLines(nonLogistics, models) : [{ ...EMPTY_SALE_LINE }],
    includeLogistics: logistics.include,
    logisticsCost: logistics.cost,
  };
}


interface Props {
  existingQuote: ExistingQuote | null | undefined;
  equipmentModels: EquipmentModel[] | undefined;
  form: QuoteFormReturn;
}

/**
 * UX-M1: hidrata el form una sola vez cuando llega la cotización existente
 * (o cuando entramos en modo "nuevo" y necesitamos defaults con validUntil).
 * `keepDirty: false` es crítico para que `useUnsavedChangesGuard` no dispare al abrir.
 */
export function useQuotePrefill({ existingQuote, equipmentModels, form }: Props) {
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  useEffect(() => {
    // Sin cotización existente: form ya tiene defaults con validUntil default.
    if (!existingQuote) return;
    if (!equipmentModels) return;
    const nextId = existingQuote.id ?? "existing";
    if (hydratedId === nextId) return;
    form.reset(buildPrefillValues(existingQuote, equipmentModels), { keepDirty: false });
    setHydratedId(nextId);
  }, [existingQuote, equipmentModels, form, hydratedId]);
}

