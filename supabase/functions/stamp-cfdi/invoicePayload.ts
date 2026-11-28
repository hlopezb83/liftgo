import { isUsoCfdiCompatible } from "../_shared/cfdiUsoRegimen.ts";
import { buildNotesSection } from "../_shared/facturapi/notesSection.ts";
import { checkStampFx } from "../_shared/fxGate.ts";
import { roundMoney } from "../_shared/money.ts";
import {
  isValidRegimenFiscalCode,
  resolveReceptorRegimenFiscal,
} from "../_shared/regimenFiscal.ts";
import { validateRfcOrMessage } from "../_shared/rfcChecksum.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import {
  requiresExplicitSaleSat,
  type SaleSatContext,
  validateSaleSatCodes,
} from "./saleSatCodes.ts";

export type InvoicePayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | {
    ok: false;
    status: 400 | 422;
    error: string | undefined;
    claimError: string | undefined;
  };

interface RawLineItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  clave_prod_serv?: string;
  clave_unidad?: string;
  objeto_imp?: string;
  tax_rate?: number;
  discount?: number;
  discount_type?: "%" | "$";
}

interface ReceptorConfig {
  receptorRfc: string;
  isGlobal: boolean;
  paymentMethod: unknown;
  paymentForm: unknown;
  usoCfdi: string;
  legalName: string;
  taxSystem: string;
  zipCode: string;
}

const PERIODICITY_MAP: Record<string, string> = {
  "01": "day",
  "02": "week",
  "03": "fortnight",
  "04": "month",
  "05": "two_months",
};

const FACTURAPI_PERIODICITY = new Set([
  "day",
  "week",
  "fortnight",
  "month",
  "two_months",
]);

function invalid(
  status: 400 | 422,
  error: string | undefined,
  claimError = error,
): InvoicePayloadResult {
  return { ok: false, status, error, claimError };
}

function computeLineDiscount(
  li: RawLineItem,
  base: number,
): number | undefined {
  if (!li.discount || li.discount <= 0) return undefined;
  const discountPct = Math.min(100, Math.max(0, li.discount));
  const discountAmount = li.discount_type === "$"
    ? Math.min(li.discount, base)
    : (base * discountPct) / 100;
  return discountAmount > 0 ? roundMoney(discountAmount) : undefined;
}

function mapInvoiceLineItem(
  li: RawLineItem,
  taxRatePct: number,
  saleSatContext: SaleSatContext,
): Record<string, unknown> {
  const explicitSat = requiresExplicitSaleSat(li, saleSatContext);
  const quantity = li.quantity || 1;
  const unitPrice = li.unit_price || 0;
  const objetoImp = li.objeto_imp ?? "02";
  const lineRatePct =
    typeof li.tax_rate === "number" && Number.isFinite(li.tax_rate)
      ? li.tax_rate
      : taxRatePct;
  const productKey = explicitSat
    ? li.clave_prod_serv
    : li.clave_prod_serv || "78101803";
  const unitKey = explicitSat ? li.clave_unidad : li.clave_unidad || "E48";

  const item: Record<string, unknown> = {
    product: {
      description: li.description || "Servicio de renta",
      product_key: productKey,
      unit_key: unitKey,
      price: unitPrice,
      tax_included: false,
      taxes: objetoImp === "01"
        ? []
        : [{ type: "IVA", rate: lineRatePct / 100 }],
    },
    quantity,
  };
  const discount = computeLineDiscount(li, unitPrice * quantity);
  if (discount !== undefined) item.discount = discount;
  return item;
}

function resolveReceptorConfig(
  inv: Readonly<Record<string, unknown>>,
): ReceptorConfig {
  const receptorRfc = String(inv.receptor_rfc ?? "XAXX010101000")
    .toUpperCase();
  const isGlobal = receptorRfc === "XAXX010101000";
  const paymentMethod = isGlobal ? "PUE" : (inv.metodo_pago || "PUE");
  const paymentForm = isGlobal
    ? "01"
    : (paymentMethod === "PPD" ? "99" : (inv.forma_pago || "99"));
  const usoCfdi = isGlobal ? "S01" : String(inv.uso_cfdi || "G03");
  const legalName = isGlobal ? "PUBLICO EN GENERAL" : sanitizeLegalName(
    String(
      inv.receptor_razon_social ?? inv.customer_name ?? "Público General",
    ),
  );
  const taxSystem = resolveReceptorRegimenFiscal(
    isGlobal,
    inv.receptor_regimen_fiscal as string | null | undefined,
  );
  const zipCode = isGlobal
    ? String(inv.receptor_domicilio_fiscal_cp ?? "06600")
    : String(inv.receptor_domicilio_fiscal_cp ?? "");

  return {
    receptorRfc,
    isGlobal,
    paymentMethod,
    paymentForm,
    usoCfdi,
    legalName,
    taxSystem,
    zipCode,
  };
}

function validateNamedReceptor(
  cfg: ReceptorConfig,
): InvoicePayloadResult | null {
  const missingFiscal: string[] = [];
  if (!cfg.taxSystem.trim()) missingFiscal.push("régimen fiscal del receptor");
  if (!cfg.zipCode.trim()) {
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
  if (!isValidRegimenFiscalCode(cfg.taxSystem)) {
    return invalid(
      422,
      `El régimen fiscal del receptor "${cfg.taxSystem}" no es un código válido del catálogo del SAT (c_RegimenFiscal). Debe ser el código de 3 dígitos, p. ej. "601". Corrígelo en el cliente antes de timbrar.`,
    );
  }
  if (!isUsoCfdiCompatible(cfg.usoCfdi, cfg.taxSystem)) {
    return invalid(
      422,
      `El uso de CFDI "${cfg.usoCfdi}" no es válido para el régimen fiscal ${cfg.taxSystem} del receptor. Corrige el uso de CFDI del cliente o de la factura antes de timbrar.`,
    );
  }
  return null;
}

function checkMissingGlobalFields(
  inv: Readonly<Record<string, unknown>>,
): InvoicePayloadResult | null {
  const missing: string[] = [];
  if (!inv.global_periodicity) missing.push("periodicidad");
  if (!inv.global_months) missing.push("meses");
  if (!inv.global_year) missing.push("año");
  if (missing.length === 0) return null;
  return invalid(
    400,
    `Faltan datos de Información Global (Público en General): ${
      missing.join(", ")
    }. Captúralos en el formulario de la factura antes de timbrar.`,
    `Faltan datos de Información Global: ${missing.join(", ")}`,
  );
}

function buildGlobalBlock(
  inv: Readonly<Record<string, unknown>>,
):
  | { ok: true; global: Record<string, unknown> }
  | { ok: false; failure: InvoicePayloadResult } {
  const raw = String(inv.global_periodicity);
  const periodicity = PERIODICITY_MAP[raw] ??
    (FACTURAPI_PERIODICITY.has(raw) ? raw : null);
  if (!periodicity) {
    return {
      ok: false,
      failure: invalid(
        400,
        `Periodicidad global inválida: "${raw}". Debe ser código SAT 01-05.`,
      ),
    };
  }
  return {
    ok: true,
    global: {
      periodicity,
      months: String(inv.global_months),
      year: Number(inv.global_year),
    },
  };
}

function parseFolioNumber(folio: unknown): number | undefined {
  if (!folio) return undefined;
  const n = Number(folio);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Pure CFDI-I mapping and validation of the already loaded invoice snapshot.
 * Keeps existing non-sale validation order, defaults and per-line rounding.
 */
export function buildInvoicePayload(
  { invoiceId, invoice: inv, saleSatContext = {} }: {
    invoiceId: string;
    invoice: Readonly<Record<string, unknown>>;
    saleSatContext?: SaleSatContext;
  },
): InvoicePayloadResult {
  const saleSatCheck = validateSaleSatCodes(inv, saleSatContext);
  if (!saleSatCheck.ok) return invalid(422, saleSatCheck.error);

  const taxRatePct = typeof inv.tax_rate === "number" ? inv.tax_rate : 16;
  const items = Array.isArray(inv.line_items)
    ? (inv.line_items as RawLineItem[]).map((li) =>
      mapInvoiceLineItem(li, taxRatePct, saleSatContext)
    )
    : [];

  const receptor = resolveReceptorConfig(inv);
  const rfcError = validateRfcOrMessage(receptor.receptorRfc);
  if (rfcError) return invalid(400, rfcError);

  if (!receptor.isGlobal) {
    const receptorErr = validateNamedReceptor(receptor);
    if (receptorErr) return receptorErr;
  } else {
    const missingGlobal = checkMissingGlobalFields(inv);
    if (missingGlobal) return missingGlobal;
  }

  const fxGate = checkStampFx(
    inv.moneda as string | null | undefined,
    inv.tipo_cambio as number | string | null | undefined,
  );
  if (!fxGate.ok) return invalid(422, fxGate.message);

  const payload: Record<string, unknown> = {
    type: "I",
    customer: {
      legal_name: receptor.legalName,
      tax_id: receptor.receptorRfc,
      tax_system: receptor.taxSystem,
      address: { zip: receptor.zipCode },
    },
    items,
    payment_form: receptor.paymentForm,
    payment_method: receptor.paymentMethod,
    use: receptor.usoCfdi,
    currency: fxGate.currency,
    exchange: fxGate.currency === "MXN" ? 1 : fxGate.exchange,
    series: inv.serie || undefined,
    folio_number: parseFolioNumber(inv.folio),
    external_id: invoiceId,
    idempotency_key: invoiceId,
  };
  const notesSection = buildNotesSection(inv.notes);
  if (notesSection) payload.pdf_custom_section = notesSection;

  if (receptor.isGlobal) {
    const globalCheck = buildGlobalBlock(inv);
    if (!globalCheck.ok) return globalCheck.failure;
    payload.global = globalCheck.global;
  }

  return { ok: true, payload };
}
