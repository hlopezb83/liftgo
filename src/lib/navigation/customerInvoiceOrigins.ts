import { isValidUuid } from "@/lib/isValidUuid";

type OriginState = {
  invoiceListBackTo?: unknown;
  reportInvoiceBackTo?: unknown;
  bookingInvoiceBackTo?: unknown;
  bookingReturnState?: unknown;
  customerInvoiceBackTo?: unknown;
  customerListBackTo?: unknown;
};

/** Only a captured local route may become a return target. */
function isOriginFor(value: unknown, pathname: string): value is string {
  return typeof value === "string"
    && !value.includes("\\") && ![...value].some((char) => char.charCodeAt(0) < 32)
    && (value === pathname || value.startsWith(`${pathname}?`) || value.startsWith(`${pathname}#`));
}

export function getCustomerListBackTo(state: unknown): string | undefined {
  const origin = (state as OriginState | null)?.customerListBackTo;
  return isOriginFor(origin, "/customers") ? origin : undefined;
}

interface InvoiceBackNavigation {
  backTo: string;
  backState?: { customerListBackTo?: string; quoteReturnTo?: string; calendarReturnTo?: string };
  restoreListFilters: boolean;
}

function getBookingInvoiceBack(originState: OriginState | null): InvoiceBackNavigation | undefined {
  const bookingOrigin = originState?.bookingInvoiceBackTo;
  if (typeof bookingOrigin === "string") {
    const id = bookingOrigin.split(/[?#]/)[0].replace(/^\/bookings\//, "");
    if (isValidUuid(id) && isOriginFor(bookingOrigin, `/bookings/${id}`)) {
      const previous = originState?.bookingReturnState as { quoteReturnTo?: unknown; calendarReturnTo?: unknown } | null;
      const backState: NonNullable<InvoiceBackNavigation["backState"]> = {};
      const quote = previous?.quoteReturnTo;
      if (typeof quote === "string" && quote.startsWith("/quotes/") && isValidUuid(quote.slice(8))) backState.quoteReturnTo = quote;
      if (isOriginFor(previous?.calendarReturnTo, "/calendar")) backState.calendarReturnTo = previous.calendarReturnTo;
      return { backTo: bookingOrigin, ...(Object.keys(backState).length ? { backState } : {}), restoreListFilters: false };
    }
  }
  return undefined;
}

export function getInvoiceBackNavigation(state: unknown, customerId: string | null | undefined): InvoiceBackNavigation {
  const originState = state as OriginState | null;
  if (isOriginFor(originState?.invoiceListBackTo, "/invoices")) {
    return { backTo: originState.invoiceListBackTo, restoreListFilters: false };
  }
  if (isOriginFor(originState?.reportInvoiceBackTo, "/reports")) {
    return { backTo: originState.reportInvoiceBackTo, restoreListFilters: false };
  }
  const bookingBack = getBookingInvoiceBack(originState);
  if (bookingBack) return bookingBack;
  const customerOrigin = originState?.customerInvoiceBackTo;
  if (isValidUuid(customerId) && isOriginFor(customerOrigin, `/customers/${customerId}`)) {
    const customerListBackTo = getCustomerListBackTo(state);
    return {
      backTo: customerOrigin,
      ...(customerListBackTo ? { backState: { customerListBackTo } } : {}),
      restoreListFilters: false,
    };
  }
  return { backTo: "/invoices", restoreListFilters: true };
}
