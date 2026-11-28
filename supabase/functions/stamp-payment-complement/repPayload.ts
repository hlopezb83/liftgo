import { jsonError } from "../_shared/http.ts";
import {
  isValidRegimenFiscalCode,
  resolveReceptorRegimenFiscal,
} from "../_shared/regimenFiscal.ts";
import { validateRfcOrMessage } from "../_shared/rfcChecksum.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import {
  computeRepExchange,
  validatePaymentExchange,
  validateRelatedInvoiceExchange,
} from "./decisions.ts";
import type {
  PreparedRepContext,
  RelatedInvoiceRow,
  RepClaimControls,
} from "./repPreparation.ts";

function checkNamedRepFields(
  repTaxSystem: string,
  repZip: string,
  repLegalName: string,
): { status: 400 | 422; message: string } | null {
  if (!repTaxSystem || !repZip) {
    const missing = [
      !repTaxSystem ? "régimen fiscal del receptor" : null,
      !repZip ? "código postal fiscal del receptor" : null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      status: 400,
      message:
        `Faltan datos fiscales del receptor: ${missing}. Captúralos en el cliente o en la factura antes de timbrar el complemento de pago.`,
    };
  }
  if (!isValidRegimenFiscalCode(repTaxSystem)) {
    return {
      status: 422,
      message:
        `El régimen fiscal del receptor "${repTaxSystem}" no es un código válido del catálogo del SAT (c_RegimenFiscal). Debe ser el código de 3 dígitos, p. ej. "601". Corrígelo en la factura antes de timbrar el complemento de pago.`,
    };
  }
  if (!repLegalName) {
    return {
      status: 400,
      message:
        "Falta la razón social del receptor. Captúrala en el cliente o en la factura, tal como está registrada en el SAT, antes de timbrar el complemento de pago.",
    };
  }
  return null;
}

async function resolveAndValidateRepCustomer(
  req: Request,
  invoiceRow: RelatedInvoiceRow,
  controls: RepClaimControls,
): Promise<
  | { ok: false; response: Response }
  | {
    ok: true;
    customer: {
      legal_name: string;
      tax_id: string;
      tax_system: string;
      address: { zip: string };
    };
  }
> {
  const repTaxId = String(invoiceRow.receptor_rfc || "XAXX010101000")
    .toUpperCase();
  const repIsGlobal = repTaxId === "XAXX010101000";
  const repTaxSystem = resolveReceptorRegimenFiscal(
    repIsGlobal,
    invoiceRow.receptor_regimen_fiscal,
  );
  const repZip = repIsGlobal
    ? String(invoiceRow.receptor_domicilio_fiscal_cp || "06600")
    : String(invoiceRow.receptor_domicilio_fiscal_cp ?? "").trim();

  const repRfcError = validateRfcOrMessage(repTaxId);
  if (repRfcError) {
    await controls.releaseClaim(repRfcError);
    return { ok: false, response: jsonError(req, 400, repRfcError) };
  }

  const rawName = String(
    invoiceRow.receptor_razon_social ?? invoiceRow.customer_name ?? "",
  );
  const repLegalName = repIsGlobal
    ? "PUBLICO EN GENERAL"
    : sanitizeLegalName(rawName);

  if (!repIsGlobal) {
    const namedErr = checkNamedRepFields(repTaxSystem, repZip, repLegalName);
    if (namedErr) {
      await controls.releaseClaim(namedErr.message);
      return {
        ok: false,
        response: jsonError(req, namedErr.status, namedErr.message),
      };
    }
  }

  return {
    ok: true,
    customer: {
      legal_name: repLegalName,
      tax_id: repTaxId,
      tax_system: repTaxSystem,
      address: { zip: repZip },
    },
  };
}

export async function buildRepPayload(
  req: Request,
  ctx: PreparedRepContext,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; payload: Record<string, unknown> }
> {
  const {
    paymentId,
    paymentRow,
    invoiceRow,
    installmentNumber,
    priorBalance,
    amount,
    taxes,
    controls,
  } = ctx;

  const paymentDateIso = `${paymentRow.payment_date}T12:00:00`;
  const paymentCurrency = paymentRow.currency || "MXN";
  const exchangeCheck = validatePaymentExchange({
    paymentCurrency,
    exchangeRate: paymentRow.exchange_rate,
  });
  if (!exchangeCheck.ok) {
    await controls.releaseClaim(
      "Tipo de cambio inválido para moneda extranjera",
    );
    return { ok: false, response: jsonError(req, 422, exchangeCheck.message) };
  }
  const paymentExchange = paymentCurrency === "MXN"
    ? 1
    : Number(paymentRow.exchange_rate);

  const relatedCheck = validateRelatedInvoiceExchange({
    paymentCurrency,
    invoiceCurrency: invoiceRow.moneda ?? null,
    invoiceTipoCambio: invoiceRow.tipo_cambio ?? null,
    paymentExchangeRate: paymentRow.exchange_rate ?? null,
  });
  if (!relatedCheck.ok) {
    await controls.releaseClaim(
      "Tipo de cambio inválido en la factura relacionada",
    );
    return { ok: false, response: jsonError(req, 422, relatedCheck.message) };
  }

  const { invoiceCurrency, invoiceExchange } = computeRepExchange({
    paymentCurrency,
    invoiceCurrency: invoiceRow.moneda ?? null,
    invoiceTipoCambio: invoiceRow.tipo_cambio ?? null,
    paymentExchangeRate: paymentRow.exchange_rate ?? null,
  });

  const relatedDoc: Record<string, unknown> = {
    uuid: invoiceRow.cfdi_uuid,
    amount,
    installment: installmentNumber,
    last_balance: priorBalance,
    currency: invoiceCurrency,
    exchange: invoiceExchange,
  };
  if (taxes.length > 0) relatedDoc.taxes = taxes;

  const dataEntry: Record<string, unknown> = {
    payment_form: paymentRow.payment_form_sat,
    date: paymentDateIso,
    related_documents: [relatedDoc],
  };
  if (paymentCurrency !== "MXN") {
    dataEntry.currency = paymentCurrency;
    dataEntry.exchange = paymentExchange;
  }

  const customerRes = await resolveAndValidateRepCustomer(
    req,
    invoiceRow,
    controls,
  );
  if (!customerRes.ok) return customerRes;

  return {
    ok: true,
    payload: {
      type: "P",
      external_id: paymentId,
      idempotency_key: paymentId,
      customer: customerRes.customer,
      complements: [{ type: "pago", data: [dataEntry] }],
    },
  };
}
