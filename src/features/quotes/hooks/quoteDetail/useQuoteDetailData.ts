import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { bookingKeys } from "@/features/bookings";
import { useCustomer, useCustomers } from "@/features/customers";
import { useEquipmentModels, useForklifts } from "@/features/fleet";
import { invoiceKeys } from "@/features/invoices";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { isIssuedInvoiceStatus } from "@/lib/domain/invoiceStatus";
import { parseLineItems, parseRentalMeta } from "@/lib/domain/lineItems";
import { useQuote } from "../quotes/useQuotes";
import { resolveLegacyForkliftIds } from "./quoteBookingBuilders";
import type { useQuoteConversionState } from "./useQuoteConversionState";

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

export type QuoteLinkStatus = "loading" | "error" | "ready";

function linkStatus(query: { isError: boolean; data: unknown }): QuoteLinkStatus {
  if (query.isError) return "error";
  return query.data === undefined ? "loading" : "ready";
}

function useQuoteLinks(id: string | undefined) {
  const bookings = useQuery({
    queryKey: bookingKeys.byFilter({ quote_id: id ?? "", exclude_cancelled: "1" }),
    enabled: !!id,
    queryFn: async ({ signal }) => {
      // A3B-05: las reservas canceladas no cuentan como conversión vigente;
      // el RPC `convert_quote_to_bookings` permite reconvertir en ese caso.
      const { data, error } = await supabase
        .from("bookings")
        .select("id")
        .eq("quote_id", id ?? "")
        .neq("status", "cancelled").abortSignal(signal);
      if (error) throw error;
      return data || [];
    },
  });


  const invoices = useQuery({
    queryKey: invoiceKeys.byFilter({ quote_id: id ?? "" }),
    enabled: !!id,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,status")
        .eq("quote_id", id ?? "").abortSignal(signal);
      if (error) throw error;
      return data || [];
    },
  });

  const linkedBookings = bookings.data;
  const linkedInvoices = invoices.data ?? [];
  return {
    bookingLinksStatus: linkStatus(bookings), invoiceLinksStatus: linkStatus(invoices),
    retryBookingLinks: () => { void bookings.refetch(); },
    retryInvoiceLinks: () => { void invoices.refetch(); },
    alreadyConverted: !!linkedBookings?.length,
    linkedBookingId: linkedBookings?.[0]?.id ?? null,
    // Bloque 3C: solo una factura EMITIDA bloquea el CTA. Un borrador sigue
    // siendo reanudable (se retoma en vez de crear un duplicado).
    alreadyInvoiced: linkedInvoices.some((i) => isIssuedInvoiceStatus(i.status)),
    draftInvoiceId: linkedInvoices.find((i) => (i.status ?? "draft") === "draft")?.id ?? null,
  };
}

type ConversionDialogsState = Pick<ReturnType<typeof useQuoteConversionState>, "showConvertDialog" | "showAssignmentDialog">;

function useQuoteConversionCatalogs(state: ConversionDialogsState, needsCustomer: boolean, isModelBasedQuote: boolean) {
  const needsCustomers = needsCustomer && (state.showConvertDialog || state.showAssignmentDialog);
  const needsEquipment = state.showAssignmentDialog || (state.showConvertDialog && !isModelBasedQuote);
  const customersQuery = useCustomers(needsCustomers);
  const forkliftsQuery = useForklifts(needsEquipment);
  const modelsQuery = useEquipmentModels(needsEquipment);
  const { data: forklifts } = forkliftsQuery;
  const { data: equipmentModels } = modelsQuery;
  const catalogs = [...(needsCustomers ? [customersQuery] : []), ...(needsEquipment ? [forkliftsQuery, modelsQuery] : [])];
  const catalogsError = catalogs.some((query) => query.isError);
  const catalogsPending = catalogs.some((query) => query.data === undefined);
  const retryCatalogs = () => { void Promise.all(catalogs.filter((query) => query.isError).map((query) => query.refetch())); };
  return { customers: customersQuery.data, forklifts, equipmentModels, catalogsError, catalogsPending, retryCatalogs };
}

export function useQuoteDetailData(id: string | undefined, state: ConversionDialogsState) {
  const { data: quote, isLoading, isError, refetch } = useQuote(id);
  const links = useQuoteLinks(id);
  const { data: customerMatch } = useCustomer(quote?.customer_id ?? undefined);
  const quoteType = quote?.quote_type || "rental";
  const isSale = quoteType === "sale";
  const lineItems = parseLineItems<LineItem>(quote?.line_items);
  const durationDays = computeDurationDays(quote?.start_date, quote?.end_date);
  const rentalMeta = resolveRentalMeta(quote, isSale);
  const isModelBasedQuote = rentalMeta.length > 0;
  const needsCustomer = isPublicoGeneral(quote?.customer_name);
  const catalogs = useQuoteConversionCatalogs(state, needsCustomer, isModelBasedQuote);
  const customers = needsCustomer ? catalogs.customers : customerMatch ? [customerMatch] : undefined;
  const unitCount = countQuoteUnits(quote, catalogs.forklifts, rentalMeta, isModelBasedQuote);

  return {
    ...catalogs, quote, isLoading, isError, refetchQuote: refetch, customers,
    customerMatch, quoteType, isSale, lineItems, durationDays,
    needsCustomer,
    rentalMeta, isModelBasedQuote, unitCount, ...links,
  };
}
