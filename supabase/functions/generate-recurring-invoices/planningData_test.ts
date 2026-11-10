// Real SDK + in-memory HTTP transport. No database, credentials or network.
import { deepStrictEqual as equal, rejects } from "node:assert/strict";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import {
  loadRecurringPlanningData,
  MAX_PLANNING_PAGES,
  MAX_PLANNING_ROWS,
} from "./planningData.ts";
import { planRecurringInvoices } from "./planner.ts";
import { bookingFixture, invoiceFixture } from "./testFixtures.ts";

type Row = Record<string, unknown>;
type Request = { url: URL; headers: Headers; body: Record<string, unknown> };
function transport(
  tables: Record<string, Row[]>,
  options: {
    cap?: number;
    respond?: (
      request: Request,
      rows: Row[],
      count: number,
    ) => Response | undefined;
    rpc?: (request: Request) => unknown;
  } = {},
) {
  const calls: Request[] = [];
  const client = createClient(
    "https://fixture.invalid",
    "synthetic-not-a-secret",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Fetch always returns a Promise, including the synchronous fixture path.
        // deno-lint-ignore require-await
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const headers = new Headers(init?.headers);
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          const request = { url, headers, body };
          calls.push(request);
          if (url.pathname.includes("/rpc/")) {
            return Response.json(
              options.rpc?.(request) ?? {
                complete: true,
                quotes: (body.p_quote_ids as string[]).map((quote_id) => ({
                  quote_id,
                  legacy_review_required: false,
                  lines: [],
                })),
              },
            );
          }
          const table = url.pathname.split("/").at(-1)!;
          const all = (tables[table] ?? []).filter((row) => {
            return [...url.searchParams].every(([key, filter]) => {
              const value = key === "invoices.organization_id"
                ? (row.invoices as Row)?.organization_id
                : row[key];
              if (filter.startsWith("eq.")) {
                return String(value) === filter.slice(3);
              }
              if (filter.startsWith("gt.")) {
                return String(value) > filter.slice(3);
              }
              if (key === "or") {
                const match = filter.match(
                  /^\(booking_id\.gt\.("[^"]*"),and\(booking_id\.eq\.("[^"]*"),invoice_id\.gt\.("[^"]*")\)\)$/,
                );
                if (!match) throw new Error(`Unexpected cursor ${filter}`);
                const booking = JSON.parse(match[1]);
                const invoice = JSON.parse(match[3]);
                return String(row.booking_id) > booking ||
                  row.booking_id === booking &&
                    String(row.invoice_id) > invoice;
              }
              if (filter.startsWith("in.(")) {
                return filter.slice(4, -1).split(",").includes(String(value));
              }
              return true;
            });
          });
          const columns = (url.searchParams.get("order") ?? "").split(",").map((
            value,
          ) => value.split(".")[0]);
          all.sort((a, b) => {
            for (const col of columns) {
              if (a[col] !== b[col]) {
                return String(a[col]) < String(b[col]) ? -1 : 1;
              }
            }
            return 0;
          });
          const offset = Number(url.searchParams.get("offset") ?? 0);
          const limit = Math.min(
            Number(url.searchParams.get("limit") ?? 500),
            options.cap ?? 500,
          );
          const rows = all.slice(offset, offset + limit);
          return options.respond?.(request, rows, all.length) ??
            Response.json(rows, {
              headers: {
                "content-range": `${offset}-${
                  offset + rows.length - 1
                }/${all.length}`,
              },
            });
        },
      },
    },
  );
  return { client, calls };
}
const booking = bookingFixture();
const fiscal = {
  organization_id: "org-A",
  customer_id: "customer-1",
  tax_rate: 16,
  uso_cfdi: "G03",
};
const base = { bookings: [booking], organization_customers: [fiscal] };
const today = new Date("2026-07-21T00:00:00Z");
const quoteId = (i: number) =>
  `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

Deno.test("loader HTTP contract: exact counts, stable ordering, scoped IN and >1000 history rows", async () => {
  const invoices = Array.from({ length: 1001 }, (_, i) => ({
    ...invoiceFixture({
      id: `invoice-${String(i).padStart(5, "0")}`,
      billing_period_start: i === 1000 ? "2026-07-01" : "2026-06-01",
      billing_period_end: i === 1000 ? "2026-07-31" : "2026-06-30",
    }),
    organization_id: "org-A",
    booking_id: booking.id,
  }));
  const { client, calls } = transport({ ...base, invoices }, { cap: 200 });
  const contexts = await loadRecurringPlanningData(client, "org-A");
  equal(contexts[0].invoices.length, 1001);
  equal((await planRecurringInvoices(contexts, today)).items, []);
  const history = calls.filter(({ url }) => url.pathname.endsWith("/invoices"));
  equal(history.map(({ url }) => url.searchParams.get("id")), [
    null,
    "gt.invoice-00199",
    "gt.invoice-00399",
    "gt.invoice-00599",
    "gt.invoice-00799",
    "gt.invoice-00999",
  ]);
  for (const { url, headers } of calls) {
    equal(headers.get("prefer"), "count=exact");
    equal(url.searchParams.get("limit"), "500");
    equal(Boolean(url.searchParams.get("order")), true);
    const pivot = url.pathname.endsWith("/invoice_bookings");
    equal(
      url.searchParams.get(
        pivot ? "invoices.organization_id" : "organization_id",
      ),
      "eq.org-A",
    );
    if (pivot || url.pathname.endsWith("/invoices")) {
      equal(url.searchParams.get("booking_id"), "in.(booking-1)");
    }
  }
});

Deno.test("loader keeps shared customers and invoice coverage separate across organizations", async () => {
  const other = bookingFixture({ id: "booking-2", organization_id: "org-B" });
  const { client, calls } = transport({
    bookings: [booking, other],
    organization_customers: [fiscal, {
      ...fiscal,
      organization_id: "org-B",
      tax_rate: 8,
    }],
    invoices: [{
      ...invoiceFixture({
        billing_period_start: "2026-07-01",
        billing_period_end: "2026-07-31",
      }),
      booking_id: booking.id,
      organization_id: "org-A",
    }],
  });
  const contexts = await loadRecurringPlanningData(client);
  equal(
    contexts.map((
      { booking, fiscal, invoices },
    ) => [booking.id, fiscal?.tax_rate, invoices.length]),
    [["booking-1", 16, 1], ["booking-2", 8, 0]],
  );
  equal(
    (await planRecurringInvoices(contexts, today)).items.map((item) =>
      item.bookingId
    ),
    ["booking-2"],
  );
  equal(
    calls.filter(({ url }) => url.pathname.endsWith("/organization_customers"))
      .map(({ url }) => url.searchParams.get("organization_id")),
    ["eq.org-A", "eq.org-B"],
  );
});

for (
  const failure of [
    "missing count",
    "count changes",
    "short page",
    "repeated rows",
    "foreign organization",
    "foreign booking",
  ] as const
) {
  Deno.test(`loader fails closed on ${failure}`, async () => {
    const rows = Array.from(
      { length: 2 },
      (_, i) => ({
        ...invoiceFixture({ id: `invoice-${i}` }),
        booking_id: booking.id,
        organization_id: "org-A",
      }),
    );
    const { client } = transport({ ...base, invoices: rows }, {
      cap: 1,
      respond: ({ url }, data, count) => {
        if (!url.pathname.endsWith("/invoices")) return;
        const offset = url.searchParams.has("id") ? 1 : 0;
        if (failure === "missing count") return Response.json(data);
        if (failure === "count changes" && offset) count++;
        if (failure === "short page" && offset) data = [];
        if (failure === "repeated rows" && offset) data = [rows[0]];
        if (failure === "foreign organization") {
          data = [{ ...data[0], organization_id: "org-B" }];
        }
        if (failure === "foreign booking") {
          data = [{ ...data[0], booking_id: "other" }];
        }
        return Response.json(data, {
          headers: {
            "content-range": `${offset}-${offset + data.length - 1}/${count}`,
          },
        });
      },
    });
    await rejects(() => loadRecurringPlanningData(client, "org-A"));
  });
}

Deno.test("loader routes direct and pivot history by booking then deduplicates invoice identity", async () => {
  const second = bookingFixture({ id: "booking-2" });
  const invoice = { ...invoiceFixture(), organization_id: "org-A" };
  const { client } = transport({
    ...base,
    bookings: [booking, second],
    invoices: [{ ...invoice, booking_id: booking.id }],
    invoice_bookings: [{
      booking_id: booking.id,
      invoice_id: invoice.id,
      invoices: invoice,
    }, {
      booking_id: second.id,
      invoice_id: invoice.id,
      invoices: invoice,
    }],
  });
  const contexts = await loadRecurringPlanningData(client, "org-A");
  equal(contexts.map(({ invoices }) => invoices.map(({ id }) => id)), [[
    "invoice-1",
  ], ["invoice-1"]]);
});

Deno.test("quote batching isolates invalid content and fingerprints from neighboring quotes", async () => {
  const bookings = [0, 1].map((i) =>
    bookingFixture({
      id: `booking-${i}`,
      quote_id: quoteId(i),
      quotes: { organization_id: "org-A", line_items: [], rental_meta: [] },
    })
  );
  const first = transport({ ...base, bookings });
  const all = await loadRecurringPlanningData(first.client, "org-A");
  equal(
    first.calls.filter(({ url }) => url.pathname.includes("/rpc/")).map((
      { body },
    ) => body.p_quote_ids),
    [[quoteId(0), quoteId(1)]],
  );
  const solo = transport({ ...base, bookings: [bookings[0]] });
  const alone = await loadRecurringPlanningData(solo.client, "org-A");
  equal(
    (await planRecurringInvoices(all, today)).lines[0].previewFingerprint,
    (await planRecurringInvoices(alone, today)).lines[0].previewFingerprint,
  );
  const malformed = transport({ ...base, bookings }, {
    rpc: () => ({
      complete: true,
      quotes: [
        { quote_id: quoteId(0), legacy_review_required: false, lines: [] },
        {
          quote_id: quoteId(1),
          legacy_review_required: false,
          lines: "invalid",
        },
      ],
    }),
  });
  const contexts = await loadRecurringPlanningData(malformed.client, "org-A");
  equal(contexts.map(({ quoteIssue }) => quoteIssue), [
    null,
    "quote_charge_review",
  ]);
  equal(
    (await planRecurringInvoices(contexts, today)).items.map((item) =>
      item.bookingId
    ),
    ["booking-0"],
  );
});

for (const failure of ["missing", "duplicate", "foreign"] as const) {
  Deno.test(`incomplete quote batch (${failure}) blocks all affected quotes`, async () => {
    const bookings = [0, 1].map((i) =>
      bookingFixture({
        id: `booking-${i}`,
        quote_id: quoteId(i),
        quotes: { organization_id: "org-A", line_items: [], rental_meta: [] },
      })
    );
    const ids = failure === "missing"
      ? [0]
      : failure === "duplicate"
      ? [0, 0]
      : [0, 2];
    const { client } = transport({ ...base, bookings }, {
      rpc: () => ({
        complete: true,
        quotes: ids.map((i) => ({
          quote_id: quoteId(i),
          legacy_review_required: false,
          lines: [],
        })),
      }),
    });
    equal(
      (await loadRecurringPlanningData(client, "org-A")).map(({ quoteIssue }) =>
        quoteIssue
      ),
      ["quote_charge_review", "quote_charge_review"],
    );
  });
}

Deno.test("planner is deterministic and does not mutate supplied context", async () => {
  const { client } = transport(base);
  const contexts = await loadRecurringPlanningData(client, "org-A");
  const original = structuredClone(contexts);
  const first = await planRecurringInvoices(contexts, today);
  equal(await planRecurringInvoices(contexts, today), first);
  equal(contexts, original);
  equal(
    first.items.map((
      { bookingId, startStr, endStr, billedAmount },
    ) => [bookingId, startStr, endStr, billedAmount]),
    [["booking-1", "2026-07-01", "2026-07-31", 3100]],
  );
});

Deno.test("keyset fails closed on same-count deletion before cursor plus insertion after it", async () => {
  const invoices = ["A", "B", "C", "D"].map((id) => ({
    ...invoiceFixture({ id }),
    booking_id: booking.id,
    organization_id: "org-A",
  }));
  const { client } = transport({ ...base, invoices }, {
    cap: 2,
    respond: ({ url }) => {
      if (url.pathname.endsWith("/invoices") && !url.searchParams.has("id")) {
        invoices.shift();
        invoices.push({ ...invoices[0], id: "Z" });
      }
      return undefined;
    },
  });
  await rejects(
    () => loadRecurringPlanningData(client, "org-A"),
    /cambió durante la lectura/,
  );
});

Deno.test("pivot keyset crosses invoice and booking boundaries without dropping shared invoice links", async () => {
  const bookings = [booking, bookingFixture({ id: "booking-2" })];
  const invoice_bookings = bookings.flatMap((b) =>
    ["invoice-A", "invoice-B"].map((id) => ({
      booking_id: b.id,
      invoice_id: id,
      invoices: { ...invoiceFixture({ id }), organization_id: "org-A" },
    }))
  );
  const { client, calls } = transport({ ...base, bookings, invoice_bookings }, {
    cap: 1,
  });
  const contexts = await loadRecurringPlanningData(client, "org-A");
  equal(contexts.map(({ invoices }) => invoices.map(({ id }) => id)), [[
    "invoice-A",
    "invoice-B",
  ], ["invoice-A", "invoice-B"]]);
  equal(
    calls.filter(({ url }) => url.pathname.endsWith("/invoice_bookings"))
      .length,
    4,
  );
});

Deno.test("global row budget rejects oversized result before constructing a partial plan", async () => {
  const { client, calls } = transport(base, {
    respond: ({ url }, rows) =>
      url.pathname.endsWith("/bookings")
        ? Response.json(rows, {
          headers: { "content-range": `0-0/${MAX_PLANNING_ROWS + 1}` },
        })
        : undefined,
  });
  await rejects(
    () => loadRecurringPlanningData(client, "org-A"),
    /límite de lectura seguro/,
  );
  equal(calls.length, 1);
});

Deno.test("global page budget bounds a server that supplies one row per page", async () => {
  const bookings = Array.from(
    { length: MAX_PLANNING_PAGES + 1 },
    (_, i) => bookingFixture({ id: `booking-${String(i).padStart(5, "0")}` }),
  );
  const { client, calls } = transport({ bookings }, { cap: 1 });
  await rejects(
    () => loadRecurringPlanningData(client, "org-A"),
    /límite de lectura seguro/,
  );
  equal(calls.length, MAX_PLANNING_PAGES);
});

Deno.test("phase 2 projects both history reads without line items, preserving >500 coverage and quote payloads", async () => {
  const source = bookingFixture({
    quote_id: quoteId(0),
    quotes: {
      organization_id: "org-A",
      line_items: [{
        line_kind: "transport",
        description: "QA source",
        quantity: 1,
        unit_price: 100,
      }],
      rental_meta: [],
    },
  });
  const history = Array.from({ length: 1001 }, (_, i) => ({
    ...invoiceFixture({
      id: `projection-${String(i).padStart(5, "0")}`,
      line_items: [{ description: "QA".repeat(2048) }],
      billing_period_start: i === 1000 ? "2026-07-01" : "2026-06-01",
      billing_period_end: i === 1000 ? "2026-07-31" : "2026-06-30",
      cfdi_status: i === 1000 ? "stamped" : null,
      cancellation_status: i === 1000 ? "pending" : null,
    }),
    organization_id: "org-A",
    booking_id: source.id,
  }));
  const tables = {
    bookings: [source],
    organization_customers: [fiscal],
    invoices: history,
    invoice_bookings: history.map((invoices) => ({
      booking_id: source.id,
      invoice_id: invoices.id,
      invoices,
    })),
  };
  const full = transport(tables, { cap: 200 });
  let rawBytes = 0;
  let projectedBytes = 0;
  const slim = transport(tables, {
    cap: 200,
    respond: ({ url }, rows, count) => {
      const table = url.pathname.split("/").at(-1);
      if (table !== "invoices" && table !== "invoice_bookings") return;
      equal(url.searchParams.get("select")!.includes("line_items"), false);
      const strip = (row: Row) => {
        const copy = { ...row };
        delete copy.line_items;
        return copy;
      };
      const projected = rows.map((row) =>
        table === "invoices"
          ? strip(row)
          : { ...row, invoices: strip(row.invoices as Row) }
      );
      rawBytes += new TextEncoder().encode(JSON.stringify(rows)).length;
      projectedBytes +=
        new TextEncoder().encode(JSON.stringify(projected)).length;
      return Response.json(projected, {
        headers: { "content-range": `0-${rows.length - 1}/${count}` },
      });
    },
  });
  const [fullContexts, slimContexts] = await Promise.all([
    loadRecurringPlanningData(full.client, "org-A"),
    loadRecurringPlanningData(slim.client, "org-A"),
  ]);
  equal(slimContexts[0].invoices.length, 1001);
  equal(slimContexts[0].invoices.every((row) => !("line_items" in row)), true);
  equal(slimContexts[0].booking.quotes, source.quotes);
  equal(
    slim.calls.find(({ url }) => url.pathname.endsWith("/bookings"))!.url
      .searchParams.get("select")!.includes(
        "quotes(organization_id,line_items,rental_meta)",
      ),
    true,
  );
  const options = { includeFuturePeriods: true, futureThroughMonth: "2026-09" };
  const [fullPlan, slimPlan] = await Promise.all([
    planRecurringInvoices(fullContexts, today, options),
    planRecurringInvoices(slimContexts, today, options),
  ]);
  equal(slimPlan, fullPlan);
  equal(slimPlan.lines.map((line) => line.periodStart), [
    "2026-08-01",
    "2026-09-01",
  ]);
  equal(projectedBytes < rawBytes / 5, true);
  console.info(
    `RECURRING_HISTORY_PAYLOAD ${
      JSON.stringify({ rowsPerRoute: 1001, rawBytes, projectedBytes })
    }`,
  );
});

Deno.test("optional diagnostics count actual scoped reads without changing context or failures", async () => {
  const { createRecurringPerformance } = await import("./performance.ts");
  const source = bookingFixture({
    quote_id: quoteId(0),
    quotes: { organization_id: "org-A", line_items: [], rental_meta: [] },
  });
  const tables = { bookings: [source], organization_customers: [fiscal] };
  const plain = transport(tables);
  const observed = transport(tables);
  const snapshots: unknown[] = [];
  const metrics = createRecurringPerformance({
    emit: (snapshot) => snapshots.push(snapshot),
  });
  equal(
    await loadRecurringPlanningData(observed.client, "org-A", metrics),
    await loadRecurringPlanningData(plain.client, "org-A"),
  );
  equal(
    observed.calls.map((call) => call.url.href),
    plain.calls.map((call) => call.url.href),
  );
  metrics.finish("ok");
  equal((snapshots[0] as { counts: unknown }).counts, {
    bookings_rows: 1,
    fiscal_rows: 1,
    history_linked_rows: 0,
    history_direct_rows: 0,
    quote_ids: 1,
    read_pages: 4,
    charge_batches: 1,
  });
  equal(JSON.stringify(snapshots).includes("org-A"), false);
  const failed = transport(tables, {
    respond: ({ url }) =>
      url.pathname.endsWith("/invoices")
        ? Response.json({ message: "QA read failed" }, { status: 500 })
        : undefined,
  });
  await rejects(() =>
    loadRecurringPlanningData(
      failed.client,
      "org-A",
      createRecurringPerformance({ emit: () => {} }),
    )
  );
});
