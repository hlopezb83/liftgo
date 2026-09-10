import { creditNoteDiscountForSelection } from "./creditNoteDiscount.ts";
import { fromCents, roundMoney, toCents } from "./money.ts";

type CreditNoteLine = {
  description?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  product_key?: unknown;
  clave_prod_serv?: unknown;
  clave_unidad?: unknown;
  unit_key?: unknown;
  objeto_imp?: unknown;
  tax_rate?: unknown;
  discount?: unknown;
  discount_type?: unknown;
  source_line_index?: unknown;
};

export type SourceBoundCreditNoteLine = {
  sourceLineIndex: number;
  description: string;
  productKey: string;
  unitKey: string;
  objetoImp: string;
  taxRatePct: number;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
};

type ValidationFailure = {
  ok: false;
  code:
    | "CREDIT_NOTE_RECREATE_REQUIRED"
    | "INVALID_SOURCE_LINE_INDEX"
    | "DUPLICATE_SOURCE_LINE_INDEX"
    | "INVALID_CREDIT_NOTE_LINE"
    | "CREDIT_NOTE_LINE_EXCEEDS_SOURCE"
    | "CREDIT_NOTE_TOTALS_MISMATCH";
  message: string;
  recreateRequired: boolean;
};

export type CreditNoteSourceValidation =
  | {
    ok: true;
    lines: SourceBoundCreditNoteLine[];
    subtotal: number;
    taxAmount: number;
    total: number;
  }
  | ValidationFailure;

function fail(
  code: ValidationFailure["code"],
  message: string,
  recreateRequired = false,
): ValidationFailure {
  return { ok: false, code, message, recreateRequired };
}

function presentFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function grossAmount(unitPrice: number, quantity: number): number {
  // Paridad con currency(unitPrice).multiply(quantity) usado por la UI.
  return roundMoney(roundMoney(unitPrice) * quantity);
}

/**
 * Liga cada partida de una nota de crédito con una única partida de su factura
 * timbrada y deriva de ella identidad fiscal, descuento e impuestos. Los
 * importes guardados en el borrador sólo se aceptan si cuadran, al centavo,
 * con el cálculo canónico.
 */
export function validateCreditNoteSourceLines(
  creditNote: Record<string, unknown>,
  sourceInvoice: Record<string, unknown>,
): CreditNoteSourceValidation {
  const selectedLines = Array.isArray(creditNote.line_items)
    ? (creditNote.line_items as CreditNoteLine[])
    : [];
  const sourceLines = Array.isArray(sourceInvoice.line_items)
    ? (sourceInvoice.line_items as CreditNoteLine[])
    : [];

  if (selectedLines.length === 0) {
    return fail(
      "INVALID_CREDIT_NOTE_LINE",
      "La nota de crédito no contiene partidas acreditables. Recrea el borrador antes de timbrar.",
      true,
    );
  }

  const sourceTaxRate = sourceInvoice.tax_rate == null
    ? 16
    : presentFiniteNumber(sourceInvoice.tax_rate);
  if (sourceTaxRate === null || sourceTaxRate < 0 || sourceTaxRate > 100) {
    return fail(
      "INVALID_CREDIT_NOTE_LINE",
      "La factura origen no contiene una tasa de IVA válida; no es seguro timbrar la nota de crédito.",
    );
  }

  const seenSourceIndexes = new Set<number>();
  const boundLines: SourceBoundCreditNoteLine[] = [];
  let subtotalCents = 0;
  let taxCents = 0;

  for (let lineIndex = 0; lineIndex < selectedLines.length; lineIndex += 1) {
    const selected = selectedLines[lineIndex];
    if (!selected || typeof selected !== "object") {
      return fail(
        "INVALID_CREDIT_NOTE_LINE",
        `La partida ${lineIndex + 1} de la nota de crédito no es válida.`,
      );
    }

    if (
      selected.source_line_index === null ||
      selected.source_line_index === undefined
    ) {
      return fail(
        "CREDIT_NOTE_RECREATE_REQUIRED",
        "Este borrador es anterior al vínculo seguro de partidas (falta source_line_index). Elimínalo y crea de nuevo la nota de crédito antes de timbrar.",
        true,
      );
    }
    if (!Number.isInteger(selected.source_line_index)) {
      return fail(
        "INVALID_SOURCE_LINE_INDEX",
        `La partida ${
          lineIndex + 1
        } tiene un source_line_index inválido. Recrea el borrador antes de timbrar.`,
        true,
      );
    }

    const sourceLineIndex = Number(selected.source_line_index);
    if (sourceLineIndex < 0 || sourceLineIndex >= sourceLines.length) {
      return fail(
        "INVALID_SOURCE_LINE_INDEX",
        `La partida ${
          lineIndex + 1
        } no corresponde a una partida de la factura origen. Recrea el borrador antes de timbrar.`,
        true,
      );
    }
    if (seenSourceIndexes.has(sourceLineIndex)) {
      return fail(
        "DUPLICATE_SOURCE_LINE_INDEX",
        `La partida origen ${
          sourceLineIndex + 1
        } aparece más de una vez en la nota de crédito.`,
      );
    }
    seenSourceIndexes.add(sourceLineIndex);

    const source = sourceLines[sourceLineIndex];
    if (!source || typeof source !== "object") {
      return fail(
        "INVALID_SOURCE_LINE_INDEX",
        `La partida origen ${sourceLineIndex + 1} no es válida.`,
      );
    }

    const quantity = presentFiniteNumber(selected.quantity);
    const unitPrice = presentFiniteNumber(selected.unit_price);
    const sourceQuantity = presentFiniteNumber(source.quantity);
    const sourceUnitPrice = presentFiniteNumber(source.unit_price);
    if (
      quantity === null ||
      quantity <= 0 ||
      unitPrice === null ||
      unitPrice <= 0 ||
      sourceQuantity === null ||
      sourceQuantity <= 0 ||
      sourceUnitPrice === null ||
      sourceUnitPrice <= 0
    ) {
      return fail(
        "INVALID_CREDIT_NOTE_LINE",
        `La partida ${lineIndex + 1} contiene cantidad o precio inválido.`,
      );
    }
    if (quantity > sourceQuantity || unitPrice > sourceUnitPrice) {
      return fail(
        "CREDIT_NOTE_LINE_EXCEEDS_SOURCE",
        `La partida ${
          lineIndex + 1
        } excede la cantidad o el precio unitario de la factura origen.`,
      );
    }

    const canonicalUnitPrice = roundMoney(unitPrice);
    const selectedGross = grossAmount(canonicalUnitPrice, quantity);
    const originalGross = grossAmount(sourceUnitPrice, sourceQuantity);
    if (canonicalUnitPrice <= 0 || selectedGross <= 0 || originalGross <= 0) {
      return fail(
        "INVALID_CREDIT_NOTE_LINE",
        `La partida ${
          lineIndex + 1
        } no produce un importe acreditable positivo.`,
      );
    }

    const discountType = source.discount_type === "$" ? "$" : "%";
    const sourceDiscount = presentFiniteNumber(source.discount) ?? 0;
    if (sourceDiscount < 0) {
      return fail(
        "INVALID_CREDIT_NOTE_LINE",
        `La partida origen ${
          sourceLineIndex + 1
        } contiene un descuento inválido.`,
      );
    }
    const normalizedDiscount = creditNoteDiscountForSelection({
      originalGross,
      selectedGross,
      originalDiscount: sourceDiscount,
      discountType,
    });
    const discountAmount = discountType === "$"
      ? roundMoney(normalizedDiscount)
      : roundMoney((selectedGross * normalizedDiscount) / 100);
    const lineSubtotal = roundMoney(
      Math.max(0, selectedGross - discountAmount),
    );

    const sourceLineRate = source.tax_rate == null
      ? sourceTaxRate
      : presentFiniteNumber(source.tax_rate);
    if (sourceLineRate === null || sourceLineRate < 0 || sourceLineRate > 100) {
      return fail(
        "INVALID_CREDIT_NOTE_LINE",
        `La partida origen ${
          sourceLineIndex + 1
        } contiene una tasa de IVA inválida.`,
      );
    }
    const objetoImp = sourceString(source.objeto_imp, "02");
    const lineTax = objetoImp === "01"
      ? 0
      : roundMoney((lineSubtotal * sourceLineRate) / 100);

    subtotalCents += toCents(lineSubtotal);
    taxCents += toCents(lineTax);
    boundLines.push({
      sourceLineIndex,
      description: sourceString(source.description, "Servicio de renta"),
      productKey: sourceString(
        source.clave_prod_serv,
        sourceString(source.product_key, "78101803"),
      ),
      unitKey: sourceString(
        source.clave_unidad,
        sourceString(source.unit_key, "E48"),
      ),
      objetoImp,
      taxRatePct: sourceLineRate,
      quantity,
      unitPrice: canonicalUnitPrice,
      discountAmount,
    });
  }

  const subtotal = fromCents(subtotalCents);
  const taxAmount = fromCents(taxCents);
  const total = fromCents(subtotalCents + taxCents);
  const persistedTotals: Array<[string, unknown, number]> = [
    ["subtotal", creditNote.subtotal, subtotal],
    ["IVA", creditNote.tax_amount, taxAmount],
    ["total", creditNote.total, total],
  ];
  const mismatch = persistedTotals.find(([, stored, canonical]) => {
    const storedNumber = presentFiniteNumber(stored);
    return (
      storedNumber === null || toCents(storedNumber) !== toCents(canonical)
    );
  });
  if (mismatch) {
    const [field, stored, canonical] = mismatch;
    return fail(
      "CREDIT_NOTE_TOTALS_MISMATCH",
      `El ${field} guardado en la nota de crédito (${
        String(stored)
      }) no coincide con el cálculo de la factura origen (${
        canonical.toFixed(2)
      }). Recrea el borrador antes de timbrar.`,
      true,
    );
  }

  return { ok: true, lines: boundLines, subtotal, taxAmount, total };
}
