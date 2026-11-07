import { beforeEach, describe, expect, it, vi } from "vitest";

interface QuoteFixture { id: string; quote_number: string; customer_name: string | null; created_at?: string }
const state = vi.hoisted(() => ({
  fetch: vi.fn(), requests: [] as URL[], failOthers: false,
  failQuotes: "" as "" | "exact" | "broad" | "both", rejectBroad: false,
  exact: [] as QuoteFixture[], broad: [] as QuoteFixture[],
}));
vi.mock("@/features/users", () => ({ useHasFinancialAccess: vi.fn(), useHasModuleAccess: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "test-offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});
import { searchEntities } from "../useEntitySearch";
import { settleSearch } from "../searchQuotes";
import { normalizeQuoteNumber, quoteSearchPattern, quoteSearchFilter } from "../../lib/quoteSearchTerm";

const oldExact = { id: "old", quote_number: "COT-0445", customer_name: "Cliente antiguo", created_at: "2020-01-01" };
const recent = Array.from({ length: 6 }, (_, index) => ({
  id: `recent-${index}`, quote_number: `COT-1445${index}`, customer_name: "Cliente 445", created_at: `2026-01-0${index + 1}`,
}));

beforeEach(() => {
  state.requests = []; state.failOthers = false; state.failQuotes = ""; state.rejectBroad = false;
  state.exact = [oldExact]; state.broad = [...recent]; state.fetch.mockReset();
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    state.requests.push(url);
    const isQuote = url.pathname.endsWith("/quotes");
    const exact = url.searchParams.has("quote_number");
    if (isQuote && !exact && state.rejectBroad) throw new DOMException("Network rejected", "AbortError");
    if (isQuote ? state.failQuotes === "both" || state.failQuotes === (exact ? "exact" : "broad") : state.failOthers) {
      return new Response(JSON.stringify({ message: "private database error", code: "42501" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    // A deterministic simulated server honors the builder's ordering + limit.
    let rows = isQuote ? [...(exact ? state.exact : state.broad)] : [];
    if (url.searchParams.get("order") === "created_at.desc,id.desc") {
      rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id.localeCompare(a.id));
    }
    rows = rows.slice(0, Number(url.searchParams.get("limit") ?? rows.length));
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
  });
});

function quoteRequests() { return state.requests.filter((url) => url.pathname.endsWith("/quotes")); }

describe("cotizaciones — PostgREST real con transporte HTTP simulado", () => {
  it.each(["445", "0445", "COT-0445", "cot-445", "000445"])("normaliza %s y mantiene exacta antigua antes de cinco candidatas nuevas", async (query) => {
    const result = await searchEntities(query, "org-a", false, true);
    expect(result.quotes.map((hit) => hit.id)).toEqual(["old", "recent-5", "recent-4", "recent-3", "recent-2"]);
    expect(result.quotes[0]).toEqual({ id: "old", label: "COT-0445", sub: "Cliente antiguo", url: "/quotes/old" });
    const requests = quoteRequests();
    expect(requests).toHaveLength(2);
    const exact = requests.find((url) => url.searchParams.has("quote_number"))!;
    expect(exact.searchParams.get("quote_number")).toBe("eq.COT-0445");
    for (const url of requests) {
      expect(url.searchParams.get("select")).toBe("id,quote_number,customer_name");
      expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
      expect(url.searchParams.get("order")).toBe("created_at.desc,id.desc");
      expect(url.searchParams.get("limit")).toBe("5");
      expect(url.searchParams.getAll("or")).toContain("(is_e2e.is.null,is_e2e.eq.false)");
    }
    const broad = requests.find((url) => !url.searchParams.has("quote_number"))!;
    expect(broad.searchParams.getAll("or")).toEqual([
      "(is_e2e.is.null,is_e2e.eq.false)",
      `(quote_number.ilike.${quoteSearchPattern(query)},customer_name.ilike.${quoteSearchPattern(query)})`,
    ]);
  });

  it("deduplica por ID, conserva exacta primero y limita el conjunto a cinco", async () => {
    state.broad = [oldExact, { ...oldExact, customer_name: "Duplicado" }, ...recent.slice(0, 3)];
    const result = await searchEntities("445", "org-a", true, true);
    expect(result.quotes).toHaveLength(4);
    expect(result.quotes.filter((hit) => hit.id === "old")).toEqual([expect.objectContaining({ sub: "Cliente antiguo" })]);
  });

  it("sin folio exacto devuelve las cinco más recientes con desempate por ID", async () => {
    state.exact = []; state.broad[4].created_at = state.broad[5].created_at;
    const result = await searchEntities("Cliente", "org-b", true, true);
    expect(quoteRequests()).toHaveLength(1);
    expect(quoteRequests()[0].searchParams.get("organization_id")).toBe("eq.org-b");
    expect(result.quotes.map((hit) => hit.id)).toEqual(["recent-5", "recent-4", "recent-3", "recent-2", "recent-1"]);
  });

  it("escapa comodines y la gramática lógica sin perder el filtro E2E ni el tenant", async () => {
    const query = 'ACME, ("50%_\\")';
    await searchEntities(query, "org-a", false, true);
    const [url] = quoteRequests();
    expect(url.searchParams.get("quote_number")).toBeNull();
    // Unquote the PostgREST string to inspect the literal SQL LIKE pattern.
    const pattern = quoteSearchPattern(query);
    const unquoted = pattern.slice(1, -1).replace(/\\([\\"])/g, "$1");
    expect(unquoted).toBe('%ACME, ("50\\%\\_\\\\")%');
    expect(url.searchParams.getAll("or")).toEqual([
      "(is_e2e.is.null,is_e2e.eq.false)",
      `(quote_number.ilike.${pattern},customer_name.ilike.${pattern})`,
    ]);
    expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
  });

  it("busca estrellas literales sin el alias LIKE de PostgREST ni expresiones regulares activas", async () => {
    const query = 'ACME*(x|y).[a]+?^${}50%_\\"';
    await searchEntities(query, "org-a", false, true);
    const [url] = quoteRequests();
    expect(url.searchParams.getAll("or")).toEqual([
      "(is_e2e.is.null,is_e2e.eq.false)", `(${quoteSearchFilter(query)})`,
    ]);
    const filter = quoteSearchFilter(query);
    expect(filter).toContain("quote_number.imatch.");
    const quoted = filter.slice("quote_number.imatch.".length, filter.indexOf(",customer_name.imatch."));
    const literalRegex = quoted.slice(1, -1).replace(/\\([\\"])/g, "$1");
    expect(new RegExp(literalRegex, "i").test(`prefix ${query} suffix`)).toBe(true);
    expect(new RegExp(literalRegex, "i").test(query.replace("*", "%"))).toBe(false);
    expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
  });

  it("no consulta quotes por defecto ni cuando no está autorizado", async () => {
    await searchEntities("445", "org-a");
    await searchEntities("445", "org-a", true, false);
    expect(quoteRequests()).toHaveLength(0);
  });

  it("no consulta sin organización verificada", async () => {
    expect((await searchEntities("445", undefined, true, true)).quotes).toEqual([]);
    expect(state.requests).toHaveLength(0);
  });

  it.each(["exact", "broad"] as const)("conserva éxito con error parcial de consulta %s", async (failed) => {
    state.failQuotes = failed; state.failOthers = true;
    const result = await searchEntities("445", "org-a", false, true);
    expect(result.quotes).toHaveLength(failed === "broad" ? 1 : 5);
    expect(result.errors?.quotes).toBeTruthy();
    expect(result.errors?.quotes).not.toContain("private database error");
  });

  it("conserva exacta y avisa también si el transporte de la amplia rechaza", async () => {
    state.rejectBroad = true;
    const result = await searchEntities("445", "org-a", false, true);
    expect(result.quotes.map((hit) => hit.id)).toEqual(["old"]);
    expect(result.errors?.quotes).toBeTruthy();
  });

  it("conserva semántica parcial ante una promesa rechazada fuera del builder", async () => {
    const result = await settleSearch(Promise.reject(new Error("private transport detail")));
    expect(result).toEqual({ data: null, error: { message: "No se pudo completar la búsqueda." } });
  });

  it("un éxito vacío cuenta como éxito, no como error total", async () => {
    state.failQuotes = "broad"; state.failOthers = true; state.exact = [];
    const result = await searchEntities("445", "org-a", false, true);
    expect(result.quotes).toEqual([]);
    expect(result.errors?.quotes).toBeTruthy();
  });

  it.each([true, false])("error total sólo cuando fallan todas las consultas efectivas (finanzas=%s)", async (financial) => {
    state.failQuotes = "both"; state.failOthers = true;
    await expect(searchEntities("445", "org-a", financial, true)).rejects.toMatchObject({ message: "private database error" });
  });

  it("fallo de ambas consultas quotes conserva las demás secciones", async () => {
    state.failQuotes = "both";
    const result = await searchEntities("445", "org-a", false, true);
    expect(result.errors).toEqual({ quotes: expect.any(String) });
    expect(result.quotes).toEqual([]);
  });
});

describe("normalización estricta sin pérdida de precisión", () => {
  it.each(["COT 445", "COT-44a5", "445 cliente", "-445", "4.45", "COT-", "ACME,445"])("no normaliza %s", (input) => {
    expect(normalizeQuoteNumber(input)).toBeUndefined();
  });
  it("admite espacios externos, cero y folios mayores que Number.MAX_SAFE_INTEGER", () => {
    expect(normalizeQuoteNumber(" cot-000445 ")).toBe("COT-0445");
    expect(normalizeQuoteNumber("0000")).toBe("COT-0000");
    expect(normalizeQuoteNumber("00090071992547409934567")).toBe("COT-90071992547409934567");
  });
});
