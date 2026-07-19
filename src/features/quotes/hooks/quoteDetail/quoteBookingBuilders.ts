import { supabase } from "@/integrations/supabase/client";
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
 * BL-31 (v7.92.0): las tarifas negociadas se guardan en la reserva, no se
 * escriben al montacargas maestro. Aplica los rates a las bookings recién
 * creadas (bookingId por assignment).
 *
 * Devuelve el número de bookings a las que se les aplicó al menos una tarifa.
 */
export async function applyRatesToBookings(
  assignments: Array<Assignment & { bookingId: string }>,
): Promise<number> {
  type RatePayload = {
    daily_rate?: number;
    weekly_rate?: number;
    monthly_rate?: number;
  };
  const updates = assignments
    .map((a) => {
      const u: RatePayload = {};
      if (a.dailyRate > 0) u.daily_rate = a.dailyRate;
      if (a.weeklyRate > 0) u.weekly_rate = a.weeklyRate;
      if (a.monthlyRate > 0) u.monthly_rate = a.monthlyRate;
      return { bookingId: a.bookingId, payload: u };
    })
    .filter((u) => Object.keys(u.payload).length > 0);

  const results = await Promise.all(
    updates.map((u) =>
      supabase.from("bookings").update(u.payload).eq("id", u.bookingId).select("id"),
    ),
  );
  return results.filter((r) => !r.error && Array.isArray(r.data) && r.data.length > 0).length;
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
