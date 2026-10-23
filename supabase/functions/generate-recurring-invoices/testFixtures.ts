// In-memory boundary fixtures only. No duplicate period, selection or money logic.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import type { HistoricalInvoice } from "./invoiceHistory.ts";

export function bookingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    organization_id: "org-A",
    booking_number: "QA-1",
    customer_id: "customer-1",
    customer_name: "QA customer",
    quote_id: null,
    start_date: "2026-07-01",
    end_date: null,
    last_billed_date: null,
    monthly_rate: 3100,
    currency: "MXN",
    tipo_cambio: 1,
    updated_at: null,
    recurring_billing: true,
    status: "confirmed",
    forklifts: { name: "QA forklift", serial_number: "QA", monthly_rate: 9000 },
    quotes: null,
    ...overrides,
  };
}

export function invoiceFixture(
  overrides: Partial<HistoricalInvoice> = {},
): HistoricalInvoice {
  return {
    id: "invoice-1",
    invoice_number: "QA-INV-1",
    billing_period_start: "2026-06-01",
    billing_period_end: "2026-06-30",
    status: "draft",
    cfdi_status: null,
    line_items: [],
    ...overrides,
  };
}

type Filters = Array<{ col: string; val: unknown }>;
export function planningFixture(options: {
  bookings?: ReturnType<typeof bookingFixture>[];
  linked?: Array<{ invoices: HistoricalInvoice | null }>;
  direct?: HistoricalInvoice[];
  failTable?: string;
} = {}) {
  const queries: Array<{ table: string; filters: Filters }> = [];
  const bookings = options.bookings ?? [bookingFixture()];
  const response = (table: string, filters: Filters, data: unknown) => {
    queries.push({ table, filters });
    return {
      data,
      error: options.failTable === table ? new Error(`failed ${table}`) : null,
    };
  };
  const mock = buildSupabaseMock({
    selectsByFilter: {
      bookings: (filters) =>
        response(
          "bookings",
          filters,
          bookings.filter((row) =>
            filters.every(({ col, val }) =>
              row[col as keyof typeof row] === val
            )
          ),
        ),
      organization_customers: (filters) =>
        response(
          "organization_customers",
          filters,
          filters.some((filter) => filter.col === "organization_id")
            ? {
              tax_rate: filters.find((filter) =>
                  filter.col === "organization_id"
                )?.val === "org-B"
                ? 8
                : 16,
              uso_cfdi: "G03",
            }
            : [
              {
                organization_id: "org-A",
                customer_id: "customer-1",
                tax_rate: 16,
              },
              {
                organization_id: "org-B",
                customer_id: "customer-1",
                tax_rate: 8,
              },
            ],
        ),
      invoice_bookings: (filters) =>
        response("invoice_bookings", filters, options.linked ?? []),
      invoices: (filters) =>
        response("invoices", filters, options.direct ?? []),
      organization_memberships: (filters) =>
        response("organization_memberships", filters, [{
          organization_id: "org-A",
        }]),
      organizations: (filters) =>
        response("organizations", filters, [{ id: "org-A", is_active: true }]),
    },
    rpcs: {
      get_quote_charge_availability: {
        data: { complete: true, quotes: [] },
        error: null,
      },
      create_recurring_invoice: {
        data: { invoice_id: "created-1", invoice_number: "QA-NEW" },
        error: null,
      },
    },
  });
  return { ...mock, client: mock.client as unknown as SupabaseClient, queries };
}
