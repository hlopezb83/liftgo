import { customerTaxRate, useCustomer } from "@/features/customers";
import { useForklifts } from "@/features/fleet";
import { useHasFinancialAccess } from "@/features/users";
import { computeTotals } from "@/lib/domain/invoiceHelpers";
import { toYMD } from "@/lib/format/dateFormats";
import { DEFAULT_VAT_RATE } from "@/lib/money";
import { buildExtensionLineItems, extensionBillableRange, type ExtensionBillableRange } from "../../lib/extensionBilling";
import type { BookingWithForklift } from "../bookings/useBookings";

export interface BookingExtensionPreview {
  items: ReturnType<typeof buildExtensionLineItems>;
  range: ExtensionBillableRange;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  taxRate: number;
  rateSource: "booking" | "catalog";
}

/** Preview and invoice prefill share the customer's VAT policy and line totals. */
export function useExtendBookingPreview(
  booking: BookingWithForklift,
  newEndDate: Date | undefined,
): BookingExtensionPreview | null {
  const { data: forklifts } = useForklifts();
  const canSeeFinancials = useHasFinancialAccess();
  // Fetch the specific organization-visible customer, not a truncated list.
  // Do not issue a customer query for every closed row action in the list.
  const customerId = canSeeFinancials && newEndDate && Number.isFinite(newEndDate.getTime())
    ? booking.customer_id ?? undefined : undefined;
  const customer = useCustomer(customerId);
  // Match the existing financial UI boundary before reading customer tax data.
  if (!canSeeFinancials) return null;
  // Never flash the default 16% while the customer's actual rate is unknown.
  if (customerId && (customer.isPending || customer.isFetching || customer.isError || !customer.data)) return null;
  return (() => {
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (!forklift || !newEndDate || !Number.isFinite(newEndDate.getTime())) return null;
    const endYMD = toYMD(newEndDate);
    if (!endYMD) return null;
    const range = extensionBillableRange(booking.end_date, endYMD);
    if (!range) return null;
    // El preview comparte el contrato de tarifas con la facturación:
    // `buildExtensionLineItems` resuelve las pactadas o, si no hay ninguna,
    // las del catálogo, incluyendo los remanentes derivados.
    // Fix 8.3: el preview debe cobrar sólo el tramo extendido
    // (`original_end_date + 1` … `new_end_date`), igual que la factura real,
    // no la renta completa desde `start_date`.
    const items = buildExtensionLineItems({
      originalEndDate: booking.end_date,
      newEndDate: endYMD,
      forkliftRates: {
        daily_rate: forklift.daily_rate,
        weekly_rate: forklift.weekly_rate,
        monthly_rate: forklift.monthly_rate,
      },
      bookingRates: {
        daily_rate: booking.daily_rate,
        weekly_rate: booking.weekly_rate,
        monthly_rate: booking.monthly_rate,
      },
      forkliftName: forklift.name,
      serialNumber: forklift.serial_number,
    });
    if (items.length === 0) return null;
    const taxRate = customerTaxRate(customer.data?.tax_rate) ?? DEFAULT_VAT_RATE * 100;
    const totals = computeTotals(items, taxRate);
    // Keep the booking currency explicit, just as the extension invoice does.
    const currency =
      (booking as { currency?: string | null }).currency ?? "MXN";
    // The canonical resolver treats any positive agreed rate as the complete
    // booking contract, including derived daily remainders. Describe that
    // source without inventing a separately agreed daily/weekly price.
    const rateSource = [booking.daily_rate, booking.weekly_rate, booking.monthly_rate]
      .some((rate) => (Number(rate) || 0) > 0) ? "booking" : "catalog";
    return { ...totals, currency, items, range, taxRate, rateSource };
  })();
}
