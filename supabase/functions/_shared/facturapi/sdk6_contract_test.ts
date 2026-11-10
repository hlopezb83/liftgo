import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  binaryToBytes,
  binaryToText,
  cancelInvoiceWithSignal,
  createFacturapiClient,
  createInvoiceWithSignal,
  describeFacturapiError,
  downloadInvoicePdfWithSignal,
  FacturapiError,
  retrieveInvoiceWithSignal,
  updateInvoiceStatusWithSignal,
} from "./client.ts";

Deno.test("Facturapi 6: timbrado, cancelación y refresh conservan método y AbortSignal", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = ((input: Request | string | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://www.facturapi.io/v2/invoices")) {
      throw new Error(`Unexpected Facturapi request: ${url}`);
    }
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify({ id: "fapi_1", uuid: "uuid_1" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const client = createFacturapiClient("sk_test_contract");
    const controller = new AbortController();
    const signal = controller.signal;
    const payload = {
      external_id: "erp_invoice_1",
      idempotency_key: "erp_invoice_1",
      type: "I",
    };

    await createInvoiceWithSignal(client, payload, { signal });
    await cancelInvoiceWithSignal(client, "fapi_1", { motive: "02" }, {
      signal,
    });
    await retrieveInvoiceWithSignal(client, "fapi_1", { signal });
    await updateInvoiceStatusWithSignal(client, "fapi_1", { signal });

    assertEquals(calls.map((call) => call.init?.method), [
      "POST",
      "DELETE",
      "GET",
      "PUT",
    ]);
    assertEquals(calls.map((call) => new URL(call.url).pathname), [
      "/v2/invoices",
      "/v2/invoices/fapi_1",
      "/v2/invoices/fapi_1",
      "/v2/invoices/fapi_1/status",
    ]);
    assertEquals(calls[0].init?.body, JSON.stringify(payload));
    assertEquals(new URL(calls[1].url).searchParams.get("motive"), "02");
    for (const call of calls) {
      assertStrictEquals(call.init?.signal, signal);
      assertEquals(
        new Headers(call.init?.headers).get("Authorization"),
        "Bearer sk_test_contract",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Facturapi 6: búsqueda admite página sin conteos", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = ((input: Request | string | URL) => {
    requestedUrl = String(input);
    return Promise.resolve(
      new Response(JSON.stringify({ data: [], page: 0 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const client = createFacturapiClient("sk_test_contract");
    const result = await client.invoices.list({
      external_id: "erp_invoice_1",
      limit: 5,
    });
    assertEquals(result.data, []);
    assertEquals(result.page, 0);
    assertEquals(
      new URL(requestedUrl).searchParams.get("external_id"),
      "erp_invoice_1",
    );
    assertEquals(new URL(requestedUrl).searchParams.get("limit"), "5");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Facturapi 6: conserva código, status y logId del error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          message: "Límite excedido",
          code: "rate_limit_exceeded",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "3",
            "X-Facturapi-Log-Id": "log-contract",
          },
        },
      ),
    )) as typeof fetch;

  try {
    const client = createFacturapiClient("sk_test_contract");
    const error = await assertRejects(() => client.invoices.retrieve("fapi_1"));
    assertEquals(error instanceof FacturapiError, true);
    assertEquals(
      (error as { headers: Record<string, string> }).headers["retry-after"],
      "3",
    );
    const described = describeFacturapiError(error);
    assertEquals(described.status, 429);
    assertEquals(described.code, "rate_limit_exceeded");
    assertEquals(JSON.parse(described.detail).logId, "log-contract");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Facturapi 6: conserva fechas SDK sin convertir sellos SAT ni fechas de calendario", async () => {
  const originalFetch = globalThis.fetch;
  const timestamp = "2026-11-10T02:30:00.000Z";
  const satStamp = "2026-11-09T20:30:00";
  const calendarDate = "2026-11-01";
  const response = {
    id: "fapi_dates",
    status: "valid",
    created_at: timestamp,
    date: timestamp,
    canceled_at: null,
    cancellation: { requested_at: timestamp, last_checked: timestamp },
    stamp: { date: satStamp },
    complements: [
      { type: "pago", data: [{ date: timestamp }] },
      { type: "nomina", data: { fecha_pago: calendarDate } },
    ],
  };
  globalThis.fetch =
    (() => Promise.resolve(Response.json(response))) as typeof fetch;
  try {
    const client = createFacturapiClient("sk_test_contract");
    const signal = new AbortController().signal;
    const results = [
      await createInvoiceWithSignal(client, { type: "I" }, { signal }),
      await retrieveInvoiceWithSignal(client, "fapi_dates", { signal }),
      await cancelInvoiceWithSignal(client, "fapi_dates", { motive: "02" }, {
        signal,
      }),
      await updateInvoiceStatusWithSignal(client, "fapi_dates", { signal }),
      await client.invoices.retrieve("fapi_dates"),
    ];
    for (const result of results) {
      const invoice = result as
        & Omit<
          typeof response,
          "created_at" | "date" | "cancellation" | "complements"
        >
        & {
          created_at: Date;
          date: Date;
          cancellation: { requested_at: Date; last_checked: Date };
          complements: Array<{ type: string; data: unknown }>;
        };
      assertEquals(invoice.created_at, new Date(timestamp));
      assertEquals(invoice.date, new Date(timestamp));
      assertEquals(invoice.cancellation.requested_at, new Date(timestamp));
      assertEquals(invoice.cancellation.last_checked, new Date(timestamp));
      assertEquals(invoice.canceled_at, null);
      assertEquals(invoice.stamp.date, satStamp);
      assertEquals(invoice.complements[0].data, [{
        date: new Date(timestamp),
      }]);
      assertEquals(invoice.complements[1].data, { fecha_pago: calendarDate });
      assertEquals(JSON.parse(JSON.stringify(invoice)), response);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Facturapi 6: abort real para POST, DELETE, GET y PUT sin reintentos", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((_input: Request | string | URL, init?: RequestInit) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    });
  }) as typeof fetch;
  try {
    const client = createFacturapiClient("sk_test_contract");
    const operations = [
      (signal: AbortSignal) =>
        createInvoiceWithSignal(client, { type: "I" }, { signal }),
      (signal: AbortSignal) =>
        cancelInvoiceWithSignal(client, "invoice", { motive: "02" }, {
          signal,
        }),
      (signal: AbortSignal) =>
        retrieveInvoiceWithSignal(client, "invoice", { signal }),
      (signal: AbortSignal) =>
        updateInvoiceStatusWithSignal(client, "invoice", { signal }),
    ];
    for (const operation of operations) {
      const controller = new AbortController();
      const pending = operation(controller.signal);
      controller.abort();
      const error = await assertRejects(() => pending, DOMException);
      assertEquals(error.name, "AbortError");
    }
    assertEquals(calls, 4);
    const controller = new AbortController();
    controller.abort();
    await assertRejects(() =>
      createInvoiceWithSignal(client, {}, { signal: controller.signal })
    );
    assertEquals(calls, 4, "a pre-aborted fiscal write must never be sent");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Facturapi 6: señales concurrentes aisladas y cliente original intacto", async () => {
  const originalFetch = globalThis.fetch;
  const signals: Array<AbortSignal | null | undefined> = [];
  const urls: string[] = [];
  const release: Array<() => void> = [];
  globalThis.fetch = ((input: Request | string | URL, init?: RequestInit) => {
    signals.push(init?.signal);
    urls.push(String(input));
    return new Promise<Response>((resolve) =>
      release.push(() => resolve(Response.json({ id: "test" })))
    );
  }) as typeof fetch;
  try {
    const client = createFacturapiClient("sk_test_contract");
    const originalTransport = client.invoices.client;
    const originalRequest = originalTransport.request;
    const first = new AbortController().signal;
    const second = new AbortController().signal;
    const pending = [
      retrieveInvoiceWithSignal(client, "invoice/one?bad=1", { signal: first }),
      retrieveInvoiceWithSignal(client, "invoice-two", { signal: second }),
      client.invoices.retrieve("invoice-three"),
    ];
    assertStrictEquals(signals[0], first);
    assertStrictEquals(signals[1], second);
    assertEquals(signals[2], undefined);
    assertEquals(
      new URL(urls[0]).pathname,
      "/v2/invoices/invoice%2Fone%3Fbad%3D1",
    );
    assertEquals(new URL(urls[0]).search, "");
    assertStrictEquals(client.invoices.client, originalTransport);
    assertStrictEquals(client.invoices.client.request, originalRequest);
    for (const finish of release) finish();
    await Promise.all(pending);
  } finally {
    for (const finish of release) finish();
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Facturapi 6: no degrada escrituras a transporte sin abort", async () => {
  let calls = 0;
  const client = {
    invoices: {
      create: () => {
        calls++;
        return Promise.resolve({ id: "unexpected" });
      },
    },
  };
  await assertRejects(
    () =>
      createInvoiceWithSignal(client, {}, {
        signal: new AbortController().signal,
      }),
    Error,
    "Facturapi transport does not support AbortSignal",
  );
  assertEquals(calls, 0);
});

Deno.test("Facturapi 6: descargas PDF y XML conservan bytes y serialización", async () => {
  const originalFetch = globalThis.fetch;
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 128, 255]);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Nombre="Prueba México"/>';
  const signal = new AbortController().signal;
  globalThis.fetch = ((input: Request | string | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/pdf")) {
      assertStrictEquals(init?.signal, signal);
      return Promise.resolve(
        new Response(pdf, { headers: { "Content-Type": "application/pdf" } }),
      );
    }
    if (path.endsWith("/xml")) {
      return Promise.resolve(
        new Response(xml, { headers: { "Content-Type": "application/xml" } }),
      );
    }
    throw new Error(`Unexpected download path: ${path}`);
  }) as typeof fetch;
  try {
    const client = createFacturapiClient("sk_test_contract");
    assertEquals(
      await binaryToBytes(
        await downloadInvoicePdfWithSignal(client, "invoice", { signal }),
      ),
      pdf,
    );
    assertEquals(
      await binaryToText(await client.invoices.downloadXml("invoice")),
      xml,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
