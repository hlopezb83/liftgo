// Pure handler for stamp-payment-complement, deps-injected for testability.
// Multiempresa · Fase 1: la organización se valida contra el pago leído de
// BD ANTES de cualquier claim, update o llamada al PAC.
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  createInvoiceWithSignal,
  describeFacturapiError,
  getFacturapiConfigForOrganization,
} from "../_shared/facturapi/client.ts";
import { resolveDocumentOrganization } from "../_shared/orgContext.ts";
import {
  isFacturapiTimeout,
  sdkCallWithTimeout,
} from "../_shared/facturapi/withTimeout.ts";
import { validateRfcOrMessage } from "../_shared/rfcChecksum.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";

import {
  isValidRegimenFiscalCode,
  resolveReceptorRegimenFiscal,
} from "../_shared/regimenFiscal.ts";
import {
  claimRejectionMessage,
  computeRepExchange,
  validatePaymentExchange,
  validateRelatedInvoiceExchange,
} from "./decisions.ts";
import type { SupabaseLike } from "../_shared/types.ts";

export type { SupabaseLike };

export interface StampPaymentComplementDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (k: string) => string | undefined;
}

/** Campos del pago usados por el handler (select "*", tipado mínimo). */
interface PaymentRow {
  organization_id?: string | null;
  invoice_id?: string | null;
  amount?: number | string | null;
  rep_cfdi_status?: string | null;
  payment_form_sat?: string | null;
  payment_date?: string | null;
  currency?: string | null;
  exchange_rate?: number | string | null;
}

/** Campos de la factura relacionada usados por el handler. */
interface RelatedInvoiceRow {
  id?: string | null;
  organization_id?: string | null;
  customer_id?: string | null;
  total?: number | string | null;
  tax_rate?: number | string | null;
  line_items?: unknown;
  metodo_pago?: string | null;
  moneda?: string | null;
  tipo_cambio?: number | string | null;
  cfdi_uuid?: string | null;
  cfdi_status?: string | null;
  receptor_razon_social?: string | null;
  receptor_rfc?: string | null;
  receptor_regimen_fiscal?: string | null;
  receptor_domicilio_fiscal_cp?: string | null;
  uso_cfdi?: string | null;
  customer_name?: string | null;
}

const BUCKET = "cfdi-files";
const DEFAULT_IVA_RATE = 0.16;

/**
 * Réplica exacta (sólo con clientes inyectados) de `requireRole` en
 * `_shared/auth.ts`: valida el JWT del caller y exige uno de `roles` en
 * `user_roles`. Sin bypass de service_role — este handler nunca lo tuvo y no
 * se introduce ahora (no es consumidor de la cola de reintentos).
 */
async function requireRoleDI(
  req: Request,
  deps: StampPaymentComplementDeps,
  roles: string[],
): Promise<
  | { ok: true; userId: string; supabase: SupabaseLike }
  | { ok: false; status: number; message: string }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const token = authHeader.replace("Bearer ", "");
  const callerClient = deps.createCallerClient(authHeader);
  const { data, error } = await callerClient.auth.getClaims(token);
  if (error || !data?.claims) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const userId = (data.claims as { sub?: string }).sub as string;
  if (!userId) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const supabase = deps.createServiceClient();

  const profileRes = await supabase.from("profiles").select("is_active").eq(
    "user_id",
    userId,
  ).maybeSingle();
  const profileErr = (profileRes as { error: unknown }).error;
  if (profileErr) {
    console.error(
      "[auth] profiles lookup failed, fail-closed:",
      profileErr instanceof Error ? profileErr.message : String(profileErr),
    );
    return {
      ok: false,
      status: 503,
      message:
        "Servicio de verificación de cuenta no disponible. Reintenta en unos segundos.",
    };
  }
  const profile = (profileRes as { data: unknown }).data as
    | { is_active: boolean | null }
    | null;
  if (profile && profile.is_active === false) {
    return { ok: false, status: 403, message: "Cuenta desactivada" };
  }

  const roleRes = await supabase.from("user_roles").select("role").eq(
    "user_id",
    userId,
  ).in("role", roles).maybeSingle();
  const roleData = (roleRes as { data: unknown }).data as
    | { role: string }
    | null;
  if (!roleData) {
    return { ok: false, status: 403, message: "Forbidden: insufficient role" };
  }

  return { ok: true, userId, supabase };
}

export async function handleStampPaymentComplement(
  req: Request,
  deps: StampPaymentComplementDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireRoleDI(req, deps, ["admin", "administrativo"]);
    if (!auth.ok) return jsonError(req, auth.status, auth.message);
    const supabase = auth.supabase;

    const { payment_id } = await req.json().catch(() => ({}));
    if (!isUUID(payment_id)) {
      return jsonError(req, 400, "payment_id must be a valid UUID");
    }

    // Load payment
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .single();
    if (payErr || !payment) return jsonError(req, 404, "Payment not found");
    const paymentRow = payment as PaymentRow;

    // Multiempresa · Fase 1: la organización se valida contra el pago leído
    // de BD ANTES de cualquier claim, update o llamada al PAC. requireRoleDI
    // no soporta bypass service_role, así que isServiceRole es siempre false.
    const orgCheck = await resolveDocumentOrganization({
      admin: supabase,
      userId: auth.userId,
      isServiceRole: false,
      documentOrganizationId: (paymentRow as Record<string, unknown>)
        .organization_id as string | null | undefined,
    });
    if (!orgCheck.ok) {
      console.error("[stamp-payment-complement] organization check failed", {
        payment_id,
        status: orgCheck.status,
      });
      return jsonError(req, orgCheck.status, orgCheck.message);
    }
    const organizationId = orgCheck.organizationId;

    if (paymentRow.rep_cfdi_status === "stamped") {
      return jsonError(req, 409, "Este pago ya tiene un REP timbrado");
    }
    if (!paymentRow.payment_form_sat) {
      return jsonError(req, 400, "Falta forma de pago SAT en el pago");
    }
    const STALE_CLAIM_MINUTES = 5;
    const claimRes = await (supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<
        { data: string | null; error: { message?: string } | null }
      >;
    }).rpc("claim_payment_rep_stamping", {
      p_payment_id: payment_id,
      p_stale_minutes: STALE_CLAIM_MINUTES,
    });
    if (claimRes.error) {
      console.error("[stamp-payment-complement] claim failed", {
        payment_id,
        err: claimRes.error,
      });
      return jsonError(
        req,
        503,
        `No se pudo iniciar el timbrado: ${
          claimRes.error.message ?? "error de base de datos"
        }`,
      );
    }
    if (claimRes.data !== "claimed") {
      const st = claimRes.data;
      console.warn("[stamp-payment-complement] claim rejected", {
        payment_id,
        rep_cfdi_status: st,
      });
      return jsonError(req, 409, claimRejectionMessage(st));
    }

    const preClaimStatus = String(paymentRow.rep_cfdi_status ?? "");

    const failAfterClaim = async (
      status: "pending" | "error",
      msg: string | null,
    ) => {
      await supabase
        .from("payments")
        .update({
          rep_cfdi_status: preClaimStatus === "cancelled"
            ? "cancelled"
            : status,
          rep_stamping_started_at: null,
          rep_error_message: msg,
        })
        .eq("id", payment_id);
    };

    const releaseClaim = async (msg?: string) => {
      await failAfterClaim("pending", msg ?? null);
    };

    const prepRes = await (supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<
        {
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }
      >;
    }).rpc("prepare_payment_complement", { p_payment_id: payment_id });

    if (prepRes.error || !prepRes.data) {
      const errMsg = prepRes.error?.message ??
        "No se pudo preparar el complemento";
      console.error(
        "[stamp-payment-complement] prepare_payment_complement failed",
        {
          payment_id,
          err: errMsg,
        },
      );
      await failAfterClaim("error", errMsg.slice(0, 1000));
      return jsonError(
        req,
        500,
        `No se pudo preparar el complemento: ${errMsg}`,
      );
    }

    const prep = prepRes.data;
    const installmentNumber = Number(prep.installment_number);
    const priorBalance = Number(prep.prior_balance);
    const amount = Number(
      prep.amount_in_invoice_currency ?? paymentRow.amount,
    );

    const { data: invoice } = await supabase
      .from("invoices")
      .select(
        "id, organization_id, customer_id, total, tax_rate, line_items, metodo_pago, moneda, tipo_cambio, cfdi_uuid, cfdi_status, receptor_razon_social, receptor_rfc, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, uso_cfdi, customer_name",
      )
      .eq("id", paymentRow.invoice_id)
      .single();
    if (!invoice) {
      await releaseClaim("Factura no encontrada");
      return jsonError(req, 404, "Invoice not found");
    }
    const invoiceRow = invoice as RelatedInvoiceRow;
    if (invoiceRow.metodo_pago !== "PPD") {
      await releaseClaim("Solo facturas PPD requieren REP");
      return jsonError(
        req,
        400,
        "Solo facturas PPD requieren Complemento de Pago",
      );
    }
    if (invoiceRow.cfdi_status !== "stamped" || !invoiceRow.cfdi_uuid) {
      await releaseClaim("Factura aún no timbrada");
      return jsonError(
        req,
        400,
        "La factura debe estar timbrada para generar REP",
      );
    }

    const headerRatePct = invoiceRow.tax_rate == null
      ? DEFAULT_IVA_RATE * 100
      : Number(invoiceRow.tax_rate);
    const rawLines = Array.isArray(invoiceRow.line_items)
      ? invoiceRow.line_items as Array<{
        quantity?: number;
        unit_price?: number;
        total?: number;
        objeto_imp?: string;
        tax_rate?: number;
      }>
      : [];

    let subtotalLines = 0;
    const baseByRate = new Map<string, number>();
    for (const li of rawLines) {
      const lineBase =
        Number(li.total ?? (li.quantity || 1) * (li.unit_price || 0)) || 0;
      if (lineBase <= 0) continue;
      subtotalLines += lineBase;
      if ((li.objeto_imp ?? "02") === "01") {
        baseByRate.set("exento", (baseByRate.get("exento") ?? 0) + lineBase);
      } else {
        const ratePct =
          typeof li.tax_rate === "number" && Number.isFinite(li.tax_rate)
            ? li.tax_rate
            : headerRatePct;
        const key = ratePct.toFixed(2);
        baseByRate.set(key, (baseByRate.get(key) ?? 0) + lineBase);
      }
    }

    if (subtotalLines <= 0) {
      await releaseClaim(
        "La factura no tiene partidas legibles para descomponer el IVA del complemento",
      );
      return jsonError(
        req,
        422,
        "Invoice without line items for REP tax breakdown",
      );
    }

    const taxes: Array<
      { base: number; type: "IVA"; rate: number; factor: "Tasa" }
    > = [];
    let assignedCents = 0;
    const amountCents = Math.round(amount * 100);
    const groups = [...baseByRate.entries()];
    groups.forEach(([key, groupBase], idx) => {
      const shareCents = idx === groups.length - 1
        ? amountCents - assignedCents
        : Math.round(amountCents * (groupBase / subtotalLines));
      assignedCents += shareCents;
      if (key === "exento") return;
      const rate = Number((Number(key) / 100).toFixed(6));
      const baseCents = rate > 0
        ? Math.round(shareCents / (1 + rate))
        : shareCents;
      taxes.push({ base: baseCents / 100, type: "IVA", rate, factor: "Tasa" });
    });

    const { apiKey } = await getFacturapiConfigForOrganization({
      admin: supabase,
      env: deps.env,
      organizationId,
    });
    if (!apiKey) {
      await releaseClaim("Facturapi key no configurada para esta empresa");
      return jsonError(
        req,
        400,
        "Facturapi key not configured for this organization",
      );
    }

    const paymentDateIso = `${paymentRow.payment_date}T12:00:00`;
    const paymentCurrency = (paymentRow.currency as string | null) || "MXN";
    const exchangeCheck = validatePaymentExchange({
      paymentCurrency,
      exchangeRate: paymentRow.exchange_rate,
    });
    if (!exchangeCheck.ok) {
      await releaseClaim("Tipo de cambio inválido para moneda extranjera");
      return jsonError(req, 422, exchangeCheck.message);
    }
    const paymentExchange = paymentCurrency === "MXN"
      ? 1
      : Number(paymentRow.exchange_rate);

    const relatedCheck = validateRelatedInvoiceExchange({
      paymentCurrency,
      invoiceCurrency: invoiceRow.moneda as string | null,
      invoiceTipoCambio: invoiceRow.tipo_cambio as number | string | null,
      paymentExchangeRate: paymentRow.exchange_rate as number | string | null,
    });
    if (!relatedCheck.ok) {
      await releaseClaim("Tipo de cambio inválido en la factura relacionada");
      return jsonError(req, 422, relatedCheck.message);
    }

    const { invoiceCurrency, invoiceExchange } = computeRepExchange({
      paymentCurrency,
      invoiceCurrency: invoiceRow.moneda as string | null,
      invoiceTipoCambio: invoiceRow.tipo_cambio as number | string | null,
      paymentExchangeRate: paymentRow.exchange_rate as number | string | null,
    });

    const relatedDoc: Record<string, unknown> = {
      uuid: invoiceRow.cfdi_uuid,
      amount,
      installment: installmentNumber,
      last_balance: priorBalance,
      currency: invoiceCurrency,
      exchange: invoiceExchange,
    };

    if (taxes.length > 0) {
      relatedDoc.taxes = taxes;
    }

    const dataEntry: Record<string, unknown> = {
      payment_form: paymentRow.payment_form_sat,
      date: paymentDateIso,
      related_documents: [relatedDoc],
    };
    if (paymentCurrency !== "MXN") {
      dataEntry.currency = paymentCurrency;
      dataEntry.exchange = paymentExchange;
    }

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
      await releaseClaim(repRfcError);
      return jsonError(req, 400, repRfcError);
    }
    if (!repIsGlobal && (!repTaxSystem || !repZip)) {
      const missing = [
        !repTaxSystem ? "régimen fiscal del receptor" : null,
        !repZip ? "código postal fiscal del receptor" : null,
      ].filter(Boolean).join(", ");
      const msg =
        `Faltan datos fiscales del receptor: ${missing}. Captúralos en el cliente o en la factura antes de timbrar el complemento de pago.`;
      await releaseClaim(msg);
      return jsonError(req, 400, msg);
    }
    if (!repIsGlobal && !isValidRegimenFiscalCode(repTaxSystem)) {
      const msg =
        `El régimen fiscal del receptor "${repTaxSystem}" no es un código válido del catálogo del SAT (c_RegimenFiscal). Debe ser el código de 3 dígitos, p. ej. "601". Corrígelo en la factura antes de timbrar el complemento de pago.`;
      await releaseClaim(msg);
      return jsonError(req, 422, msg);
    }

    const repLegalName = repIsGlobal ? "PUBLICO EN GENERAL" : sanitizeLegalName(
      String(
        invoiceRow.receptor_razon_social ?? invoiceRow.customer_name ?? "",
      ),
    );
    if (!repIsGlobal && !repLegalName) {
      const msg =
        "Falta la razón social del receptor. Captúrala en el cliente o en la factura, tal como está registrada en el SAT, antes de timbrar el complemento de pago.";
      await releaseClaim(msg);
      return jsonError(req, 400, msg);
    }

    const payload = {
      type: "P",
      external_id: payment_id as string,
      customer: {
        legal_name: repLegalName,
        tax_id: repTaxId,
        tax_system: repTaxSystem,
        address: { zip: repZip },
      },
      complements: [{ type: "pago", data: [dataEntry] }],
    };

    const client = createFacturapiClient(apiKey);
    let repInvoice: {
      id: string;
      uuid: string;
      folio_number?: number | string | null;
    };
    try {
      repInvoice = await sdkCallWithTimeout((signal) =>
        createInvoiceWithSignal(client, payload, { signal })
      ) as {
        id: string;
        uuid: string;
        folio_number?: number | string | null;
      };
    } catch (err) {
      if (isFacturapiTimeout(err)) {
        console.warn("[stamp-payment-complement] facturapi timeout", {
          payment_id,
        });
        return jsonResponse(req, {
          error: "PAC no respondió a tiempo, reintenta",
          code: "TIMEOUT",
          transient: true,
        }, { status: 504 });
      }
      const desc = describeFacturapiError(err);
      console.error("Facturapi REP create error:", desc.detail);
      await failAfterClaim("error", desc.detail.slice(0, 1000));
      return jsonError(
        req,
        502,
        desc.message || `Facturapi error: ${desc.status}`,
        {
          detail: desc.detail,
        },
      );
    }

    const repId = repInvoice.id;
    const repUuid = repInvoice.uuid;

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;

    try {
      const xmlTxt = await binaryToText(
        await client.invoices.downloadXml(repId),
      );
      const p = organizationStoragePath(
        invoiceRow.organization_id,
        `${invoiceRow.id}/rep-${repUuid}.xml`,
      );
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        p,
        new Blob([xmlTxt], { type: "application/xml" }),
        { contentType: "application/xml", upsert: true },
      );
      if (!upErr) xmlPath = p;
    } catch (e) {
      console.error("REP XML download failed:", e);
    }

    try {
      const pdfBytes = await binaryToBytes(
        await client.invoices.downloadPdf(repId),
      );
      const p = organizationStoragePath(
        invoiceRow.organization_id,
        `${invoiceRow.id}/rep-${repUuid}.pdf`,
      );
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        p,
        pdfBytes,
        { contentType: "application/pdf", upsert: true },
      );
      if (!upErr) pdfPath = p;
    } catch (e) {
      console.error("REP PDF download failed:", e);
    }

    const { error: updErr } = await supabase
      .from("payments")
      .update({
        installment_number: installmentNumber,
        prior_balance: priorBalance,
        rep_facturapi_id: repId,
        rep_cfdi_uuid: repUuid,
        rep_cfdi_status: "stamped",
        rep_stamping_started_at: null,
        rep_xml_url: xmlPath,
        rep_pdf_url: pdfPath,
        rep_error_message: null,
      })
      .eq("id", payment_id);

    if (updErr) {
      console.error("DB update error after REP stamp:", updErr);
      return jsonError(req, 500, "REP timbrado pero no se pudo guardar en DB");
    }

    let repNumber: string | null = null;
    const facturApiFolioRaw = repInvoice.folio_number ?? null;
    const facturApiFolio: string | null = facturApiFolioRaw !== null &&
        facturApiFolioRaw !== undefined
      ? String(facturApiFolioRaw)
      : null;

    if (facturApiFolio) {
      const rpcRes = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      }).rpc("assign_stamped_rep_number", {
        p_payment_id: payment_id,
        p_folio: facturApiFolio,
      });
      if (rpcRes.error) {
        console.error(
          "[stamp-payment-complement] assign_stamped_rep_number failed",
          { payment_id, err: rpcRes.error.message },
        );
      } else {
        repNumber = rpcRes.data as string;
      }
    }

    return jsonResponse(req, {
      success: true,
      rep_cfdi_uuid: repUuid,
      rep_facturapi_id: repId,
      rep_number: repNumber,
      installment_number: installmentNumber,
    });
  } catch (err) {
    console.error("stamp-payment-complement error:", err);
    return jsonError(req, 500, "Internal server error");
  }
}
