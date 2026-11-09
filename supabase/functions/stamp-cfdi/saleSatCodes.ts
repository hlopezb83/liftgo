import type { SupabaseLike } from "../_shared/types.ts";
import { isUUID } from "../_shared/validate.ts";

/** Derived from stored, tenant-scoped quotes, not caller-supplied flags. */
export interface SaleSatContext {
  isSaleQuote?: boolean;
  saleSourceQuoteIds?: readonly string[];
}

type Invoice = Readonly<Record<string, unknown>>;
type Failure = {
  ok: false;
  status: 422 | 503;
  code: string;
  error: string;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function requiresExplicitSaleSat(
  line: unknown,
  context: SaleSatContext = {},
): boolean {
  const item = record(line);
  return item.sat_selection_required === true ||
    context.isSaleQuote === true || item.line_kind === "sale" ||
    (typeof item.source_quote_id === "string" &&
      (context.saleSourceQuoteIds ?? []).includes(item.source_quote_id));
}

/** Presence does not attest catalog suitability or historical user selection. */
export function validateSaleSatCodes(
  invoice: Invoice,
  context: SaleSatContext = {},
): Failure | { ok: true } {
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  if (
    lines.some((line) => {
      const marker = record(line).sat_selection_required;
      return marker !== undefined && typeof marker !== "boolean";
    })
  ) {
    return {
      ok: false,
      status: 422,
      code: "SAT_SELECTION_MARKER_INVALID",
      error:
        "El requisito de selección SAT de un concepto no es válido. Revisa los conceptos antes de timbrar.",
    };
  }
  const missing = lines.flatMap((line, index) => {
    if (!requiresExplicitSaleSat(line, context)) return [];
    const item = record(line);
    return [item.clave_prod_serv, item.clave_unidad].every((code) =>
        typeof code === "string" && code.trim().length > 0
      )
      ? []
      : [index + 1];
  });
  if (missing.length || (context.isSaleQuote && !lines.length)) {
    return {
      ok: false,
      status: 422,
      code: "SALE_SAT_CODES_REQUIRED",
      error: missing.length
        ? `Selecciona explícitamente la clave de producto/servicio y la unidad SAT en los conceptos que requieren selección explícita: ${
          missing.join(", ")
        }. No se asignan claves automáticamente.`
        : "Agrega los conceptos de venta y selecciona explícitamente su clave de producto/servicio y unidad SAT antes de timbrar.",
    };
  }
  return { ok: true };
}

function invalidSource(): Failure {
  return {
    ok: false,
    status: 422,
    code: "INVOICE_QUOTE_SOURCE_INVALID",
    error:
      "No se pudo validar la cotización de origen de esta factura en la empresa. Revisa su vínculo antes de timbrar.",
  };
}

/** Invoke after auth, tenant and idempotency checks, before claim/PAC/stub. */
export async function resolveSaleSatContext(
  supabase: SupabaseLike,
  invoice: Invoice,
  organizationId: string,
): Promise<Failure | { ok: true; context: SaleSatContext }> {
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const references = [
    invoice.quote_id,
    ...lines.map((line) => record(line).source_quote_id),
  ].filter((id) => id != null);
  if (references.some((id) => !isUUID(id))) return invalidSource();
  const quoteIds = [...new Set(references as string[])];
  if (!quoteIds.length) return { ok: true, context: {} };

  let result: { data: unknown; error: unknown };
  try {
    result = await supabase.from("quotes")
      .select("id, organization_id, quote_type")
      .eq("organization_id", organizationId)
      .in("id", quoteIds);
  } catch {
    result = { data: null, error: true };
  }
  if (result.error) {
    return {
      ok: false,
      status: 503,
      code: "INVOICE_QUOTE_SOURCE_UNAVAILABLE",
      error:
        "No se pudo consultar la cotización de origen. No se emitió CFDI. Reintenta en unos segundos.",
    };
  }
  if (!Array.isArray(result.data)) return invalidSource();
  const quotes = result.data.map(record);
  if (
    quotes.length !== quoteIds.length ||
    quotes.some((quote) =>
      quote.organization_id !== organizationId ||
      !quoteIds.includes(quote.id as string) ||
      (quote.quote_type !== "sale" && quote.quote_type !== "rental")
    ) || quoteIds.some((id) => !quotes.some((quote) => quote.id === id))
  ) return invalidSource();
  const saleSourceQuoteIds = quotes.filter((q) => q.quote_type === "sale")
    .map((q) => q.id as string);
  return {
    ok: true,
    context: {
      isSaleQuote: saleSourceQuoteIds.includes(invoice.quote_id as string),
      saleSourceQuoteIds,
    },
  };
}
