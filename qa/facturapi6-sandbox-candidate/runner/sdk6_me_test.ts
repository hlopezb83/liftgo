// Contrato del SDK 6 real (sin red): `organizations.me()` debe pedir
// GET /v2/organizations/me con la llave en Authorization y propagar el
// AbortSignal de la vista aislada. fetch se sustituye por un doble.
import { assert, assertEquals } from "@std/assert";
import { createFacturapiClient } from "../snapshot/supabase/functions/_shared/facturapi/client.ts";

Deno.test("SDK 6 organizations.me usa GET /v2/organizations/me y respeta signal", async () => {
  const realFetch = globalThis.fetch;
  const seen: Array<{ url: string; method: string; hasSignal: boolean }> = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    seen.push({
      url,
      method: (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
      hasSignal: !!init?.signal,
    });
    return Promise.resolve(
      new Response(JSON.stringify({ id: "org_fake", legal: { legal_name: "X", tax_id: "Y" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    const client = createFacturapiClient("sk_test_FAKE_NOT_A_SECRET");
    const orgs = client.organizations;
    const transport = orgs.client;
    const ac = new AbortController();
    const scopedTransport = Object.create(transport);
    scopedTransport.request = (p: string, o: Record<string, unknown> = {}) =>
      transport.request(p, { ...o, signal: ac.signal });
    const scoped = Object.create(orgs);
    scoped.client = scopedTransport;
    const me = await scoped.me();
    assertEquals(me.legal.legal_name, "X");
    assertEquals(seen.length, 1);
    assert(seen[0].url.endsWith("/v2/organizations/me"), seen[0].url);
    assertEquals(seen[0].method, "GET");
    assert(seen[0].hasSignal, "el signal debe llegar a fetch");
  } finally {
    globalThis.fetch = realFetch;
  }
});
