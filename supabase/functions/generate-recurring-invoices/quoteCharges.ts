import { fromCents, toCents } from "../_shared/money.ts";

/** Validate the complete authoritative response. Never treat missing data as zero usage. */
export type RecurringQuoteCharge = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  line_kind: "charge";
  source_quote_id: string;
  source_quote_line_id: string;
  discount?: number;
  discount_type?: "%" | "$";
  clave_prod_serv: string;
  clave_unidad: string;
  objeto_imp: string;
  tax_rate?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Respuesta incompleta de cargos de cotización");
  }
  return value as Record<string, unknown>;
}
function nonnegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Cantidad inválida en los cargos de cotización");
  }
  return value;
}

export function recurringQuoteCharges(
  response: unknown,
  requestedQuoteIds: string[],
): RecurringQuoteCharge[] {
  const result = record(response);
  const expected = new Set(requestedQuoteIds);
  if (
    result.complete !== true || !Array.isArray(result.quotes) ||
    result.quotes.length !== expected.size
  ) {
    throw new Error("No se pudo verificar el historial completo de cargos");
  }
  const seen = new Set<string>();
  const charges: RecurringQuoteCharge[] = [];
  for (const raw of result.quotes) {
    const quote = record(raw);
    const quoteId = String(quote.quote_id);
    if (
      !UUID.test(quoteId) || !expected.has(quoteId) || seen.has(quoteId) ||
      !Array.isArray(quote.lines)
    ) {
      throw new Error("Respuesta incompleta de cargos de cotización");
    }
    seen.add(quoteId);
    if (quote.legacy_review_required !== false) {
      throw new Error(
        "Hay cargos históricos sin origen verificable; requieren revisión manual",
      );
    }
    const lineIds = new Set<string>();
    for (const rawLine of quote.lines) {
      const row = record(rawLine);
      const line = record(row.line);
      const lineId = String(row.quote_line_id);
      const quoted = nonnegative(row.quoted_quantity);
      const consumed = nonnegative(row.consumed_quantity);
      const remaining = nonnegative(row.remaining_quantity);
      if (
        !UUID.test(lineId) || lineIds.has(lineId) ||
        line.quote_line_id !== lineId || line.line_kind !== "charge" ||
        quoted <= 0 || consumed > quoted ||
        Math.abs(remaining - (quoted - consumed)) > 0.0000001
      ) {
        throw new Error("Saldo o identidad de cargo inválido");
      }
      lineIds.add(lineId);
      if (remaining === 0) continue;
      const unitPrice = nonnegative(line.unit_price);
      const discount = line.discount == null ? 0 : nonnegative(line.discount);
      const discountType = line.discount_type ?? "%";
      if (discount > 0 && discountType === "$" && remaining !== quoted) {
        throw new Error("El descuento fijo parcial requiere revisión manual");
      }
      if (
        discountType !== "%" && discountType !== "$" ||
        discountType === "%" && discount > 100
      ) {
        throw new Error("Descuento de cargo inválido");
      }
      const gross = fromCents(Math.round(toCents(unitPrice) * remaining));
      const taxRate = line.tax_rate == null
        ? undefined
        : nonnegative(line.tax_rate);
      if (taxRate !== undefined && taxRate > 100) {
        throw new Error("Tasa del cargo inválida");
      }
      const description = typeof line.description === "string"
        ? line.description
        : "";
      if (!description.trim()) throw new Error("El cargo no tiene descripción");
      charges.push({
        description,
        quantity: remaining,
        unit_price: unitPrice,
        total: gross,
        line_kind: "charge",
        source_quote_id: quoteId,
        source_quote_line_id: lineId,
        discount,
        discount_type: discountType,
        clave_prod_serv: String(
          line.clave_prod_serv ??
            (line.charge_kind === "insurance" ? "84131500" : "78101800"),
        ),
        clave_unidad: String(line.clave_unidad ?? "E48"),
        objeto_imp: String(line.objeto_imp ?? "02"),
        ...(taxRate === undefined ? {} : { tax_rate: taxRate }),
      });
    }
  }
  return charges;
}

/** Persist gross line totals; apply the discount exactly once for header sums. */
export function recurringChargeAmounts(
  line: RecurringQuoteCharge,
  defaultTaxRate: number,
): { netCents: number; taxCents: number } {
  const grossCents = toCents(line.total);
  const discountCents = line.discount_type === "$"
    ? toCents(line.discount ?? 0)
    : Math.round(grossCents * (line.discount ?? 0) / 100);
  const netCents = Math.max(0, grossCents - discountCents);
  const taxCents = line.objeto_imp === "01"
    ? 0
    : Math.round(netCents * (line.tax_rate ?? defaultTaxRate) / 100);
  return { netCents, taxCents };
}
