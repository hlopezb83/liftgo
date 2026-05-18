import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";
import { useEquipmentModels } from "@/features/fleet/hooks/useEquipmentModels";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/features/quotes/hooks/quotes/useQuotes";
import { computeTotals, type LineItem } from "@/lib/domain/invoiceUtils";
import { toast } from "sonner";
import { useQuoteFormState } from "./quoteForm/useQuoteFormState";
import { useQuotePrefill } from "./quoteForm/useQuotePrefill";
import { buildSaleItems, buildRentalItems, validateQuoteForm, buildQuotePayload } from "./quoteForm/quoteFormHelpers";

export function useQuoteFormLogic() {
  const { id } = useParams();
  const navigate = useNavigate();
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

    const today = format(nowMty(), "yyyy-MM-dd");
    const firstModelId = quoteType === "sale"
      ? (saleLines.find((l) => l.modelId)?.modelId || null)
      : (rentalLines.find((l) => l.modelId)?.modelId || null);

    const payload = {
      quote_number: existingQuote?.quote_number || nextNumber || "COT-0001",
      customer_id: customerId || null,
      customer_name: customerName || null,
      forklift_id: null,
      equipment_model_id: firstModelId,
      start_date: quoteType === "rental" && startDate ? format(startDate, "yyyy-MM-dd") : today,
      end_date: quoteType === "rental" && endDate ? format(endDate, "yyyy-MM-dd") : today,
      line_items: toJsonArray(lineItems),
      subtotal, tax_rate: Number(taxRate), tax_amount: taxAmount, total,
      status: existingQuote?.status || "draft",
      valid_until: validUntil ? format(validUntil, "yyyy-MM-dd") : null,
      notes: notes || null,
      quote_type: quoteType,
      currency,
      rental_meta: quoteType === "rental" ? toJsonArray(rentalLines) : null,
    };

    if (id) {
      updateQuote.mutate({ id, ...payload }, { onSuccess: () => { toast.success("Cotización actualizada"); navigate(`/quotes/${id}`); } });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { toast.success("Cotización creada"); navigate("/quotes"); } });
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
