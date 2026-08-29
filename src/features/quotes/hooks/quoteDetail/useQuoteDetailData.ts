import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { bookingKeys } from "@/features/bookings";
import { useCustomers } from "@/features/customers";
import { useEquipmentModels, useForklifts } from "@/features/fleet";
import { invoiceKeys } from "@/features/invoices";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { parseLineItems, parseRentalMeta } from "@/lib/domain/lineItems";
import { useQuote } from "../quotes/useQuotes";
import { resolveLegacyForkliftIds } from "./quoteBookingBuilders";

export const isPublicoGeneral = (name?: string | null) =>
  !!name && (name.trim().toLowerCase().includes("público en general") || name.trim().toLowerCase().includes("publico en general"));

/**
 * Cuántas reservas generará la cotización: una por unidad cotizada, o por
 * montacargas deducido en cotizaciones legacy sin `rental_meta`.
 */
function countQuoteUnits(
  quote: Parameters<typeof resolveLegacyForkliftIds>[0] | null | undefined,
  forklifts: { id: string; name: string }[] | undefined,
  rentalMeta: { quantity: number }[],
  isModelBased: boolean,
): number {
  if (isModelBased) return rentalMeta.reduce((acc, l) => acc + (l.quantity || 0), 0);
  if (!quote || !forklifts) return 0;
  return resolveLegacyForkliftIds(quote, forklifts).length;
}

/** Rango inclusivo: inicio y fin cuentan (BL-R8-18 / R17-L). */
function computeDurationDays(startDate?: string | null, endDate?: string | null): number {
  if (!startDate || !endDate) return 0;
  return Math.max(1, differenceInDays(new Date(endDate), new Date(startDate)) + 1);
}

/** Lee `rental_meta` de la columna o, en cotizaciones legacy, de la partida. */
function resolveRentalMeta(
  quote: { rental_meta?: Json | null; line_items?: Json | null } | null | undefined,
  isSale: boolean,
): { modelId: string; quantity: number }[] {
  if (!quote || isSale) return [];
  const fromColumn = parseRentalMeta(quote.rental_meta ?? undefined);
  if (fromColumn.length > 0) return fromColumn;
  const allItems = parseLineItems<
    LineItem & { _rentalMeta?: { modelId: string; quantity: number }[] }
  >(quote.line_items ?? undefined);
  return allItems[0]?._rentalMeta ?? [];
}

export function useQuoteDetailData(id: string | undefined) {
  const { data: quote, isLoading, isError, refetch } = useQuote(id);
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const { data: equipmentModels } = useEquipmentModels();

  const { data: linkedBookings, isError: isBookingsError } = useQuery({
    queryKey: bookingKeys.byFilter({ quote_id: id ?? "" }),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id").eq("quote_id", id ?? "");
      if (error) throw error;
      return data || [];
    },
  });
  // Fix 5.2: si la query falla, no hay certeza de que la cotización NO esté
  // convertida — se trata como "ya convertida" para bloquear el botón en vez
  // de habilitarlo por defecto (evita duplicados por fallas de red).
  const alreadyConverted = (linkedBookings?.length ?? 0) > 0 || isBookingsError;
  // Ya está en memoria: no se agrega ninguna consulta nueva.
  const linkedBookingId = linkedBookings?.[0]?.id ?? null;

  const { data: linkedInvoices, isError: isInvoicesError } = useQuery({
    queryKey: invoiceKeys.byFilter({ quote_id: id ?? "" }),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,status")
        .eq("quote_id", id ?? "");
      if (error) throw error;
      return data || [];
    },
  });
  const alreadyInvoiced = (linkedInvoices ?? []).some((i) => i.status !== "cancelled") || isInvoicesError;


  const customerMatch = customers?.find((c) => c.id === quote?.customer_id);
  const quoteType = quote?.quote_type || "rental";
  const isSale = quoteType === "sale";
  const lineItems = parseLineItems<LineItem>(quote?.line_items);

  const durationDays = computeDurationDays(quote?.start_date, quote?.end_date);

  const rentalMeta = resolveRentalMeta(quote, isSale);

  const isModelBasedQuote = rentalMeta.length > 0;

  const unitCount = countQuoteUnits(quote, forklifts, rentalMeta, isModelBasedQuote);

  return {
    quote, isLoading, isError, refetchQuote: refetch, customers, forklifts, equipmentModels,
    customerMatch, quoteType, isSale, lineItems, durationDays,
    rentalMeta, isModelBasedQuote, unitCount, alreadyConverted, linkedBookingId, alreadyInvoiced,
  };
}
