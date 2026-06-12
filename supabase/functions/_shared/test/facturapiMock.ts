// Test helper: mock fetch ONLY for Facturapi URLs. Other URLs throw to surface
// accidental network access during tests.
export type FacturapiHandler = (req: Request) => Response | Promise<Response>;

export interface FacturapiMockState {
  calls: Array<{ url: string; method: string; body: string | null }>;
  restore: () => void;
}

const FACTURAPI_PREFIX = "https://www.facturapi.io/v2";

export function installFacturapiMock(
  handlers: Record<string, FacturapiHandler>,
): FacturapiMockState {
  const original = globalThis.fetch;
  const state: FacturapiMockState = {
    calls: [],
    restore: () => { globalThis.fetch = original; },
  };

  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
    if (!url.startsWith(FACTURAPI_PREFIX)) {
      throw new Error(`Unexpected fetch call to ${url} (facturapi mock active)`);
    }
    const req = input instanceof Request ? input : new Request(url, init);
    const body = init?.body ? String(init.body) : null;
    state.calls.push({ url, method: req.method, body });

    // Match longest path key first.
    const path = url.slice(FACTURAPI_PREFIX.length);
    const keys = Object.keys(handlers).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (path.startsWith(k)) return await handlers[k](req);
    }
    throw new Error(`No facturapi mock handler for ${path}`);
  }) as typeof fetch;

  return state;
}

export function facturapiOk(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function facturapiBadRequest(message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function facturapiServerError(): Response {
  return new Response("Internal Error", { status: 500 });
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

export function pdfResponse(bytes: Uint8Array): Response {
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "application/pdf" },
  });
}
