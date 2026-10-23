import { buildNotesSection } from "../_shared/facturapi/notesSection.ts";
import { roundMoney } from "../_shared/money.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import { isUsoCfdiCompatible } from "../_shared/cfdiUsoRegimen.ts";
import {
  isValidRegimenFiscalCode,
  resolveReceptorRegimenFiscal,
} from "../_shared/regimenFiscal.ts";
import { validateRfcOrMessage } from "../_shared/rfcChecksum.ts";
import { checkStampFx } from "../_shared/fxGate.ts";

export type InvoicePayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | {
    ok: false;
    status: 400 | 422;
    error: string | undefined;
    claimError: string | undefined;
  };

function invalid(
  status: 400 | 422,
  error: string | undefined,
  claimError = error,
): InvoicePayloadResult {
  return { ok: false, status, error, claimError };
}

/**
 * Pure CFDI-I mapping and validation of the already loaded invoice snapshot.
 * Keeps the existing validation order, wire defaults and per-line rounding.
 * The caller owns auth, tenant, claim compensation, provider I/O and persistence.
 * Do not reuse for NC/REP: those documents have distinct fiscal contracts.
 */
export function buildInvoicePayload(
  { invoiceId, invoice: inv }: {
    invoiceId: string;
    invoice: Readonly<Record<string, unknown>>;
  },
): InvoicePayloadResult {
  // BL-01: distinguir tasa cero legítima (0) de "no capturada" (null/undefined).
  const taxRatePct = typeof inv.tax_rate === "number" ? inv.tax_rate : 16;

  const items = Array.isArray(inv.line_items)
    ? (inv.line_items as Array<
      {
        description?: string;
        quantity?: number;
        unit_price?: number;
        // M19: los line_items persisten las claves SAT con estos nombres
        // (ver invoiceFormBuilders.ts / nonRentalLines.ts). `product_key`
        // NUNCA existió: todo timbraba con el genérico 78101803.
        clave_prod_serv?: string;
        clave_unidad?: string;
        objeto_imp?: string;
        tax_rate?: number;
        discount?: number;
        discount_type?: "%" | "$";
      }
    >).map((li) => {
      const quantity = li.quantity || 1;
      const unitPrice = li.unit_price || 0;
      const objetoImp = li.objeto_imp ?? "02";
      // C-1: tasa por línea con fallback línea → factura (taxRatePct ya
      // cae a 16 cuando invoices.tax_rate no es numérico), igual que
      // `computeTotals` en src/lib/domain/invoiceTotals.ts.
      const lineRatePct =
        typeof li.tax_rate === "number" && Number.isFinite(li.tax_rate)
          ? li.tax_rate
          : taxRatePct;
      const lineRateFraction = lineRatePct / 100;
      const item: Record<string, unknown> = {
        product: {
          description: li.description || "Servicio de renta",
          product_key: li.clave_prod_serv || "78101803",
          unit_key: li.clave_unidad || "E48",
          price: unitPrice,
          tax_included: false,
          // M19: ObjetoImp 01 = no objeto de impuesto → línea sin traslados.
          taxes: objetoImp === "01"
            ? []
            : [{ type: "IVA", rate: lineRateFraction }],
        },
        quantity,
      };
      // BL-02: propagar descuento al CFDI. Facturapi acepta `discount` como
      // monto absoluto por línea (antes de impuestos). Convertimos porcentaje
      // a monto para que el XML timbrado coincida con el total de la app.
      if (li.discount && li.discount > 0) {
        const base = unitPrice * quantity;
        // S2-2.2: el porcentaje se capea en [0,100] igual que
        // `applyDiscountToBase` en src/lib/domain/invoiceTotals.ts.
        const discountPct = Math.min(100, Math.max(0, li.discount ?? 0));
        const discountAmount = li.discount_type === "$"
          ? Math.min(li.discount, base)
          : (base * discountPct) / 100;
        if (discountAmount > 0) {
          // BL-A5: `roundMoney` (2 decimales, centavos enteros) reemplaza el
          // `Math.round(*100)/100` histórico para eliminar drift IEEE-754.
          item.discount = roundMoney(discountAmount);
        }
      }

      return item;
    })
    : [];

  const receptorRfc = String(inv.receptor_rfc ?? "XAXX010101000")
    .toUpperCase();
  const isGlobal = receptorRfc === "XAXX010101000";

  // A4-05: dígito verificador del RFC validado en el servidor; el regex de
  // formato por sí solo acepta RFCs inventados y el timbre se pierde.
  {
    const rfcError = validateRfcOrMessage(receptorRfc);
    if (rfcError) {
      return invalid(400, rfcError);
    }
  }

  // Overrides fiscales obligatorios para Público en General (CFDI 4.0)
  const paymentMethod = isGlobal ? "PUE" : (inv.metodo_pago || "PUE");
  // SAT CFDI 4.0: cuando metodo_pago = PPD, forma_pago DEBE ser "99" (Por definir)
  const paymentForm = isGlobal
    ? "01"
    : (paymentMethod === "PPD" ? "99" : (inv.forma_pago || "99"));
  const usoCfdi = isGlobal ? "S01" : String(inv.uso_cfdi || "G03");
  const legalName = isGlobal ? "PUBLICO EN GENERAL" : sanitizeLegalName(
    String(
      inv.receptor_razon_social ?? inv.customer_name ?? "Público General",
    ),
  );
  // R9-04: misma resolución compartida que NC y REP (global XAXX -> "616").
  const taxSystem = resolveReceptorRegimenFiscal(
    isGlobal,
    inv.receptor_regimen_fiscal as string | null | undefined,
  );
  const zipCode = isGlobal
    ? String(inv.receptor_domicilio_fiscal_cp ?? "06600")
    : String(inv.receptor_domicilio_fiscal_cp ?? "");

  // A4-04: para receptores con RFC real, el régimen fiscal y el CP fiscal
  // deben venir del cliente. Los antiguos defaults ("616" / "06600")
  // timbraban CFDI con datos fiscales genéricos que el SAT puede rechazar
  // o dejar no deducibles para el cliente.
  if (!isGlobal) {
    const missingFiscal: string[] = [];
    if (!taxSystem.trim()) missingFiscal.push("régimen fiscal del receptor");
    if (!zipCode.trim()) {
      missingFiscal.push("código postal fiscal del receptor");
    }
    if (missingFiscal.length > 0) {
      return invalid(
        400,
        `Faltan datos fiscales del receptor: ${
          missingFiscal.join(", ")
        }. Captúralos en el cliente o en la factura antes de timbrar.`,
        `Faltan datos fiscales del receptor: ${missingFiscal.join(", ")}`,
      );
    }

    // R6 A4B-08: fail-fast del régimen fiscal. Un valor con descripción
    // ("601 - General de Ley…") o fuera del catálogo c_RegimenFiscal llegaba
    // crudo a Facturapi y el PAC lo rechazaba (o peor: quedaba persistido).
    if (!isValidRegimenFiscalCode(taxSystem)) {
      const msg =
        `El régimen fiscal del receptor "${taxSystem}" no es un código válido del catálogo del SAT (c_RegimenFiscal). Debe ser el código de 3 dígitos, p. ej. "601". Corrígelo en el cliente antes de timbrar.`;
      return invalid(422, msg);
    }

    // A4B-07: el default "G03" (Gastos en general) no es válido para todos
    // los regímenes (p. ej. 616 "Sin obligaciones fiscales" sólo admite
    // S01/CP01). Rechazar ANTES de timbrar en vez de dejar que el SAT
    // regrese el CFDI rechazado tras consumir el timbre.
    if (!isUsoCfdiCompatible(usoCfdi, taxSystem)) {
      const msg =
        `El uso de CFDI "${usoCfdi}" no es válido para el régimen fiscal ${taxSystem} del receptor. Corrige el uso de CFDI del cliente o de la factura antes de timbrar.`;
      return invalid(422, msg);
    }
  }

  if (isGlobal) {
    const missing: string[] = [];
    if (!inv.global_periodicity) missing.push("periodicidad");
    if (!inv.global_months) missing.push("meses");
    if (!inv.global_year) missing.push("año");
    if (missing.length > 0) {
      return invalid(
        400,
        `Faltan datos de Información Global (Público en General): ${
          missing.join(", ")
        }. Captúralos en el formulario de la factura antes de timbrar.`,
        `Faltan datos de Información Global: ${missing.join(", ")}`,
      );
    }
  }

  // R9-02: gate canónico de tipo de cambio (moneda != MXN exige TC finito,
  // > 0 y != 1) ANTES de construir el payload / llamar a Facturapi. Ver
  // `_shared/fxGate.ts` — misma regla que ya rige CxP/Cash-Flow/Portal.
  const fxGate = checkStampFx(
    inv.moneda as string | null | undefined,
    inv.tipo_cambio as number | string | null | undefined,
  );
  if (!fxGate.ok) {
    return invalid(422, fxGate.message);
  }
  const moneda = fxGate.currency;
  const tipoCambio = fxGate.exchange;

  const payload: Record<string, unknown> = {
    type: "I",
    customer: {
      legal_name: legalName,
      tax_id: receptorRfc,
      tax_system: taxSystem,
      address: { zip: zipCode },
    },
    items,
    payment_form: paymentForm,
    payment_method: paymentMethod,
    use: usoCfdi,
    currency: moneda,
    exchange: moneda === "MXN" ? 1 : tipoCambio,
    series: inv.serie || undefined,

    // BL-20: validar folio numérico antes de castear (Number("BORRADOR")=NaN
    // rompía el payload JSON hacia Facturapi).
    folio_number: (() => {
      if (!inv.folio) return undefined;
      const n = Number(inv.folio);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    })(),
    // R12 B2: external_id permite que `reconcile-stamping-invoices` recupere
    // el CFDI vía `invoices.list({ external_id })` cuando el timeout impidió persistir
    // facturapi_invoice_id — evita re-timbrar y por ende un CFDI duplicado.
    external_id: invoiceId,
    idempotency_key: invoiceId,
  };
  // 8.44.4: las notas de la factura se imprimen en el PDF de Facturapi.
  const notesSection = buildNotesSection(inv.notes);
  if (notesSection) payload.pdf_custom_section = notesSection;

  if (isGlobal) {
    const PERIODICITY_MAP: Record<string, string> = {
      "01": "day",
      "02": "week",
      "03": "fortnight",
      "04": "month",
      "05": "two_months",
    };
    const FACTURAPI_ENUM = new Set([
      "day",
      "week",
      "fortnight",
      "month",
      "two_months",
    ]);
    const raw = String(inv.global_periodicity);
    const periodicity = PERIODICITY_MAP[raw] ??
      (FACTURAPI_ENUM.has(raw) ? raw : null);
    if (!periodicity) {
      const msg =
        `Periodicidad global inválida: "${raw}". Debe ser código SAT 01-05.`;
      return invalid(400, msg);
    }
    payload.global = {
      periodicity,
      months: String(inv.global_months),
      year: Number(inv.global_year),
    };
  }

  return { ok: true, payload };
}
