import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useCustomers } from "@/features/customers";
import { useEquipmentModels } from "@/features/fleet";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "./quotes/useQuotes";
import { computeTotals, type LineItem } from "@/lib/domain/invoiceHelpers";

import { useQuoteFormState } from "./quoteForm/useQuoteFormState";
import { useQuotePrefill } from "./quoteForm/useQuotePrefill";
import { buildSaleItems, buildRentalItems, validateQuoteForm, buildQuotePayload } from "./quoteForm/quoteFormHelpers";
import { notifySuccess } from "@/lib/ui/appFeedback";

import { useNavigateTransition } from "@/hooks/useNavigateTransition";
export function useQuoteFormLogic() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const { data: equipmentModels } = useEquipmentModels();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const state = useQuoteFormState();
  useQuotePrefill({ existingQuote, equipmentModels, state });

  const {
    quoteType, rentalLines, saleLines, customerId, customerName,
    dateRange, taxRate, currency, notes, validUntil,
    includeLogistics, logisticsCost,
  } = state;

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  const lineItems: LineItem[] = useMemo(() => {
    if (!equipmentModels) return [];
    let items: LineItem[];
    if (quoteType === "sale") {
      items = buildSaleItems(saleLines, equipmentModels);
    } else {
      if (!startDate || !endDate) return [];
      items = buildRentalItems(rentalLines, equipmentModels, startDate, endDate);
    }
    if (includeLogistics && logisticsCost > 0) {
      items.push({ description: "Servicio de Logística", quantity: 1, unit_price: logisticsCost, total: logisticsCost });
    }
    return items;
  }, [equipmentModels, rentalLines, startDate, endDate, quoteType, saleLines, includeLogistics, logisticsCost]);

  const { subtotal, taxAmount, total } = computeTotals(lineItems, Number(taxRate) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateQuoteForm({ customerId, quoteType, startDate, endDate, rentalLines, saleLines })) return;

    const payload = buildQuotePayload({
      existingQuote, nextNumber, customerId, customerName, quoteType,
      rentalLines, saleLines, startDate, endDate, lineItems,
      subtotal, taxRate, taxAmount, total, validUntil, notes, currency,
    });

    if (id) {
      updateQuote.mutate({ id, ...payload }, { onSuccess: () => { notifySuccess("Cotización actualizada"); navigate(`/quotes/${id}`); } });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { notifySuccess("Cotización creada"); navigate("/quotes"); } });
    }
  };

  return {
    id,
    ...state,
    customers,
    equipmentModels,
    lineItems,
    subtotal,
    taxAmount,
    total,
    startDate,
    endDate,
    isPending: createQuote.isPending || updateQuote.isPending,
    handleSubmit,
    navigate,
  };
}
