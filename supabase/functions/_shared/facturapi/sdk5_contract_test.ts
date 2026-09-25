import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cancelInvoiceWithSignal,
  createFacturapiClient,
  createInvoiceWithSignal,
  describeFacturapiError,
  FacturapiError,
  updateInvoiceStatusWithSignal,
} from "./client.ts";

Deno.test("Facturapi 5: timbrado, cancelación y refresh conservan método y AbortSignal", async () => {
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
    await updateInvoiceStatusWithSignal(client, "fapi_1", { signal });

    assertEquals(calls.map((call) => call.init?.method), [
      "POST",
      "DELETE",
      "PUT",
    ]);
    assertEquals(calls.map((call) => new URL(call.url).pathname), [
      "/v2/invoices",
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

Deno.test("Facturapi 5: búsqueda admite página sin conteos", async () => {
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

Deno.test("Facturapi 5: conserva código, status y logId del error", async () => {
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
