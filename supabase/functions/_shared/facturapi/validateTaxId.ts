// Consulta compartida al endpoint de validación fiscal del PAC
// (`/v2/tools/tax_id_validation`), que contrasta RFC + razón social +
// régimen + CP contra la Constancia de Situación Fiscal del SAT.
// No consume timbre.
//
// Lo usan `validate-receptor-tax-info` (una factura) y
// `validate-customers-tax-info` (validación masiva de la cartera).
import { FacturapiTimeoutError, fetchWithTimeout } from "./withTimeout.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

/** RFC genérico de Público en General: el SAT no lo valida contra una CSF. */
export const RFC_PUBLICO_GENERAL = "XAXX010101000";

export interface TaxIdPayload {
  tax_id: string;
  legal_name: string;
  tax_system: string;
  zip: string;
}

export interface TaxIdValidationError {
  path: string;
  message: string;
  code?: string;
}

export type TaxIdValidationOutcome =
  | { kind: "valid"; errors: [] }
  | { kind: "mismatch"; errors: TaxIdValidationError[] }
  | { kind: "timeout"; message: string }
  | { kind: "http_error"; status: number; message: string };

export async function validateTaxIdWithPac(
  payload: TaxIdPayload,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TaxIdValidationOutcome> {
  const qs = new URLSearchParams({
    tax_id: payload.tax_id,
    legal_name: payload.legal_name,
    tax_system: payload.tax_system,
    zip: payload.zip,
  }).toString();

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${FACTURAPI_BASE}/tools/tax_id_validation?${qs}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
      undefined,
      fetchImpl,
    );
  } catch (err) {
    if (err instanceof FacturapiTimeoutError) {
      return { kind: "timeout", message: "PAC no respondió a tiempo" };
    }
    throw err;
  }

  const rawText = await res.text();
  if (!res.ok) {
    return {
      kind: "http_error",
      status: res.status,
      message: rawText.slice(0, 500),
    };
  }

  let parsed: { is_valid?: boolean; errors?: TaxIdValidationError[] } = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }

  if (parsed.is_valid === true) return { kind: "valid", errors: [] };

  return {
    kind: "mismatch",
    errors: (parsed.errors ?? []).map((e) => ({
      path: e.path ?? "",
      message: e.message ?? "",
      code: e.code,
    })),
  };
}
