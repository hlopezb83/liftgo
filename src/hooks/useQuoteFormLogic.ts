import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCustomers } from "@/hooks/useCustomers";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItemsFromModel, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { toast } from "sonner";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import { toJsonArray } from "@/lib/lineItems";
import { useQuoteFormState } from "./quoteForm/useQuoteFormState";
import { useQuotePrefill } from "./quoteForm/useQuotePrefill";

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
    let items: LineItem[] = [];
    if (quoteType === "sale") {
      if (!equipmentModels) return [];
      items = saleLines
        .filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0)
        .map((l) => {
          const m = equipmentModels.find((em) => em.id === l.modelId);
          return {
            description: m ? `${m.manufacturer} ${m.model} - Venta de equipo` : "Venta de equipo",
            quantity: l.quantity,
            unit_price: l.unitPrice,
            total: l.quantity * l.unitPrice,
            discount: l.discount || 0,
            discount_type: l.discountType || "%",
          };
        });
    } else {
      if (!equipmentModels || !startDate || !endDate) return [];
      const validLines = rentalLines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
      for (const line of validLines) {
        const model = equipmentModels.find((m) => m.id === line.modelId);
        const modelName = model ? `${model.manufacturer} ${model.model}` : "Equipo";
        const generated = generateLineItemsFromModel(
          modelName, line.dailyRate, line.weeklyRate, line.monthlyRate,
          format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"), line.quantity
        );
        for (const item of generated) {
          if (line.discount && line.discount > 0) {
            item.discount = line.discount;
            item.discount_type = line.discountType;
          }
          items.push(item);
        }
      }
    }
    if (includeLogistics && logisticsCost > 0) {
      items.push({ description: "Servicio de Logística", quantity: 1, unit_price: logisticsCost, total: logisticsCost });
    }
    return items;
  }, [equipmentModels, rentalLines, startDate, endDate, quoteType, saleLines, includeLogistics, logisticsCost]);

  const { subtotal, taxAmount, total } = computeTotals(lineItems, Number(taxRate) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error("Selecciona un cliente"); return; }
    if (quoteType === "rental" && (!startDate || !endDate)) { toast.error("Selecciona el periodo de renta"); return; }
    if (quoteType === "rental") {
      const validLines = rentalLines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
      if (validLines.length === 0) { toast.error("Agrega al menos un modelo con tarifas"); return; }
    }
    if (quoteType === "sale") {
      const validLines = saleLines.filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0);
      if (validLines.length === 0) { toast.error("Agrega al menos un modelo con cantidad y precio"); return; }
    }

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
      start_date: quoteType === "rental" ? format(startDate!, "yyyy-MM-dd") : today,
      end_date: quoteType === "rental" ? format(endDate!, "yyyy-MM-dd") : today,
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
