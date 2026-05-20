import { useEffect } from "react";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import {
  applyBaseFields, applyLogistics, applySaleLines, applyRentalLines, defaultValidUntil,
  type ExistingQuote, type EquipmentModel, type QuoteFormState,
} from "./quoteFormPrefillHelpers";

interface Props {
  existingQuote: ExistingQuote | null | undefined;
  equipmentModels: EquipmentModel[] | undefined;
  state: QuoteFormState;
}

export function useQuotePrefill({ existingQuote, equipmentModels, state }: Props) {
  useEffect(() => {
    if (!existingQuote) {
      if (!state.validUntil) state.setValidUntil(defaultValidUntil());
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
