import { useMemo } from "react";
import { differenceInDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useQuote } from "@/hooks/useQuotes";
import { useCustomers } from "@/hooks/useCustomers";
import { useForklifts } from "@/hooks/useForklifts";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { supabase } from "@/integrations/supabase/client";
import type { LineItem } from "@/lib/domain/invoiceUtils";
import { parseLineItems, parseRentalMeta } from "@/lib/lineItems";

export const isPublicoGeneral = (name?: string | null) =>
  !!name && (name.trim().toLowerCase().includes("público en general") || name.trim().toLowerCase().includes("publico en general"));

export function useQuoteDetailData(id: string | undefined) {
  const { data: quote, isLoading } = useQuote(id);
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const { data: equipmentModels } = useEquipmentModels();

  const { data: linkedBookings } = useQuery({
    queryKey: ["bookings_for_quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("id").eq("quote_id", id ?? "");
      return data || [];
    },
  });
  const alreadyConverted = (linkedBookings?.length ?? 0) > 0;

  const customerMatch = useMemo(
    () => customers?.find((c) => c.id === quote?.customer_id),
    [customers, quote?.customer_id],
  );
  const quoteType = quote?.quote_type || "rental";
  const isSale = quoteType === "sale";
  const lineItems = useMemo(
    () => parseLineItems<LineItem>(quote?.line_items),
    [quote?.line_items],
  );

  const durationDays = useMemo(() => {
    if (!quote?.start_date || !quote?.end_date) return 0;
    return differenceInDays(new Date(quote.end_date), new Date(quote.start_date));
  }, [quote?.start_date, quote?.end_date]);

  const rentalMeta = useMemo(() => {
    if (!quote || isSale) return [];
    const fromColumn = parseRentalMeta(quote.rental_meta);
    if (fromColumn.length > 0) return fromColumn;
    const allItems = parseLineItems<LineItem & { _rentalMeta?: { modelId: string; quantity: number }[] }>(quote.line_items);
    return allItems[0]?._rentalMeta ?? [];
  }, [quote, isSale]);

  const isModelBasedQuote = rentalMeta.length > 0;

  return {
    quote, isLoading, customers, forklifts, equipmentModels,
    customerMatch, quoteType, isSale, lineItems, durationDays,
    rentalMeta, isModelBasedQuote, alreadyConverted,
  };
}
