import { isValidUuid } from "@/lib/isValidUuid";

type OriginState = {
  invoiceListBackTo?: unknown;
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
  backState?: { customerListBackTo: string };
  restoreListFilters: boolean;
}

export function getInvoiceBackNavigation(state: unknown, customerId: string | null | undefined): InvoiceBackNavigation {
  const originState = state as OriginState | null;
  if (isOriginFor(originState?.invoiceListBackTo, "/invoices")) {
    return { backTo: originState.invoiceListBackTo, restoreListFilters: false };
  }
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
