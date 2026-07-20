import { addDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { nowMty } from "@/lib/utils";
import { quoteFormSchema, type QuoteFormValues, type RentalLineValues, type SaleLineValues } from "../../lib/quoteFormSchema";

export const EMPTY_SALE_LINE: SaleLineValues = {
  modelId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "%",
};

export const EMPTY_RENTAL_LINE: RentalLineValues = {
  modelId: "", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0, discount: 0, discountType: "%",
};

export function defaultQuoteFormValues(): QuoteFormValues {
  return {
    quoteType: "rental",
    customerId: "",
    customerName: "",
    currency: "MXN",
    taxRate: "16",
    notes: "",
    validUntil: addDays(nowMty(), 30),
    dateRange: undefined,
    rentalLines: [{ ...EMPTY_RENTAL_LINE }],
    saleLines: [{ ...EMPTY_SALE_LINE }],
    includeLogistics: false,
    logisticsCost: 0,
  };
}

/**
 * UX-M1: instancia RHF + Zod para QuoteForm.
 * La validación vive en `quoteFormSchema`; errores se renderizan con `<FormMessage>`.
 */
export function useQuoteForm() {
  return useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: defaultQuoteFormValues(),
    mode: "onSubmit",
  });
}

export type QuoteFormReturn = ReturnType<typeof useQuoteForm>;
