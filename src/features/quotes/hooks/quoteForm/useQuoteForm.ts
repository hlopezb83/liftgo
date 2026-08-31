import { addDays, startOfDay } from "date-fns";
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
    tipoCambio: 1,
    taxRate: "16",
    notes: "",
    // R13-P2-03: a medianoche — con la hora del día el picker mostraba un
    // día distinto al que termina persistido.
    validUntil: startOfDay(addDays(nowMty(), 30)),
    dateRange: undefined,
    rentalLines: [{ ...EMPTY_RENTAL_LINE }],
    saleLines: [{ ...EMPTY_SALE_LINE }],
    includeLogistics: false,
    logisticsCost: 0,
    includeInsurance: false,
    insuranceCost: 0,
  };
}

/**
 * UX-M1: instancia RHF + Zod para QuoteForm.
 * La validación vive en `quoteFormSchema`; errores se renderizan con `<FormMessage>`.
 *
 * R9-P0 (BL-R8-08): `values` (opción reactiva de RHF v7, distinta de
 * `defaultValues`) permite hidratar el form de forma determinista cuando la
 * cotización existente y el catálogo de equipos llegan tarde (navegación
 * SPA lista→detalle→editar). RHF resincroniza el form cada vez que cambia
 * la *referencia* de `values`; ver `useQuotePrefillValues` para el
 * memoizado que evita resets espurios y pérdida de ediciones del usuario.
 */
export function useQuoteForm(values?: QuoteFormValues) {
  return useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: defaultQuoteFormValues(),
    values,
    mode: "onSubmit",
  });
}


