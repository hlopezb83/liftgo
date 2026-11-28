export interface FiscalLookupInput { apiKey: string; mode: "test" | "live"; documentId: string; knownId: string | null }
export interface FiscalLookupResult { outcome: "valid" | "pending" | "failed" | "cancelled" | "missing" | "inconclusive";
  providerId: string | null; uuid: string | null; cancellation: "none" | "pending" | "accepted" | "rejected" | "expired" | null;
  folio: string | null; series: string | null }
const unknownResult: FiscalLookupResult = { outcome: "inconclusive", providerId: null, uuid: null, cancellation: null, folio: null, series: null };
const providerId = /^[a-zA-Z0-9_-]{1,128}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

function identityMatches(invoice: Record<string, unknown>, input: FiscalLookupInput) {
  return typeof invoice.id === "string" && providerId.test(invoice.id) && invoice.livemode === (input.mode === "live")
    && (!input.knownId || invoice.id === input.knownId)
    && (input.knownId ? !invoice.external_id || invoice.external_id === input.documentId : invoice.external_id === input.documentId);
}
function invoiceFacts(invoice: Record<string, unknown>) {
  const cancellation = ["none", "pending", "accepted", "rejected", "expired"].includes(String(invoice.cancellation_status))
    ? invoice.cancellation_status as FiscalLookupResult["cancellation"] : null;
  const uuid = typeof invoice.uuid === "string" && uuidPattern.test(invoice.uuid) ? invoice.uuid : null;
  const folio = Number.isSafeInteger(invoice.folio_number) && Number(invoice.folio_number) > 0 ? String(invoice.folio_number) : null;
  const series = typeof invoice.series === "string" && invoice.series.length <= 25 ? invoice.series : null;
  return { cancellation, uuid, folio, series };
}
function cancelledInvoice(invoice: Record<string, unknown>, cancellation: FiscalLookupResult["cancellation"]) {
  return invoice.status === "canceled" || invoice.status === "cancelled" || (invoice.status === "valid" && cancellation === "accepted");
}
function classifyInvoice(value: unknown, input: FiscalLookupInput): FiscalLookupResult {
  const invoice = record(value);
  if (!invoice || !identityMatches(invoice, input)) return unknownResult;
  if (typeof invoice.id !== "string") return unknownResult;
  const { cancellation, uuid, folio, series } = invoiceFacts(invoice);
  if (invoice.status === "pending" || invoice.status === "failed") {
    if (invoice.uuid) return unknownResult;
    return { outcome: invoice.status, providerId: invoice.id, uuid: null, cancellation, folio, series };
  }
  if (!uuid || !folio) return unknownResult;
  if (cancelledInvoice(invoice, cancellation)) {
    return { outcome: "cancelled", providerId: invoice.id, uuid, cancellation: "accepted", folio, series };
  }
  return invoice.status === "valid" ? { outcome: "valid", providerId: invoice.id, uuid, cancellation, folio, series } : unknownResult;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Empty body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 262144) throw new Error("Response limit");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** One bounded GET. No create/cancel, no retries, no redirect, no key or provider body in logs. */
function inputValid(input: FiscalLookupInput) {
  return input.apiKey.startsWith(input.mode === "test" ? "sk_test_" : "sk_live_") && input.apiKey.length > 8
    && (!input.knownId || providerId.test(input.knownId));
}
function lookupResponse(body: unknown, input: FiscalLookupInput) {
  if (input.knownId) return classifyInvoice(body, input);
  const page = record(body);
  if (!page || !Array.isArray(page.data) || page.page !== 1 || !Number.isInteger(page.total_pages)
    || page.totals_are_capped === true || (page.next_cursor !== undefined && page.next_cursor !== null)
    || Number(page.total_pages) > 1 || Number(page.total_pages) < 0 || page.total_results !== page.data.length) return unknownResult;
  if (page.data.length === 0) return { ...unknownResult, outcome: "missing" as const };
  return page.data.length === 1 ? classifyInvoice(page.data[0], input) : unknownResult;
}
export async function lookupPlatformFiscalDocument(input: FiscalLookupInput): Promise<FiscalLookupResult> {
  if (!inputValid(input)) return unknownResult;
  const url = new URL("https://www.facturapi.io/v2/invoices" + (input.knownId ? `/${encodeURIComponent(input.knownId)}` : ""));
  if (!input.knownId) {
    url.searchParams.set("external_id", input.documentId); url.searchParams.set("limit", "2");
    url.searchParams.set("pagination", "page"); url.searchParams.set("page", "1");
  }
  try {
    const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000), redirect: "manual", cache: "no-store" });
    if (response.status !== 200) { await response.body?.cancel(); return unknownResult; }
    return lookupResponse(await boundedJson(response), input);
  } catch { return unknownResult; }
}
