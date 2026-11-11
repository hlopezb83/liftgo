import type { Json } from "@/integrations/supabase/types";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { parseLineItems } from "@/lib/domain/lineItems";
import type { ConvertedBooking } from "./quoteConversionRpc";
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
  end_date?: string | null;
  forklift_id?: string | null;
  line_items?: Json | null;
};
type CustomerLike = { id: string; address?: string | null };
type ForkliftLike = { id: string; name: string };

export function buildDeliveryInfos(
  bookings: ConvertedBooking[],
  customers: CustomerLike[] | undefined,
  forklifts: ForkliftLike[] | undefined,
): DeliveryInfo[] {
  return bookings.map((booking) => {
    const customer = customers?.find((item) => item.id === booking.customer_id);
    const forklift = forklifts?.find((item) => item.id === booking.forklift_id);
    return {
      bookingId: booking.booking_id,
      forkliftId: booking.forklift_id,
      forkliftName: forklift?.name || "Montacargas",
      startDate: booking.start_date,
      endDate: booking.end_date,
      customerAddress: customer?.address || null,
    };
  });
}



const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * FIX-R2-09 (02-FIX-12): match por token completo. El nombre debe aparecer
 * delimitado por inicio/fin o por no-alfanuméricos, para que "MC-001" NO
 * empareje con "MC-0010" ni "MC-0011" (substring ciego asignaba la unidad
 * equivocada). Nombres con '-' funcionan: el guion es un delimitador válido.
 */
function descriptionMentionsForklift(description: string | null | undefined, name: string): boolean {
  if (!description || !name) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(name)}([^A-Za-z0-9]|$)`);
  return re.test(description);
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
  // Si un nombre es prefijo-token de otro ("MC-001" vs "MC-001-A"), gana el
  // más específico: orden descendente por longitud.
  const candidates = [...forklifts].sort((a, b) => b.name.length - a.name.length);
  for (const item of items) {
    const matched = candidates.find((f) => descriptionMentionsForklift(item.description, f.name));
    if (matched && !ids.includes(matched.id)) ids.push(matched.id);
  }
  if (ids.length === 0 && quote.forklift_id) ids.push(quote.forklift_id);
  return ids;
}
