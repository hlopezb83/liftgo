import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { bookingKeys } from "@/features/bookings/lib/queryKeys";
import { useCustomers } from "@/features/customers";
import { useEquipmentModels, useForklifts } from "@/features/fleet";
import { invoiceKeys } from "@/features/invoices/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { parseLineItems, parseRentalMeta } from "@/lib/domain/lineItems";
import { useQuote } from "../quotes/useQuotes";

export const isPublicoGeneral = (name?: string | null) =>
  !!name && (name.trim().toLowerCase().includes("público en general") || name.trim().toLowerCase().includes("publico en general"));

export function useQuoteDetailData(id: string | undefined) {
  const { data: quote, isLoading } = useQuote(id);
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const { data: equipmentModels } = useEquipmentModels();

  const { data: linkedBookings } = useQuery({
    ...bookingKeys.byFilter({ quote_id: id ?? "" }),
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("id").eq("quote_id", id ?? "");
      return data || [];
    },
  });
  const alreadyConverted = (linkedBookings?.length ?? 0) > 0;

  const { data: linkedInvoices } = useQuery({
    ...invoiceKeys.byFilter({ quote_id: id ?? "" }),
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,status")
        .eq("quote_id", id ?? "");
      return data || [];
    },
  });
  const alreadyInvoiced = (linkedInvoices ?? []).some((i) => i.status !== "cancelled");


  const customerMatch = customers?.find((c) => c.id === quote?.customer_id);
  const quoteType = quote?.quote_type || "rental";
  const isSale = quoteType === "sale";
  const lineItems = parseLineItems<LineItem>(quote?.line_items);

  const durationDays = (!quote?.start_date || !quote?.end_date)
    ? 0
    : differenceInDays(new Date(quote.end_date), new Date(quote.start_date));

  const rentalMeta = (() => {
    if (!quote || isSale) return [];
    const fromColumn = parseRentalMeta(quote.rental_meta);
    if (fromColumn.length > 0) return fromColumn;
    const allItems = parseLineItems<LineItem & { _rentalMeta?: { modelId: string; quantity: number }[] }>(quote.line_items);
    return allItems[0]?._rentalMeta ?? [];
  })();

  const isModelBasedQuote = rentalMeta.length > 0;

  return {
    quote, isLoading, customers, forklifts, equipmentModels,
    customerMatch, quoteType, isSale, lineItems, durationDays,
    rentalMeta, isModelBasedQuote, alreadyConverted, alreadyInvoiced,
  };
}
