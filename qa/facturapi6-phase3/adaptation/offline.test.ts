import { describe, test, expect } from "bun:test";
import { attachOfflineConfigScope, readQaTestConfig, TENANT, type ConfigReader } from "./testConfig";
import { getFacturapiConfigForOrganization, createFacturapiClient, createInvoiceWithSignal } from "./candidate/_shared/facturapi/client";
import { handleStampCfdi } from "./candidate/stamp-cfdi/handler";
import { handleStampPaymentComplement } from "./candidate/stamp-payment-complement/handler";
import { handleStampCreditNote } from "./candidate/stamp-credit-note/handler";
import { handleCancelCfdi } from "./candidate/cancel-cfdi/handler";
import { handleDownloadCfdi } from "./candidate/download-cfdi/handler";
import { handleRefreshCancellation } from "./candidate/refresh-cancellation-status/handler";

function fixture(options: { mode?: unknown; key?: unknown; exclusive?: boolean; fail?: string; pause?: string } = {}) {
  const trace: unknown[][] = [];
  let open = true;
  let release: (() => void) | undefined;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  const admin: ConfigReader = {
    from(table) {
      trace.push(["from", table]);
      const query = {
        select(columns: string) { trace.push(["select", columns]); return query; },
        eq(column: string, value: string) { trace.push(["eq", column, value]); return query; },
        async maybeSingle() {
          if (options.pause === table) await deferred;
          return {
            data: table === "company_settings" ? { facturapi_mode: options.mode ?? "test" } : { facturapi_test_key: options.key ?? "sk_test_FICTICIO_NO_UTILIZABLE" },
            error: options.fail === table ? "FALLA_FICTICIA" : null,
          };
        },
      };
      return query;
    },
  };
  const detach = attachOfflineConfigScope(admin, {
    checkpoint() { if (!open) throw new Error("VENTANA_CERRADA"); },
    async loadVerifier() {
      trace.push(["loadVerifier"]);
      if (options.pause === "loader") await deferred;
      return async () => {
        trace.push(["rpc", "qa_fx6_elogistix_test_key_is_exclusive"]);
        if (options.pause === "rpc") await deferred;
        return options.exclusive ?? true;
      };
    },
  });
  return { admin, trace, detach, expire() { open = false; release?.(); } };
}
const input = (f: ReturnType<typeof fixture>) => ({ admin: f.admin, organizationId: TENANT, env: () => { throw new Error("ENV_PROHIBIDO"); } });

describe("Resolver conectado en la copia QA auténtica", () => {
  test("lee sólo testkey y filtros exactos, RPC sin parámetros secretos", async () => {
    const f = fixture();
    const result = await getFacturapiConfigForOrganization(input(f));
    expect(result).toEqual({ mode: "test", apiKey: "sk_test_FICTICIO_NO_UTILIZABLE", organizationId: TENANT, fromEnvFallback: false });
    expect(f.trace).toEqual([
      ["from", "company_settings"], ["select", "facturapi_mode"], ["eq", "organization_id", TENANT],
      ["loadVerifier"], ["rpc", "qa_fx6_elogistix_test_key_is_exclusive"],
      ["from", "billing_secrets"], ["select", "facturapi_test_key"], ["eq", "organization_id", TENANT],
    ]);
    f.detach();
  });
  test("sin scope no consulta", async () => {
    const f = fixture(); f.detach();
    await expect(getFacturapiConfigForOrganization(input(f))).rejects.toMatchObject({ code: "config_read_error" });
    expect(f.trace).toEqual([]);
  });
  test("otro tenant no consulta", async () => {
    const f = fixture();
    await expect(readQaTestConfig({ ...input(f), organizationId: "OTRA_EMPRESA_FICTICIA" })).rejects.toMatchObject({ code: "organization_required" });
    expect(f.trace).toEqual([]);
  });
  test("modo live no consulta secreto ni RPC", async () => {
    const f = fixture({ mode: "live" });
    await expect(getFacturapiConfigForOrganization(input(f))).rejects.toMatchObject({ code: "config_invalid_mode" });
    expect(f.trace.length).toBe(3);
  });
  test("override no omite lectura de modo test", async () => {
    const f = fixture({ mode: "live" });
    await expect(getFacturapiConfigForOrganization({ ...input(f), modeOverride: "test" })).rejects.toMatchObject({ code: "config_invalid_mode" });
    expect(f.trace[0]).toEqual(["from", "company_settings"]);
  });
  test("duplicado no lee secreto", async () => {
    const f = fixture({ exclusive: false });
    await expect(getFacturapiConfigForOrganization(input(f))).rejects.toMatchObject({ code: "config_duplicate_key" });
    expect(f.trace.some((x) => x[1] === "billing_secrets")).toBe(false);
  });
  test("error de modo no cae al entorno", async () => {
    const f = fixture({ fail: "company_settings" });
    await expect(getFacturapiConfigForOrganization(input(f))).rejects.toMatchObject({ code: "config_read_error" });
    expect(f.trace.length).toBe(3);
  });
  test("llave live ficticia rechazada sin exponerla en error", async () => {
    const f = fixture({ key: "sk_live_FICTICIO" });
    await expect(getFacturapiConfigForOrganization(input(f))).rejects.toMatchObject({ code: "config_invalid_key_mode", message: "Configuración QA no disponible; ejecución bloqueada." });
  });
  for (const pause of ["company_settings", "loader", "rpc", "billing_secrets"]) {
    test(`expira durante ${pause}: ninguna consulta nueva ni retorno de llave`, async () => {
      const f = fixture({ pause });
      const promise = getFacturapiConfigForOrganization(input(f));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const before = f.trace.length;
      f.expire();
      await expect(promise).rejects.toThrow("VENTANA_CERRADA");
      expect(f.trace.length).toBe(before);
      if (pause === "loader") expect(f.trace.some((x) => x[0] === "rpc")).toBe(false);
      if (pause !== "billing_secrets") expect(f.trace.some((x) => x[1] === "billing_secrets")).toBe(false);
    });
  }
  test("SDK bloqueado antes de crear cliente o iniciar red", () => {
    expect(() => createFacturapiClient("sk_test_FICTICIO_NO_UTILIZABLE")).toThrow("QA_TRANSPORT_BLOCKED");
  });
  test("señal ya abortada no inicia escritura SDK", async () => {
    let calls = 0;
    const controller = new AbortController(); controller.abort();
    await expect(createInvoiceWithSignal({ invoices: { client: { request() { calls++; } } } }, {}, { signal: controller.signal })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});

describe("Importación y handlers auténticos, sin sesión ni efectos", () => {
  const forbidden = () => { throw new Error("EFECTO_NO_PERMITIDO"); };
  const deps = { createCallerClient: forbidden, createServiceClient: forbidden, createInvoiceGateway: forbidden, fetchImpl: forbidden, env: forbidden };
  // No es flujo autorizado completo: comprueba sólo el rechazo inicial real.
  for (const [name, handler] of Object.entries({ handleStampCfdi, handleStampPaymentComplement, handleStampCreditNote, handleCancelCfdi, handleDownloadCfdi, handleRefreshCancellation })) {
    test(`${name}: rechaza sin credenciales y cero clientes`, async () => {
      const response = await handler(new Request("https://offline.invalid/qa", { method: "POST", body: "{}" }), deps);
      expect(response.status).toBe(401);
    });
  }
});