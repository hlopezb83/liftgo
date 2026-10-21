/**
 * Marca global en documentos: A y B deben obtener EXACTAMENTE el mismo logo
 * (asset local de LiftGo) en cada tipo de documento, y `company_settings
 * .logo_url` no debe influir en nada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_BRAND_LOCKUP_PATH } from "@/lib/branding/globalBrandLogo";

const getIssuerBranding = vi.fn();

vi.mock("@/lib/issuerBranding.functions", () => ({
  getIssuerBranding: (...args: unknown[]) => getIssuerBranding(...args),
}));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const requested: string[] = [];

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
      return {
        ok: true,
        blob: async () => new Blob(["png-bytes"], { type: "image/png" }),
      } as unknown as Response;
    }),
  );
}

function brandingFor(organizationId: string) {
  return {
    result: {
      status: "ready",
      branding: {
        organizationId,
        razon_social: `Empresa ${organizationId === ORG_A ? "A" : "B"}`,
        rfc: organizationId === ORG_A ? "AAA010101AAA" : "BBB010101BBB",
        regimen_fiscal: "601",
        lugar_expedicion: "64000",
        facturapi_mode: "test",
      },
    },
    errorCode: null,
  };
}

const DOCUMENTS = [
  { type: "quote", id: "q1" },
  { type: "booking", id: "b1" },
  { type: "contract", id: "c1" },
  { type: "invoice", id: "i1" },
  { type: "customer", id: "cu1" },
] as const;

describe("logo global en documentos", () => {
  beforeEach(async () => {
    requested.length = 0;
    getIssuerBranding.mockReset();
    mockFetch();
    const { resetGlobalBrandLogoCache } = await import("../logo");
    resetGlobalBrandLogoCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("usa siempre el asset local, nunca una URL remota", async () => {
    const { loadGlobalBrandLogo } = await import("../logo");
    const result = await loadGlobalBrandLogo();
    expect(result).toBeTruthy();
    expect(requested).toEqual([GLOBAL_BRAND_LOCKUP_PATH]);
    expect(requested.every((u) => !/^https?:/i.test(u))).toBe(true);
  });

  it("A y B obtienen el mismo logo en cada tipo de documento", async () => {
    const { fetchCompanyDataAndLogo } = await import("@/lib/pdf/shared");
    const logos: (string | null)[] = [];

    for (const org of [ORG_A, ORG_B]) {
      for (const doc of DOCUMENTS) {
        getIssuerBranding.mockResolvedValueOnce(brandingFor(org));
        const { company, logoBase64 } = await fetchCompanyDataAndLogo(doc);
        // Los datos fiscales sí son propios de cada organización.
        expect(company.rfc).toBe(
          org === ORG_A ? "AAA010101AAA" : "BBB010101BBB",
        );
        logos.push(logoBase64);
      }
    }

    expect(new Set(logos).size).toBe(1);
    expect(logos[0]).toBeTruthy();
  }, 30000);

  it("ignora cualquier `logo_url` que venga en la configuración", async () => {
    const { fetchCompanyDataAndLogo } = await import("@/lib/pdf/shared");

    const payload = brandingFor(ORG_A);
    (payload.result.branding as Record<string, unknown>)["logo_url"] =
      "https://host-ajeno.example/logo.png";
    getIssuerBranding.mockResolvedValueOnce(payload);

    const { company, logoBase64 } = await fetchCompanyDataAndLogo({
      type: "invoice",
      id: "i1",
    });

    expect(logoBase64).toBeTruthy();
    expect(company).not.toHaveProperty("logo_url");
    // Nunca se descarga el host ajeno: sólo el asset local.
    expect(requested).toEqual([GLOBAL_BRAND_LOCKUP_PATH]);
  });
});

describe("optional logo deadline and recovery", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { resetGlobalBrandLogoCache } = await import("../logo");
    resetGlobalBrandLogoCache(); getIssuerBranding.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("data-only exports do not fetch or wait for an optional logo", async () => {
    const fetch = vi.fn(() => new Promise(() => undefined)); vi.stubGlobal("fetch", fetch);
    getIssuerBranding.mockResolvedValue(brandingFor(ORG_A));
    const { fetchCompanyData } = await import("@/lib/pdf/shared");
    expect((await fetchCompanyData()).company.rfc).toBe("AAA010101AAA");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["fetch", "body"])("bounds a pending %s, aborts and retries independently", async (stage) => {
    const pending = new Promise(() => undefined);
    const fetch = vi.fn().mockImplementation(() => stage === "fetch" ? pending : Promise.resolve({ ok: true, blob: () => pending }));
    vi.stubGlobal("fetch", fetch);
    const { loadGlobalBrandLogo, BRAND_LOGO_TIMEOUT_MS } = await import("../logo");
    const first = loadGlobalBrandLogo();
    await vi.advanceTimersByTimeAsync(BRAND_LOGO_TIMEOUT_MS);
    expect(await first).toBeNull(); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    fetch.mockResolvedValueOnce({ ok: false });
    expect(await loadGlobalBrandLogo()).toBeNull(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("caller cancellation releases immediately and cannot poison another attempt", async () => {
    const fetch = vi.fn().mockImplementation(() => new Promise(() => undefined)); vi.stubGlobal("fetch", fetch);
    const { loadGlobalBrandLogo } = await import("../logo");
    const abort = new AbortController(); const first = loadGlobalBrandLogo(abort.signal);
    abort.abort(); expect(await first).toBeNull();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    fetch.mockResolvedValueOnce({ ok: false }); expect(await loadGlobalBrandLogo()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("bounds a stalled FileReader", async () => {
    const readerAbort = vi.fn();
    vi.stubGlobal("FileReader", class { abort = readerAbort; readAsDataURL() {} });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["png"]) }));
    const { loadGlobalBrandLogo, BRAND_LOGO_TIMEOUT_MS } = await import("../logo");
    const work = loadGlobalBrandLogo(); await vi.advanceTimersByTimeAsync(BRAND_LOGO_TIMEOUT_MS);
    expect(await work).toBeNull(); expect(readerAbort).toHaveBeenCalledTimes(1);
  });
});

it("cleans up when FileReader throws synchronously", async () => {
  const { loadGlobalBrandLogo, resetGlobalBrandLogoCache } = await import("../logo");
  resetGlobalBrandLogoCache();
  vi.stubGlobal("FileReader", class { readAsDataURL() { throw new Error("reader unavailable"); } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["png"]) }));
  try { expect(await loadGlobalBrandLogo()).toBeNull(); } finally { vi.unstubAllGlobals(); }
});
