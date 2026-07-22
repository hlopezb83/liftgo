import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { useParams } from "react-router";
import { useCustomers } from "@/features/customers";
import { useEquipmentModels } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { computeTotals, type LineItem } from "@/lib/domain/invoiceHelpers";
import { notifySuccess } from "@/lib/ui/appFeedback";
import type { QuoteFormValues } from "../../lib/quoteFormSchema";
import { buildSaleItems, buildRentalItems } from "./quoteFormBuilders";
import { buildQuotePayload } from "./quoteFormPayload";
import { EMPTY_RENTAL_LINE, EMPTY_SALE_LINE, useQuoteForm } from "./useQuoteForm";
import { useQuotePrefill } from "./useQuotePrefill";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "../quotes/useQuotes";

export function useQuoteFormLogic() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const { data: equipmentModels } = useEquipmentModels();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const form = useQuoteForm();
  useQuotePrefill({ existingQuote, equipmentModels, form });

  // Suscripciones granulares — evita re-renders globales del form.
  const quoteType = useWatch({ control: form.control, name: "quoteType" });
  const rentalLines = useWatch({ control: form.control, name: "rentalLines" });
  const saleLines = useWatch({ control: form.control, name: "saleLines" });
  const dateRange = useWatch({ control: form.control, name: "dateRange" });
  const taxRate = useWatch({ control: form.control, name: "taxRate" });
  const currency = useWatch({ control: form.control, name: "currency" });
  const includeLogistics = useWatch({ control: form.control, name: "includeLogistics" });
  const logisticsCost = useWatch({ control: form.control, name: "logisticsCost" });

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  const lineItems: LineItem[] = useMemo(() => {
    if (!equipmentModels) return [];
    let items: LineItem[];
    if (quoteType === "sale") {
      items = buildSaleItems(saleLines ?? [], equipmentModels);
    } else {
      if (!startDate || !endDate) return [];
      items = buildRentalItems(rentalLines ?? [], equipmentModels, startDate, endDate);
    }
    if (includeLogistics && (logisticsCost ?? 0) > 0) {
      items.push({ description: "Servicio de Logística", quantity: 1, unit_price: logisticsCost, total: logisticsCost });
    }
    return items;
  }, [quoteType, saleLines, rentalLines, equipmentModels, startDate, endDate, includeLogistics, logisticsCost]);

  const { subtotal, taxAmount, total } = computeTotals(lineItems, Number(taxRate) || 0);

  const isPending = createQuote.isPending || updateQuote.isPending;
  useUnsavedChangesGuard(form.formState.isDirty && !isPending);

  const onValid = (values: QuoteFormValues) => {
    const payload = buildQuotePayload({
      existingQuote, nextNumber,
      customerId: values.customerId,
      customerName: values.customerName,
      quoteType: values.quoteType,
      rentalLines: values.rentalLines,
      saleLines: values.saleLines,
      startDate: values.dateRange?.from,
      endDate: values.dateRange?.to,
      lineItems,
      subtotal, taxRate: values.taxRate, taxAmount, total,
      validUntil: values.validUntil ?? null,
      notes: values.notes,
      currency: values.currency,
    });

    if (id) {
      updateQuote.mutate({ id, ...payload }, {
        onSuccess: () => {
          notifySuccess("Cotización actualizada");
          form.reset(values); // limpia isDirty para el guard
          navigate(`/quotes/${id}`);
        },
      });
    } else {
      createQuote.mutate(payload, {
        onSuccess: () => {
          notifySuccess("Cotización creada");
          form.reset(values);
          navigate("/quotes");
        },
      });
    }
  };

  const handleSubmit = form.handleSubmit(onValid);

  const handleTypeChange = (type: string) => {
    const t = (type === "sale" ? "sale" : "rental") as "rental" | "sale";
    form.setValue("quoteType", t, { shouldDirty: true });
    form.setValue("rentalLines", [{ ...EMPTY_RENTAL_LINE }], { shouldDirty: true });
    form.setValue("saleLines", [{ ...EMPTY_SALE_LINE }], { shouldDirty: true });
    form.setValue("dateRange", undefined, { shouldDirty: true });
    form.setValue("includeLogistics", false, { shouldDirty: true });
    form.setValue("logisticsCost", 0, { shouldDirty: true });
  };

  return {
    id,
    form,
    quoteType,
    currency,
    taxRate,
    dateRange,
    includeLogistics,
    logisticsCost,
    customers,
    equipmentModels,
    lineItems,
    subtotal, taxAmount, total,
    startDate, endDate,
    isPending,
    handleSubmit,
    handleTypeChange,
    navigate,
  };
}
