// Sonda de paridad: corre las mismas operaciones contra la capa 5.2 o 6.0
// con fetch simulado (sin red). Imprime JSON con peticiones y resultados normalizados.
const ver = Deno.args[0]; // "52" | "60"
const m = await import(`./fns${ver}/_shared/facturapi/client.ts`);

type Rec = { method: string; path: string; query: string; body: unknown; hasSignal: boolean; auth: boolean };
const calls: Rec[] = [];
let nextStatus = 200;
let nextBody: unknown = {};
let nextBinary: Uint8Array | null = null;

globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url);
  let body: unknown = null;
  const txt = req.method === "GET" || req.method === "DELETE" ? "" : await req.clone().text();
  if (txt) { try { body = JSON.parse(txt); } catch { body = txt; } }
  const qs = [...u.searchParams.entries()].sort().map(([k, v]) => `${k}=${v}`).join("&");
  calls.push({
    method: req.method,
    path: u.pathname.replace(/^\/v\d+/, ""),
    query: qs,
    body,
    hasSignal: !!(init?.signal ?? (input instanceof Request ? input.signal : undefined)),
    auth: !!req.headers.get("authorization"),
  });
  if (nextBinary) {
    return new Response(nextBinary, { status: nextStatus, headers: { "content-type": "application/pdf" } });
  }
  return new Response(JSON.stringify(nextBody), { status: nextStatus, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const client = m.createFacturapiClient("sk_test_FAKE_PARITY_ONLY");
const ac = new AbortController();
const out: Record<string, unknown> = {};

async function run(name: string, fn: () => Promise<unknown>, status = 200, body: unknown = {}, bin: Uint8Array | null = null) {
  calls.length = 0; nextStatus = status; nextBody = body; nextBinary = bin;
  let result: unknown, error: unknown = null;
  try { result = await fn(); } catch (e) { error = m.describeFacturapiError(e); }
  if (result instanceof Uint8Array) result = { bytes: [...result] };
  else if (result && typeof result === "object" && !(Array.isArray(result))) {
    try { result = JSON.parse(JSON.stringify(result)); } catch { result = String(result); }
  }
  out[name] = { calls: calls.map((c) => ({ ...c })), result: result ?? null, error };
}

const inv = { id: "inv_FAKE1", uuid: "00000000-0000-4000-8000-000000000001", status: "valid", total: 116, folio_number: 1, series: "A", date: "2026-11-10T14:00:00.000Z" };
const payload = { customer: { legal_name: "CLIENTE FICTICIO", tax_id: "XAXX010101000", tax_system: "616", address: { zip: "01000" } }, items: [{ quantity: 1, product: { description: "Servicio ficticio", product_key: "78101800", price: 100 } }], payment_form: "03", use: "S01" };

await run("create_invoice", () => m.createInvoiceWithSignal(client, payload, { signal: ac.signal }), 200, inv);
await run("create_credit_note", () => m.createInvoiceWithSignal(client, { ...payload, type: "E", related_documents: [{ relationship: "01", documents: [inv.uuid] }] }, { signal: ac.signal }), 200, { ...inv, id: "inv_FAKE_NC" });
await run("create_payment_rep", () => m.createInvoiceWithSignal(client, { type: "P", customer: payload.customer, complements: [{ type: "pago", data: [{ payment_form: "03", related_documents: [{ uuid: inv.uuid, amount: 116, installment: 1, last_balance: 116 }] }] }] }, { signal: ac.signal }), 200, { ...inv, id: "inv_FAKE_REP" });
await run("cancel_invoice", () => m.cancelInvoiceWithSignal(client, "inv_FAKE1", { motive: "02" }, { signal: ac.signal }), 200, { ...inv, status: "canceled", cancellation_status: "accepted" });
await run("cancel_with_substitute", () => m.cancelInvoiceWithSignal(client, "inv_FAKE1", { motive: "01", substitution: "inv_FAKE2" }, { signal: ac.signal }), 200, { ...inv, cancellation_status: "pending" });
await run("retrieve_invoice", () => m.retrieveInvoiceWithSignal(client, "inv_FAKE1", { signal: ac.signal }), 200, inv);
await run("refresh_status", () => m.updateInvoiceStatusWithSignal(client, "inv_FAKE1", { signal: ac.signal }), 200, { ...inv, cancellation_status: "accepted" });
await run("download_pdf_sdk", async () => m.binaryToBytes(await client.invoices.downloadPdf("inv_FAKE1")), 200, null, new Uint8Array([37, 80, 68, 70]));
await run("download_xml_sdk", async () => m.binaryToText(await client.invoices.downloadXml("inv_FAKE1")), 200, null, new TextEncoder().encode("<cfdi/>"));
await run("error_400", () => m.createInvoiceWithSignal(client, payload, { signal: ac.signal }), 400, { message: "RFC inválido (ficticio)", code: "invalid_tax_id" });
await run("error_500", () => m.retrieveInvoiceWithSignal(client, "inv_FAKE1", { signal: ac.signal }), 500, { message: "Falla ficticia" });
await run("error_404", () => m.retrieveInvoiceWithSignal(client, "inv_NOPE", { signal: ac.signal }), 404, { message: "No encontrado" });
await run("retry_5xx_then_ok", async () => {
  let n = 0;
  return await m.retryOnFacturapi5xx(async () => { n++; if (n === 1) { const e: any = new Error("x"); e.status = 503; throw e; } return { n }; }, { delaysMs: [0], attempts: 2 } as any);
});

console.log(JSON.stringify(out));
