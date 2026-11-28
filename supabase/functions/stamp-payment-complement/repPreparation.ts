import { jsonError } from "../_shared/http.ts";
import { resolveDocumentOrganization } from "../_shared/orgContext.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { isUUID } from "../_shared/validate.ts";
import { claimRejectionMessage } from "./decisions.ts";
import { loadRelatedPpdInvoiceAndConfig } from "./repInvoiceAndConfig.ts";
import type { RepTax } from "./taxBreakdown.ts";

const STALE_CLAIM_MINUTES = 5;

interface PaymentRow {
  organization_id?: string | null;
  invoice_id?: string | null;
  amount?: number | string | null;
  rep_cfdi_status?: string | null;
  rep_facturapi_id?: string | null;
  rep_cfdi_uuid?: string | null;
  payment_form_sat?: string | null;
  payment_date?: string | null;
  currency?: string | null;
  exchange_rate?: number | string | null;
}

export interface RelatedInvoiceRow {
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

export interface RepClaimControls {
  failAfterClaim: (
    status: "pending" | "error",
    msg: string | null,
  ) => Promise<void>;
  releaseClaim: (msg?: string) => Promise<void>;
}

export interface PreparedRepContext {
  paymentId: string;
  organizationId: string;
  paymentRow: PaymentRow;
  invoiceRow: RelatedInvoiceRow;
  installmentNumber: number;
  priorBalance: number;
  amount: number;
  taxes: RepTax[];
  apiKey: string;
  controls: RepClaimControls;
}

function createRepClaimControls(
  supabase: SupabaseLike,
  paymentId: string,
  preClaimStatus: string,
): RepClaimControls {
  const failAfterClaim = async (
    status: "pending" | "error",
    msg: string | null,
  ) => {
    await supabase
      .from("payments")
      .update({
        rep_cfdi_status: preClaimStatus === "cancelled" ? "cancelled" : status,
        rep_stamping_started_at: null,
        rep_error_message: msg,
      })
      .eq("id", paymentId);
  };
  return {
    failAfterClaim,
    releaseClaim: async (msg?: string) => {
      await failAfterClaim("pending", msg ?? null);
    },
  };
}

function validatePaymentRowPreClaim(
  req: Request,
  paymentRow: PaymentRow,
): Response | null {
  if (paymentRow.rep_cfdi_status === "stamped") {
    return jsonError(req, 409, "Este pago ya tiene un REP timbrado");
  }
  if (paymentRow.rep_cfdi_status === "stamping") {
    return jsonError(req, 409, claimRejectionMessage("stamping"));
  }
  if (paymentRow.rep_facturapi_id) {
    return jsonError(
      req,
      409,
      "El REP ya tiene un ID de Facturapi. Espera la conciliación o revisa su estado antes de reemitir.",
    );
  }
  if (paymentRow.rep_cfdi_uuid) {
    return jsonError(
      req,
      409,
      "Este pago ya tiene un UUID de REP. Revisa su estado antes de reemitir.",
    );
  }
  if (!paymentRow.payment_form_sat) {
    return jsonError(req, 400, "Falta forma de pago SAT en el pago");
  }
  return null;
}

async function acquireRepClaimAndInstallment(
  req: Request,
  supabase: SupabaseLike,
  paymentId: string,
  paymentRow: PaymentRow,
): Promise<
  | { ok: false; response: Response }
  | {
    ok: true;
    controls: RepClaimControls;
    installmentNumber: number;
    priorBalance: number;
    amount: number;
  }
> {
  const rpcClient = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const claimRes = await rpcClient.rpc("claim_payment_rep_stamping", {
    p_payment_id: paymentId,
    p_stale_minutes: STALE_CLAIM_MINUTES,
  });
  if (claimRes.error) {
    console.error("[stamp-payment-complement] claim failed", {
      payment_id: paymentId,
      err: claimRes.error,
    });
    return {
      ok: false,
      response: jsonError(
        req,
        503,
        `No se pudo iniciar el timbrado: ${
          claimRes.error.message ?? "error de base de datos"
        }`,
      ),
    };
  }
  if (claimRes.data !== "claimed") {
    const st = claimRes.data as string | null;
    console.warn("[stamp-payment-complement] claim rejected", {
      payment_id: paymentId,
      rep_cfdi_status: st,
    });
    return {
      ok: false,
      response: jsonError(req, 409, claimRejectionMessage(st)),
    };
  }

  const controls = createRepClaimControls(
    supabase,
    paymentId,
    String(paymentRow.rep_cfdi_status ?? ""),
  );

  const prepRes = await rpcClient.rpc("prepare_payment_complement", {
    p_payment_id: paymentId,
  });
  const prepData = prepRes.data as Record<string, unknown> | null;
  if (prepRes.error || !prepData) {
    const errMsg = prepRes.error?.message ??
      "No se pudo preparar el complemento";
    console.error(
      "[stamp-payment-complement] prepare_payment_complement failed",
      { payment_id: paymentId, err: errMsg },
    );
    await controls.failAfterClaim("error", errMsg.slice(0, 1000));
    return {
      ok: false,
      response: jsonError(
        req,
        500,
        `No se pudo preparar el complemento: ${errMsg}`,
      ),
    };
  }

  return {
    ok: true,
    controls,
    installmentNumber: Number(prepData.installment_number),
    priorBalance: Number(prepData.prior_balance),
    amount: Number(prepData.amount_in_invoice_currency ?? paymentRow.amount),
  };
}

export async function claimAndPrepareRep(params: {
  req: Request;
  supabase: SupabaseLike;
  userId: string;
  paymentIdRaw: unknown;
  env: (k: string) => string | undefined;
}): Promise<
  { ok: false; response: Response } | { ok: true; data: PreparedRepContext }
> {
  const { req, supabase, userId, paymentIdRaw, env } = params;
  if (!isUUID(paymentIdRaw)) {
    return {
      ok: false,
      response: jsonError(req, 400, "payment_id must be a valid UUID"),
    };
  }
  const paymentId = paymentIdRaw;

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();
  if (payErr || !payment) {
    return { ok: false, response: jsonError(req, 404, "Payment not found") };
  }
  const paymentRow = payment as PaymentRow;

  const orgCheck = await resolveDocumentOrganization({
    admin: supabase,
    userId,
    isServiceRole: false,
    documentOrganizationId: paymentRow.organization_id,
  });
  if (!orgCheck.ok) {
    console.error("[stamp-payment-complement] organization check failed", {
      payment_id: paymentId,
      status: orgCheck.status,
    });
    return {
      ok: false,
      response: jsonError(req, orgCheck.status, orgCheck.message),
    };
  }
  const organizationId = orgCheck.organizationId;

  const preClaimErr = validatePaymentRowPreClaim(req, paymentRow);
  if (preClaimErr) return { ok: false, response: preClaimErr };

  const claimed = await acquireRepClaimAndInstallment(
    req,
    supabase,
    paymentId,
    paymentRow,
  );
  if (!claimed.ok) return claimed;

  const invAndCfg = await loadRelatedPpdInvoiceAndConfig({
    req,
    supabase,
    organizationId,
    invoiceId: paymentRow.invoice_id,
    amount: claimed.amount,
    env,
    controls: claimed.controls,
  });
  if (!invAndCfg.ok) return invAndCfg;

  return {
    ok: true,
    data: {
      paymentId,
      organizationId,
      paymentRow,
      invoiceRow: invAndCfg.invoiceRow,
      installmentNumber: claimed.installmentNumber,
      priorBalance: claimed.priorBalance,
      amount: claimed.amount,
      taxes: invAndCfg.taxes,
      apiKey: invAndCfg.apiKey,
      controls: claimed.controls,
    },
  };
}
