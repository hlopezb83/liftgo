import { hasQuotedDiscount, type QuotedRentalBooking } from "@/features/quotes";
import {
  applyQuoteChargeAvailability,
  buildAvailableQuoteChargeLines,
  preserveEnteredQuoteChargeLines,
  type QuoteChargeAvailability,
} from "../../lib/quoteChargeAvailability";
import { buildQuotedBookingLines, type BookingQuoteSource } from "../../lib/quotedBookingLines";
import { buildLinesForBooking, type InvoiceHandlerBooking } from "./bookingRentalLines";
import { requireInvoiceEquipment, type InvoiceRentalEquipment } from "./useInvoiceRentalEquipment";
import type { Customer } from "./invoiceFormBuilders";
import type { LineItemValues } from "../../lib/invoiceFormSchema";

export interface BookingSelectionLoadArgs {
  selectedIds: string[];
  bookings: InvoiceHandlerBooking[] | undefined;
  customers: Customer[] | undefined;
  forklifts?: InvoiceRentalEquipment[];
  quotes?: BookingQuoteSource[] | undefined;
  loadEquipment?: (ids: readonly string[]) => Promise<InvoiceRentalEquipment[]>;
  loadCustomer?: (id: string) => Promise<Customer>;
  loadQuoteSources?: (quoteIds: string[]) => Promise<BookingQuoteSource[]>;
  loadQuotedBookings?: (quoteIds: string[]) => Promise<QuotedRentalBooking[]>;
  loadQuoteCharges: (quoteIds: string[]) => Promise<QuoteChargeAvailability>;
  getCurrentLineItems: () => LineItemValues[];
}

export interface BookingSelectionBundle {
  selected: InvoiceHandlerBooking[];
  primaryCustomer: Customer | undefined;
  rentalLines: LineItemValues[];
  extraLines: LineItemValues[];
}

async function availableChargesForBookings(
  quoteIds: string[],
  quotes: BookingQuoteSource[] | undefined,
  loadQuoteCharges: BookingSelectionLoadArgs["loadQuoteCharges"],
): Promise<LineItemValues[]> {
  const availability = quoteIds.length ? await loadQuoteCharges(quoteIds) : undefined;
  for (const quoteId of quoteIds) {
    const source = quotes?.find((quote) => quote.id === quoteId);
    if (!Array.isArray(source?.line_items)) {
      throw new Error("No se pudieron verificar las partidas de la cotización. Recarga y reintenta.");
    }
    applyQuoteChargeAvailability(quoteId, source.line_items as LineItemValues[], availability);
  }
  return buildAvailableQuoteChargeLines(quoteIds, availability);
}

function discountSiblings(
  sources: BookingQuoteSource[] | undefined,
  bookings: InvoiceHandlerBooking[] | undefined,
  load: BookingSelectionLoadArgs["loadQuotedBookings"],
) {
  const quoteIds = new Set(sources?.filter(hasQuotedDiscount).map((quote) => quote.id));
  if (quoteIds.size === 0) return [];
  return load
    ? load([...quoteIds])
    : (bookings ?? []).filter((booking) => booking.quote_id && quoteIds.has(booking.quote_id));
}

function selectedBookingRows(bookings: InvoiceHandlerBooking[] | undefined, selectedIds: string[]) {
  const byId = new Map(bookings?.map((booking) => [booking.id, booking]));
  const selected = selectedIds.flatMap((id) => byId.get(id) ?? []);
  if (selected.length !== new Set(selectedIds).size) {
    throw new Error("No se pudieron cargar todas las reservas seleccionadas. Recarga las reservas y reintenta.");
  }
  return selected;
}

async function equipmentForSelection(
  selected: InvoiceHandlerBooking[],
  siblings: QuotedRentalBooking[],
  load: BookingSelectionLoadArgs["loadEquipment"],
  fallback: BookingSelectionLoadArgs["forklifts"],
) {
  const ids = [...new Set([...selected, ...siblings].map((booking) => booking.forklift_id))];
  const equipment = load ? await load(ids) : fallback ?? [];
  requireInvoiceEquipment(ids, equipment);
  return equipment;
}

function customerForBooking(
  booking: InvoiceHandlerBooking | undefined,
  load: BookingSelectionLoadArgs["loadCustomer"],
  customers: BookingSelectionLoadArgs["customers"],
) {
  const id = booking?.customer_id;
  if (!id) return undefined;
  return load ? load(id) : customers?.find((customer) => customer.id === id);
}

export async function loadBookingSelectionBundle(
  args: BookingSelectionLoadArgs,
  isCurrentRequest: () => boolean,
): Promise<BookingSelectionBundle | null> {
  const selected = selectedBookingRows(args.bookings, args.selectedIds);
  const quoteIds = [...new Set(selected.flatMap((booking) => (booking.quote_id ? [booking.quote_id] : [])))];
  const sources = args.loadQuoteSources && quoteIds.length ? await args.loadQuoteSources(quoteIds) : args.quotes;
  if (!isCurrentRequest()) return null;
  const [siblings, available] = await Promise.all([
    discountSiblings(sources, args.bookings, args.loadQuotedBookings),
    availableChargesForBookings(quoteIds, sources, args.loadQuoteCharges),
  ]);
  if (!isCurrentRequest()) return null;
  const [equipment, primaryCustomer] = await Promise.all([
    equipmentForSelection(selected, siblings, args.loadEquipment, args.forklifts),
    customerForBooking(selected[0], args.loadCustomer, args.customers),
  ]);
  if (!isCurrentRequest()) return null;
  const rentalLines = buildQuotedBookingLines(
    selected,
    siblings,
    equipment,
    sources,
    (booking) => buildLinesForBooking(booking, equipment),
  );
  const extraLines = preserveEnteredQuoteChargeLines(available, args.getCurrentLineItems());
  return { selected, primaryCustomer, rentalLines, extraLines };
}
