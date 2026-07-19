import type { Json } from "@/integrations/supabase/types";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { parseLineItems } from "@/lib/domain/lineItems";
import type { DeliveryInfo } from "./useQuoteConversionState";

export type Assignment = {
  forkliftId: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
};

type QuoteLike = {
  customer_id?: string | null;
  start_date?: string | null;
  forklift_id?: string | null;
  line_items?: Json | null;
};
type CustomerLike = { id: string; address?: string | null };
type ForkliftLike = { id: string; name: string };

export function buildDeliveryInfos(
  quote: QuoteLike,
  customers: CustomerLike[] | undefined,
  forklifts: ForkliftLike[] | undefined,
  forkliftIds: string[],
  bookingIds: string[],
): DeliveryInfo[] {
  const cust = customers?.find((c) => c.id === quote.customer_id);
  return forkliftIds.map((fId, i) => {
    const fl = forklifts?.find((f) => f.id === fId);
    return {
      bookingId: bookingIds[i],
      forkliftId: fId,
      forkliftName: fl?.name || "Montacargas",
      startDate: quote.start_date ?? "",
      customerAddress: cust?.address || null,
    };
  });
}



/**
 * Deduce los IDs de montacargas a reservar a partir de los line_items de una cotización legacy.
 */
export function resolveLegacyForkliftIds(
  quote: QuoteLike,
  forklifts: ForkliftLike[],
): string[] {
  const items = parseLineItems<LineItem>(quote.line_items);
  const ids: string[] = [];
  for (const item of items) {
    const matched = forklifts.find((f) => item.description?.includes(f.name));
    if (matched && !ids.includes(matched.id)) ids.push(matched.id);
  }
  if (ids.length === 0 && quote.forklift_id) ids.push(quote.forklift_id);
  return ids;
}
