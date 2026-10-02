import { afterEach, describe, expect, it } from "vitest";
import { extractErrorDetails, deriveErrorCode } from "../errorDetailsExtract";
import { buildErrorReport, setAppVersion } from "../errorReport";
import { diagnosticSnapshot, formatReportJson } from "../errorReportJson";
import { setAuthSnapshot } from "../authSnapshot";

afterEach(() => setAuthSnapshot({ user: null, organization: null, role: null }));

describe("diagnóstico JSON", () => {
  it("conserva datos útiles y no copia credenciales ni tokens de rutas o mensajes", () => {
    const report = buildErrorReport({ title: "Falló Facturapi", error: "password=temporal token=reservado",
      context: { api_key: "credencial", nested: { authorization: "Bearer prueba", rfc: "AAA010101AAA", folio: "FAC-0001" } } });
    const json = formatReportJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.context).toEqual({ api_key: "[REDACTADO]", nested: { authorization: "[REDACTADO]", rfc: "AAA010101AAA", folio: "FAC-0001" } });
    expect(json).not.toMatch(/temporal|reservado|credencial|Bearer prueba/);
    expect(parsed.errorDetails.message).toContain("[REDACTADO]");
  });

  it("el reporte es una instantánea: cambios posteriores no alteran el diagnóstico", () => {
    const context = { operation: { state: "pending" } };
    setAuthSnapshot({ user: { id: "actor", email: "admin@example.com" }, organization: { id: "org-a", name: "Empresa A" }, role: "admin" });
    setAppVersion("8.43.1");
    const report = buildErrorReport({ title: "No se pudo guardar", error: new Error("Sin conexión"), context });
    context.operation.state = "succeeded";
    setAuthSnapshot({ user: null, organization: null, role: null });
    const parsed = JSON.parse(formatReportJson(report));
    expect(parsed.context.operation.state).toBe("pending");
    expect(parsed.user).toMatchObject({ id: "actor", organizationId: "org-a", organizationName: "Empresa A" });
    expect(parsed.version).not.toBe("unknown");
  });

  it("serializa ciclos y BigInt sin ejecutar propiedades calculadas", () => {
    const getter = { get password() { throw new Error("No ejecutar"); }, get data() { throw new Error("No ejecutar"); } };
    const circular: Record<string, unknown> = { amount: 10n, getter };
    circular.self = circular;
    expect(diagnosticSnapshot(circular)).toEqual({ amount: "10", getter: { password: "[REDACTADO]", data: "[Propiedad calculada]" }, self: "[Referencia circular]" });
  });

  it("conserva estado HTTP y SQLSTATE de objetos y causas", () => {
    const plain = { message: "No autorizado", status: 403, code: "42501", details: "Acceso restringido" };
    expect(extractErrorDetails(plain)).toMatchObject(plain);
    const wrapped = new Error("La operación falló", { cause: { context: new Response(null, { status: 429 }) } });
    expect(extractErrorDetails(wrapped).status).toBe(429);
    expect(deriveErrorCode(wrapped)).toBe("RATE_LIMITED");
  });
});
