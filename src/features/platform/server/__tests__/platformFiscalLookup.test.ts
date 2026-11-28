import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPlatformFiscalDocument, type FiscalLookupInput } from "../platformFiscalLookup.server";
const input: FiscalLookupInput = { apiKey: "sk_test_ci_only", mode: "test", documentId: "local-document", knownId: "provider-1" };
const valid = { id: "provider-1", external_id: "local-document", livemode: false, status: "valid", cancellation_status: "none",
  uuid: "11111111-1111-4111-8111-111111111111", folio_number: 42, series: "A" };
const fetchMock = vi.fn();
describe("consulta fiscal acotada: no emite documentos ni interpreta incertidumbre como ausencia", () => {
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());
  it("consulta ID conocido con un GET sin redirect ni reintento y sólo devuelve identificadores necesarios", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...valid, apiKey: "private", customer: { tax_id: "private" } }));
    const result = await lookupPlatformFiscalDocument(input);
    expect(result).toEqual({ outcome: "valid", providerId: valid.id, uuid: valid.uuid, cancellation: "none", folio: "42", series: "A" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://www.facturapi.io/v2/invoices/provider-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "manual", cache: "no-store" });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each(["pending", "failed"] as const)("%s sin UUID nunca se considera timbrado ni ausente", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ ...valid, status, uuid: null }));
    expect(await lookupPlatformFiscalDocument(input)).toMatchObject({ outcome: status, providerId: valid.id, uuid: null });
  });
  it.each([202, 301, 302, 401, 404, 429, 503])("HTTP %s es incierto; ID conocido no hace fallback a listado", async (status) => {
    fetchMock.mockResolvedValue(new Response("private body", { status }));
    expect(await lookupPlatformFiscalDocument(input)).toMatchObject({ outcome: "inconclusive" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([{ id: "another" }, { external_id: "another" }, { livemode: true }, { status: "valid", uuid: null },
    { status: "pending" }, { status: "draft" }, { uuid: "invalid" }])("no adopta identidad/estado incompatible: %j", async (patch) => {
    fetchMock.mockResolvedValue(Response.json({ ...valid, ...patch }));
    expect(await lookupPlatformFiscalDocument(input)).toMatchObject({ outcome: "inconclusive" });
  });
  it.each([{ status: "canceled" }, { cancellation_status: "accepted" }])("cancelación confirmada se distingue de timbrado: %j", async (patch) => {
    fetchMock.mockResolvedValue(Response.json({ ...valid, ...patch }));
    expect(await lookupPlatformFiscalDocument(input)).toMatchObject({ outcome: "cancelled", cancellation: "accepted" });
  });
  it("listado exacto, vacío y completo es ausencia observada, sin generar POST", async () => {
    fetchMock.mockResolvedValue(Response.json({ page: 1, total_pages: 0, total_results: 0, data: [] }));
    expect(await lookupPlatformFiscalDocument({ ...input, knownId: null })).toMatchObject({ outcome: "missing" });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("external_id")).toBe(input.documentId);
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("pagination")).toBe("page");
    expect(url.searchParams.get("page")).toBe("1");
  });
  it.each([{ page: 1, total_pages: 2, total_results: 3, data: [valid] }, { data: [] },
    { page: 1, total_pages: 1, total_results: 2, data: [valid, valid] },
    { page: 1, total_pages: 1, total_results: 1, data: [{ ...valid, external_id: "another" }] }])("no considera listo un listado ambiguo: %j", async (page) => {
    fetchMock.mockResolvedValue(Response.json(page));
    expect(await lookupPlatformFiscalDocument({ ...input, knownId: null })).toMatchObject({ outcome: "inconclusive" });
  });
  it("recupera el único resultado exacto en la página completa", async () => {
    fetchMock.mockResolvedValue(Response.json({ page: 1, total_pages: 1, total_results: 1, data: [valid] }));
    expect(await lookupPlatformFiscalDocument({ ...input, knownId: null })).toMatchObject({ outcome: "valid", providerId: valid.id });
  });
  it.each([{ totals_are_capped: true }, { next_cursor: "another-page" }])("no reprograma ante un listado incompleto aunque aparezca vacío: %j", async (patch) => {
    fetchMock.mockResolvedValue(Response.json({ page: 1, total_pages: 0, total_results: 0, data: [], ...patch }));
    expect(await lookupPlatformFiscalDocument({ ...input, knownId: null })).toMatchObject({ outcome: "inconclusive" });
  });
  it.each(["sk_live_ci_only", "sk_user_ci_only", "sk_test_"])("no consulta una llave incompatible %s", async (apiKey) => {
    expect(await lookupPlatformFiscalDocument({ ...input, apiKey })).toMatchObject({ outcome: "inconclusive" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("timeout/transport no consume llamadas adicionales ni devuelve mensajes secretos", async () => {
    fetchMock.mockRejectedValue(new Error("private-key"));
    const result = await lookupPlatformFiscalDocument(input);
    expect(result.outcome).toBe("inconclusive"); expect(JSON.stringify(result)).not.toContain("private");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rechaza cuerpo excesivo sin conservar su contenido", async () => {
    fetchMock.mockResolvedValue(new Response("x".repeat(262145)));
    expect(await lookupPlatformFiscalDocument(input)).toMatchObject({ outcome: "inconclusive" });
  });
});
