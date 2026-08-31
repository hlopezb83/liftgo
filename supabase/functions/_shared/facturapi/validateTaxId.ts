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

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  // El PAC responde `{ efos: { is_valid, data } }`: la validación disponible
  // sin registrar al cliente es la lista EFOS (art. 69-B). Aceptamos también
  // un `is_valid` de primer nivel por compatibilidad.
  const efos = (parsed.efos ?? null) as Record<string, unknown> | null;
  const isValid = parsed.is_valid === true ||
    (efos !== null && efos.is_valid === true);
  if (isValid) return { kind: "valid", errors: [] };

  const errors = normalizeTaxIdErrors(parsed);
  if (errors.length === 0) {
    const efosData = (efos?.data ?? null) as Record<string, unknown> | null;
    const mensaje = typeof efosData?.mensaje === "string"
      ? efosData.mensaje
      : "";
    console.warn(
      "[validateTaxIdWithPac] respuesta sin detalle:",
      rawText.slice(0, 400),
    );
    errors.push({
      path: "",
      message: mensaje ||
        "El RFC aparece con observaciones en el SAT. Revisa la Constancia de Situación Fiscal.",
      code: "SAT_MISMATCH",
    });
  }

  return { kind: "mismatch", errors };
}


const FIELD_LABEL: Record<string, string> = {
  tax_id: "RFC",
  legal_name: "Razón social",
  tax_system: "Régimen fiscal",
  zip: "C.P. fiscal",
};

function labelFor(path: string): string {
  return FIELD_LABEL[path] ?? path;
}

/**
 * El PAC no siempre devuelve el mismo formato de errores: puede mandar un
 * arreglo de objetos, un arreglo de textos, un mapa campo → mensaje, o sólo
 * un `message` general. Normalizamos todos esos casos a una lista legible.
 */
export function normalizeTaxIdErrors(
  parsed: Record<string, unknown>,
): TaxIdValidationError[] {
  const out: TaxIdValidationError[] = [];
  const raw = parsed.errors ?? parsed.error ?? null;

  const pushEntry = (path: string, message: string, code?: string) => {
    const trimmed = message.trim();
    if (!trimmed && !path) return;
    const label = labelFor(path);
    out.push({
      path,
      message: label && trimmed
        ? `${label}: ${trimmed}`
        : (trimmed || `${label} no coincide con el SAT`),
      code,
    });
  };

  const consume = (entry: unknown, keyHint = "") => {
    if (typeof entry === "string") {
      pushEntry(keyHint, entry);
      return;
    }
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      const path = String(e.path ?? e.field ?? e.param ?? keyHint ?? "");
      const message = String(
        e.message ?? e.description ?? e.detail ?? e.reason ?? "",
      );
      pushEntry(path, message, e.code ? String(e.code) : undefined);
    }
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) consume(entry);
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) for (const v of value) consume(v, key);
      else consume(value, key);
    }
  } else if (typeof raw === "string") {
    consume(raw);
  }

  if (out.length === 0 && typeof parsed.message === "string") {
    pushEntry("", parsed.message);
  }

  return out;
}

