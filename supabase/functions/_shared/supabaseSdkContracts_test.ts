// SDK real de Edge; todos los transportes son fixtures y no abren conexiones.
import {
  assertEquals,
  assertInstanceOf,
  assertMatch,
  assertStrictEquals,
} from "@std/assert";

const ORIGIN = "https://supabase-sdk-fixture.invalid";
const API_KEY = "fixture-api-key";
const TOKEN = "fixture-session-token";
const ORG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function withoutNetwork<T>(run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  let unexpectedConnections = 0;
  globalThis.fetch = () => {
    unexpectedConnections++;
    throw new Error("El SDK debe usar el transporte inyectado del fixture");
  };
  globalThis.WebSocket = function () {
    unexpectedConnections++;
    throw new Error("Este contrato no permite conexiones Realtime");
  } as unknown as typeof WebSocket;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    assertEquals(unexpectedConnections, 0);
  }
}

// Los guards también cubren cualquier inicialización del módulo.
const { createClient } = await withoutNetwork(() =>
  import("https://esm.sh/@supabase/supabase-js@2.118.0")
);

interface CapturedRequest {
  url: URL;
  headers: Headers;
  method: string;
  body?: BodyInit | null;
  signal?: AbortSignal | null;
}

function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fixture(
  respond: (request: CapturedRequest) => Response | Promise<Response>,
) {
  const requests: CapturedRequest[] = [];
  const transport: typeof fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assertEquals(url.origin, ORIGIN);
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const request = {
      url,
      headers,
      method: init.method ?? (input instanceof Request ? input.method : "GET"),
      body: init.body,
      signal: init.signal,
    };
    requests.push(request);
    return await respond(request);
  };
  const client = createClient(ORIGIN, API_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: transport,
      headers: { Authorization: `Bearer ${TOKEN}` },
    },
  });
  return { client, requests };
}

function assertHeaders(request: CapturedRequest) {
  assertEquals(request.headers.get("apikey"), API_KEY);
  assertEquals(request.headers.get("authorization"), `Bearer ${TOKEN}`);
}

Deno.test("SDK Edge: PostgREST y RPC conservan ámbito, payload y respuestas", () =>
  withoutNetwork(async () => {
    const rows = [{ id: ORG, total: "42.50" }];
    const { client, requests } = fixture(({ url }) =>
      url.pathname.includes("/rpc/")
        ? json({ total: "42.50" })
        : json(rows, 200, { "content-range": "0-0/1" })
    );
    const result = await client.from("invoices")
      .select("id,total", { count: "exact" })
      .eq("organization_id", ORG).in("status", ["draft", "sent"])
      .order("id", { ascending: true }).range(0, 1);
    assertEquals(result.error, null);
    assertEquals(result.data, rows);
    assertEquals(result.count, 1);
    assertEquals(requests[0].method, "GET");
    assertEquals(requests[0].url.pathname, "/rest/v1/invoices");
    for (
      const [key, value] of Object.entries({
        select: "id,total",
        organization_id: `eq.${ORG}`,
        status: "in.(draft,sent)",
        order: "id.asc",
        offset: "0",
        limit: "2",
      })
    ) {
      assertEquals(requests[0].url.searchParams.get(key), value, key);
    }
    const rpc = await client.rpc("preview_invoice_totals", {
      p_invoice_id: ORG,
    });
    assertEquals(rpc.error, null);
    assertEquals(rpc.data, { total: "42.50" });
    assertEquals(requests[1].method, "POST");
    assertEquals(
      requests[1].url.pathname,
      "/rest/v1/rpc/preview_invoice_totals",
    );
    assertEquals(JSON.parse(String(requests[1].body)), { p_invoice_id: ORG });
    assertEquals(requests.length, 2);
    requests.forEach(assertHeaders);
  }));

Deno.test("SDK Edge: errores HTTP y señales abortadas no se reintentan", () =>
  withoutNetwork(async () => {
    const denied = fixture(() =>
      json(
        { message: "fixture denied", code: "42501", details: "fixture" },
        403,
      )
    );
    const failure = await denied.client.from("invoices").select("id");
    assertEquals(failure.status, 403);
    assertEquals(failure.data, null);
    assertEquals(failure.error?.code, "42501");
    assertEquals(denied.requests.length, 1);

    const controller = new AbortController();
    const cancelled = fixture(({ signal }) => {
      assertStrictEquals(signal, controller.signal);
      controller.abort();
      throw new DOMException("fixture cancelled", "AbortError");
    });
    const aborted = await cancelled.client.from("invoices").select("id")
      .abortSignal(controller.signal);
    assertEquals(aborted.data, null);
    assertMatch(aborted.error?.message ?? "", /AbortError.*fixture cancelled/);
    assertEquals(cancelled.requests.length, 1);

    // El contrato de TimeoutError requiere una señal abortada, igual que
    // AbortSignal.timeout(); errores de red sin esa señal sí son reintentables.
    const deadline = new AbortController();
    const timedOut = fixture(({ signal }) => {
      assertStrictEquals(signal, deadline.signal);
      const error = new DOMException("fixture deadline", "TimeoutError");
      deadline.abort(error);
      throw error;
    });
    const expired = await timedOut.client.from("invoices").select("id")
      .abortSignal(deadline.signal);
    assertEquals(expired.data, null);
    assertMatch(expired.error?.message ?? "", /TimeoutError.*fixture deadline/);
    assertEquals(timedOut.requests.length, 1);
  }));

Deno.test("SDK Edge: invoke conserva el content-type propio de Blob y File", () =>
  withoutNetwork(async () => {
    const { client, requests } = fixture(() => json({ accepted: true }));
    const bodies = [
      new Blob(["fixture-image"], { type: "image/png" }),
      new File(["fixture-document"], "fixture.pdf", {
        type: "application/pdf",
      }),
    ];
    for (const body of bodies) {
      const result = await client.functions.invoke("fixture-upload", { body });
      assertEquals(result.error, null);
      assertEquals(result.data, { accepted: true });
      const request = requests.at(-1)!;
      assertEquals(request.method, "POST");
      assertEquals(request.url.pathname, "/functions/v1/fixture-upload");
      assertEquals(request.headers.get("content-type"), body.type);
      assertStrictEquals(request.body, body);
      assertHeaders(request);
    }
    assertEquals(requests.length, 2);
  }));

Deno.test("SDK Edge: upload binario conserva ruta, headers y content-encoding", () =>
  withoutNetwork(async () => {
    const { client, requests } = fixture(() =>
      json({ Id: "fixture-object", Key: "invoice-fixtures/org/line.txt" })
    );
    const body = new Uint8Array([102, 105, 120, 116, 117, 114, 101]);
    const result = await client.storage.from("invoice-fixtures")
      .upload("org/line.txt", body, {
        contentType: "text/plain",
        contentEncoding: "gzip",
        cacheControl: "60",
        upsert: false,
      });
    assertEquals(result.error, null);
    assertEquals(result.data, {
      id: "fixture-object",
      path: "org/line.txt",
      fullPath: "invoice-fixtures/org/line.txt",
    });
    assertEquals(requests.length, 1);
    const request = requests[0];
    assertEquals(request.method, "POST");
    assertEquals(
      request.url.pathname,
      "/storage/v1/object/invoice-fixtures/org/line.txt",
    );
    assertStrictEquals(request.body, body);
    assertHeaders(request);
    assertEquals(request.headers.get("content-type"), "text/plain");
    assertEquals(request.headers.get("content-encoding"), "gzip");
    assertEquals(request.headers.get("cache-control"), "max-age=60");
    assertEquals(request.headers.get("x-upsert"), "false");
  }));

Deno.test("SDK Edge: upload Blob pone metadatos y encoding antes del archivo", () =>
  withoutNetwork(async () => {
    const { client, requests } = fixture(() =>
      json({ Id: "fixture-object", Key: "invoice-fixtures/org/file.gz" })
    );
    const result = await client.storage.from("invoice-fixtures")
      .upload("org/file.gz", new Blob(["fixture-blob"]), {
        cacheControl: "60",
        metadata: { purpose: "fixture" },
        contentEncoding: "gzip",
      });
    assertEquals(result.error, null);
    assertEquals(requests.length, 1);
    const body = requests[0].body;
    assertInstanceOf(body, FormData);
    assertEquals([...body.keys()], [
      "cacheControl",
      "metadata",
      "contentEncoding",
      "",
    ]);
    assertEquals(body.get("cacheControl"), "60");
    assertEquals(JSON.parse(String(body.get("metadata"))), {
      purpose: "fixture",
    });
    assertEquals(body.get("contentEncoding"), "gzip");
    const file = body.get("");
    assertInstanceOf(file, File);
    assertEquals(await file.text(), "fixture-blob");
  }));

Deno.test("SDK Edge: multipart conserva campos existentes y deja los archivos al final", () =>
  withoutNetwork(async () => {
    const { client, requests } = fixture(() =>
      json({ Id: "fixture-object", Key: "invoice-fixtures/org/file.pdf" })
    );
    const input = new FormData();
    input.append(
      "document",
      new File(["fixture-pdf"], "invoice.pdf", {
        type: "application/pdf",
      }),
    );
    input.append("cacheControl", "90");
    input.append("metadata", JSON.stringify({ purpose: "existing" }));
    input.append("contentEncoding", "identity");
    input.append("note", "fixture-note");
    const result = await client.storage.from("invoice-fixtures")
      .upload("org/file.pdf", input, {
        cacheControl: "60",
        metadata: { purpose: "new" },
        contentEncoding: "gzip",
      });
    assertEquals(result.error, null);
    assertEquals(requests.length, 1);
    const body = requests[0].body;
    assertInstanceOf(body, FormData);
    assertEquals([...body.keys()], [
      "cacheControl",
      "metadata",
      "contentEncoding",
      "note",
      "document",
    ]);
    assertEquals(body.get("cacheControl"), "90");
    assertEquals(JSON.parse(String(body.get("metadata"))), {
      purpose: "existing",
    });
    assertEquals(body.get("contentEncoding"), "identity");
    assertEquals(body.get("note"), "fixture-note");
    const file = body.get("document");
    assertInstanceOf(file, File);
    assertEquals(file.name, "invoice.pdf");
    assertEquals(file.type, "application/pdf");
    assertEquals(await file.text(), "fixture-pdf");
    assertEquals(
      [...input.keys()][0],
      "document",
      "No mutar el FormData del caller",
    );
  }));
