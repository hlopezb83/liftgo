import type { IntegrationStatus } from "@/lib/platformHealth.types";

export interface FacturapiHealthResult {
  status: Exclude<IntegrationStatus, "pending" | "config_changed">;
  latencyMs: number | null;
  httpStatus: number | null;
}
export async function checkReservedFacturapiConnection(reservation: {
  preflight: "ready" | "unconfigured" | "duplicate_key"; apiKey: string | null;
}): Promise<FacturapiHealthResult> {
  if (reservation.preflight === "ready" && reservation.apiKey) return checkFacturapiConnection(reservation.apiKey);
  return { status: reservation.preflight === "duplicate_key" ? "duplicate_key" : "unconfigured", latencyMs: null, httpStatus: null };
}
function classifyHttp(status: number): FacturapiHealthResult["status"] {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limited";
  return status >= 500 ? "unavailable" : "invalid_response";
}

/** GET oficial /organizations/me: prueba de conexión, no prueba de timbrado ni validación fiscal. */
export async function checkFacturapiConnection(apiKey: string): Promise<FacturapiHealthResult> {
  const started = performance.now();
  const latency = () => Math.min(60000, Math.max(0, Math.round(performance.now() - started)));
  try {
    const response = await fetch("https://www.facturapi.io/v2/organizations/me", {
      method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store",
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: classifyHttp(response.status), latencyMs: latency(), httpStatus: response.status };
    }
    try {
      const body: unknown = await response.json();
      const id = body && typeof body === "object" && "id" in body ? body.id : null;
      return { status: typeof id === "string" && id.trim().length > 0 && id.length <= 128 ? "connected" : "invalid_response",
        latencyMs: latency(), httpStatus: 200 };
    } catch {
      return { status: "invalid_response", latencyMs: latency(), httpStatus: 200 };
    }
  } catch {
    // Ni errores crudos ni el cuerpo del proveedor: pueden contener información fiscal o la llave.
    return { status: "unavailable", latencyMs: latency(), httpStatus: null };
  }
}
