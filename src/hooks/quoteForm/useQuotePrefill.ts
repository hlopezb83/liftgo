import { useEffect } from "react";
import { addDays } from "date-fns";
import { nowMty, parseDateLocal } from "@/lib/utils";
import type { LineItem } from "@/lib/invoiceUtils";
import type { RentalLine } from "@/components/quotes/RentalLineItems";
import type { useQuoteFormState } from "./useQuoteFormState";

type State = ReturnType<typeof useQuoteFormState>;
type EquipmentModel = { id: string; manufacturer: string; model: string; default_daily_rate?: number | null; default_weekly_rate?: number | null; default_monthly_rate?: number | null };

interface Props {
  existingQuote: Record<string, unknown> | null | undefined;
  equipmentModels: EquipmentModel[] | undefined;
  state: State;
}

export function useQuotePrefill({ existingQuote, equipmentModels, state }: Props) {
  useEffect(() => {
    if (existingQuote) {
      const isSale = existingQuote.quote_type === "sale";
      state.setQuoteType(isSale ? "sale" : "rental");
      state.setCustomerId(existingQuote.customer_id || "");
      state.setCustomerName(existingQuote.customer_name || "");
      if (existingQuote.start_date && existingQuote.end_date) {
        state.setDateRange({ from: parseDateLocal(existingQuote.start_date), to: parseDateLocal(existingQuote.end_date) });
      }
      state.setTaxRate(String(existingQuote.tax_rate));
      state.setCurrency((existingQuote as { currency?: string }).currency || "MXN");
      state.setNotes(existingQuote.notes || "");
      state.setValidUntil(existingQuote.valid_until ? parseDateLocal(existingQuote.valid_until) : undefined);

      const allItems = (existingQuote.line_items as LineItem[]) || [];
      const logisticsItem = allItems.find((item) => item.description?.includes("Logística"));
      if (logisticsItem) {
        state.setIncludeLogistics(true);
        state.setLogisticsCost(logisticsItem.unit_price || logisticsItem.total || 0);
      }

      if (isSale && equipmentModels) {
        const nonLogisticsItems = allItems.filter((item) => !item.description?.includes("Logística"));
        if (nonLogisticsItems.length > 0) {
          const rebuilt = nonLogisticsItems.map((item) => {
            const found = equipmentModels.find(
              (m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model)
            );
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
      }

      if (!isSale && equipmentModels) {
        const nonLogisticsItems = allItems.filter((item) => !item.description?.includes("Logística"));
        const meta = (existingQuote.rental_meta as RentalLine[] | undefined)
          || ((allItems as Array<LineItem & { _rentalMeta?: RentalLine[] }>)?.[0]?._rentalMeta);
        if (meta && meta.length > 0) {
          state.setRentalLines(meta);
        } else if (nonLogisticsItems.length > 0) {
          const matchedModels = new Map<string, RentalLine>();
          for (const item of nonLogisticsItems) {
            const found = equipmentModels.find(
              (m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model)
            );
            if (found && !matchedModels.has(found.id)) {
              matchedModels.set(found.id, {
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
          if (matchedModels.size > 0) {
            state.setRentalLines(Array.from(matchedModels.values()));
          }
        }
      }
    } else if (!state.validUntil) {
      state.setValidUntil(addDays(nowMty(), 30));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingQuote, equipmentModels]);
}
