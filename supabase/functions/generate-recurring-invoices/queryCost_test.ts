// Characterization only: exercise buildPlan with synthetic I/O, never a database.
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import { buildPlan } from "./handler.ts";
import { dateOnlyToMty } from "./periods.ts";
import { bookingFixture } from "./testFixtures.ts";

const quoteId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

for (const bookingCount of [1, 100, 1000]) {
  for (const quotes of ["none", "shared", "distinct"] as const) {
    Deno.test(`query cost: ${bookingCount} bookings, ${quotes} quotes`, async () => {
      const quoteCount = quotes === "none"
        ? 0
        : quotes === "shared"
        ? 1
        : bookingCount;
      const bookings = Array.from(
        { length: bookingCount },
        (_, index) =>
          bookingFixture({
            id: `booking-${index}`,
            quote_id: quoteCount
              ? quoteId(quotes === "shared" ? 0 : index)
              : null,
            quotes: quoteCount
              ? { organization_id: "org-A", line_items: [], rental_meta: [] }
              : null,
          }),
      );
      const reads: Array<{
        table: string;
        filters: Array<{ col: string; val: unknown }>;
      }> = [];
      const record = (
        table: string,
        data: unknown,
      ) =>
      (filters: Array<{ col: string; val: unknown }>) => {
        reads.push({ table, filters });
        return { data, error: null };
      };
      const mock = buildSupabaseMock({
        selectsByFilter: {
          bookings: record("bookings", bookings),
          organization_customers: record("organization_customers", [{
            organization_id: "org-A",
            customer_id: "customer-1",
            tax_rate: 16,
          }]),
          invoice_bookings: record("invoice_bookings", []),
          invoices: record("invoices", []),
        },
        rpcsSeq: {
          get_quote_charge_availability: Array.from(
            { length: quoteCount },
            (_, index) => ({
              data: {
                complete: true,
                quotes: [{
                  quote_id: quoteId(index),
                  legacy_review_required: false,
                  lines: [],
                }],
              },
              error: null,
            }),
          ),
        },
      });
      const start = performance.now();
      const result = await buildPlan(
        mock.client as unknown as SupabaseClient,
        "org-A",
        dateOnlyToMty("2026-07-21"),
      );
      const elapsedMs = Number((performance.now() - start).toFixed(3));
      assertEquals(result.items.length, bookingCount);
      assertEquals(result.lines.length, bookingCount);
      assertEquals(
        result.items.every((item) =>
          item.organizationId === "org-A" && item.billedAmount === 3100 &&
          item.startStr === "2026-07-01" && item.endStr === "2026-07-31"
        ),
        true,
      );
      assertEquals(result.truncated, false);
      assertEquals(result.pendingCount, 0);
      assertEquals(reads.length, 2 + 2 * bookingCount);
      assertEquals(mock.rpcCalls.length, quoteCount);
      assertEquals(
        mock.rpcCalls.every((call) =>
          call.fn === "get_quote_charge_availability"
        ),
        true,
      );
      assertEquals(
        new Set(
          mock.rpcCalls.map((call) => JSON.stringify(call.args?.p_quote_ids)),
        ).size,
        quoteCount,
      );
      for (const table of ["invoice_bookings", "invoices"]) {
        const historyReads = reads.filter((read) => read.table === table);
        assertEquals(historyReads.length, bookingCount);
        assertEquals(
          new Set(
            historyReads.map((read) =>
              read.filters.find((filter) => filter.col === "booking_id")?.val
            ),
          ).size,
          bookingCount,
        );
        assertEquals(
          historyReads.every((read) =>
            read.filters.some((filter) =>
              filter.col ===
                (table === "invoices"
                  ? "organization_id"
                  : "invoices.organization_id") && filter.val === "org-A"
            )
          ),
          true,
        );
      }
      assertEquals(mock.inserts, []);
      assertEquals(mock.updates, []);
      console.info(`RECURRING_READ_FIXTURE ${
        JSON.stringify({
          bookingCount,
          quotes,
          quoteCount,
          selects: reads.length,
          availabilityRpcs: mock.rpcCalls.length,
          totalReads: reads.length + mock.rpcCalls.length,
          elapsedMs,
        })
      }`);
    });
  }
}
