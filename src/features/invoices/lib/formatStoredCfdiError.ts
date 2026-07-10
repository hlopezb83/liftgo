import { classifyFacturapiError } from "./facturapiErrors";

/**
 * Traduce el `cfdi_error_message` guardado en DB (JSON de Facturapi o string
 * plano) al mensaje amigable en español-MX. Prioriza `errors[0].code` porque
 * ahí viene el CFDI40xxx real; el `code` outer suele ser `invoice_stamping_failed`.
 */
function parseCfdiJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      code?: string;
      message?: string;
      errors?: Array<{ code?: string; message?: string }>;
    };
    const inner = parsed.errors?.[0];
    const code = inner?.code ?? parsed.code ?? null;
    const message = inner?.message ?? parsed.message ?? raw;
    return code ? `${code}: ${message}` : message;
  } catch {
    return raw;
  }
}

export function formatStoredCfdiError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const source = trimmed.startsWith("{") ? parseCfdiJson(trimmed) : trimmed;
  return classifyFacturapiError(source).message;
}
