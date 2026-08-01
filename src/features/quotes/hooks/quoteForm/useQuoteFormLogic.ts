import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { useParams } from "react-router";
import { useCustomers } from "@/features/customers";
import { useEquipmentModels } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { computeTotals, type LineItem } from "@/lib/domain/invoiceHelpers";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useQuote, useCreateQuote, useUpdateQuote } from "../quotes/useQuotes";
import { buildSaleItems, buildRentalItems } from "./quoteFormBuilders";
import { buildQuotePayload } from "./quoteFormPayload";
import { EMPTY_RENTAL_LINE, EMPTY_SALE_LINE, useQuoteForm } from "./useQuoteForm";
import { useQuotePrefillValues } from "./useQuotePrefill";
import type { QuoteFormValues } from "../../lib/quoteFormSchema";

export function useQuoteFormLogic() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const { data: customers } = useCustomers();
  const { data: existingQuote, isSuccess: quoteSuccess } = useQuote(id);
  const { data: equipmentModels, isLoading: equipmentModelsLoading, isSuccess: modelsSuccess } = useEquipmentModels();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  // R9-P0 (BL-R8-08): valores reactivos memoizados por quoteId — ver
  // `useQuotePrefillValues`. Se calculan ANTES de `useQuoteForm` para
  // pasarlos como opción `values` de RHF (reemplaza el `form.reset()`
  // one-shot del useEffect anterior, no determinista en navegación SPA).
  const prefillValues = useQuotePrefillValues({
    existingQuote, equipmentModels, quoteReady: quoteSuccess, modelsReady: modelsSuccess,
  });
  const form = useQuoteForm(prefillValues);

  // P1-3: una cotización aceptada (o ya convertida a booking) no puede cambiar
  // de montos — el cliente ya firmó esas cifras. V3-3: la DB tampoco permite
  // rechazarla una vez aceptada; las salidas son cancelarla (solo admin) o
  // crear una versión nueva.
  const isAmountLocked =
    !!existingQuote && (existingQuote.status === "accepted" || !!existingQuote.accepted_at);

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
    if (isAmountLocked) {
      notifyError({
        title: "Cotización aceptada",
        message: "No se pueden modificar los montos de una cotización aceptada o ya convertida a reserva.",
      });
      return;
    }
    const payload = buildQuotePayload({
      existingQuote,
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
    isAmountLocked,
    currency,
    taxRate,
    dateRange,
    includeLogistics,
    logisticsCost,
    customers,
    equipmentModels,
    equipmentModelsLoading,
    lineItems,
    subtotal, taxAmount, total,
    startDate, endDate,
    isPending,
    handleSubmit,
    handleTypeChange,
    navigate,
  };
}
