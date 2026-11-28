// Pure handler for stamp-cfdi, deps-injected for testability.
// The Deno.serve entry wires Supabase, the invoice PAC gateway and env.
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";
import { handleCors } from "../_shared/cors.ts";
import {
  createRequestDiagnostics,
  type EdgeDiagnostics,
} from "../_shared/edgeDiagnostics.ts";
import { jsonResponse } from "../_shared/http.ts";
import { computeStampVariance } from "../_shared/money.ts";
import { stampOutcome } from "../_shared/stampOutcome.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { resolveStampFiscalConfig } from "./companyFiscalConfig.ts";
import type { InvoiceGateway } from "./invoiceGateway.ts";
import { buildInvoicePayload } from "./invoicePayload.ts";
import { executePacStamp } from "./pacExecution.ts";
import { finalizeStampedInvoice } from "./postStampPersistence.ts";
import {
  type JsonResponder,
  validateAndClaimInvoice,
} from "./preStampValidation.ts";

// Re-exports usados por las pruebas y por cancel-payment-complement.
export { computeStampVariance };
export type { SupabaseLike };

export interface StampCfdiDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  createInvoiceGateway: (apiKey: string) => InvoiceGateway;
  env: (key: string) => string | undefined;
  diagnostics?: EdgeDiagnostics;
}

async function releaseClaimAfterCrash(
  supabase: SupabaseLike | null,
  invoiceId: string | null,
  shouldRelease: boolean,
): Promise<void> {
  if (!shouldRelease || !supabase || !invoiceId) return;
  try {
    await supabase
      .from("invoices")
      .update({
        cfdi_status: "error",
        cfdi_error_message: "Internal error during stamping",
      })
      .eq("id", invoiceId);
  } catch (releaseErr) {
    console.error("[stamp-cfdi] release-on-exception failed", {
      invoice_id: invoiceId,
      err: releaseErr instanceof Error
        ? releaseErr.message
        : String(releaseErr),
    });
  }
}

export async function handleStampCfdi(
  req: Request,
  deps: StampCfdiDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json: JsonResponder = (body, status) =>
    jsonResponse(req, body, { status });
  const diag = createRequestDiagnostics(deps.diagnostics);

  let supabaseRef: SupabaseLike | null = null;
  let invoiceIdRef: string | null = null;
  let claimed = false;
  let providerResponded = false;
  let recoveryReferenceSaved = false;

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[stamp-cfdi]",
    });
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    diag.authenticated({
      userId: auth.userId,
      role: auth.isServiceRole ? "service_role" : undefined,
    });
    const supabase = auth.supabase;
    supabaseRef = supabase;

    const body = await req.json().catch(() => ({}));
    const { invoice_id } = body as { invoice_id?: unknown };

    const claimedRes = await validateAndClaimInvoice({
      supabase,
      userId: auth.userId,
      isServiceRole: auth.isServiceRole,
      invoiceIdRaw: invoice_id,
      json,
    });
    if (!claimedRes.ok) return claimedRes.response;

    const {
      invoiceId,
      inv,
      organizationId,
      saleSatContext,
      controls,
    } = claimedRes.data;
    diag.organization(organizationId);
    claimed = true;
    invoiceIdRef = invoiceId;

    const fiscalCfg = await resolveStampFiscalConfig({
      supabase,
      env: deps.env,
      organizationId,
      invoiceId,
      inv,
      body,
      isServiceRole: auth.isServiceRole,
      controls,
      json,
    });
    if (!fiscalCfg.ok) return fiscalCfg.response;

    const gateway = deps.createInvoiceGateway(fiscalCfg.apiKey);
    const built = buildInvoicePayload({
      invoiceId,
      invoice: inv,
      saleSatContext,
    });
    if (!built.ok) {
      await controls.releaseClaim(built.claimError);
      return json({ error: built.error }, built.status);
    }

    const pacExec = await executePacStamp({
      supabase,
      gateway,
      payload: built.payload,
      invoiceId,
      apiKey: fiscalCfg.apiKey,
      mode: fiscalCfg.mode,
      body,
      controls,
      json,
      onProviderResponded: () => {
        providerResponded = true;
      },
      onRecoveryReferenceSaved: () => {
        recoveryReferenceSaved = true;
      },
    });
    if (!pacExec.ok) return pacExec.response;

    return await finalizeStampedInvoice({
      supabase,
      gateway,
      invoiceId,
      organizationId,
      inv,
      mode: fiscalCfg.mode,
      stamped: pacExec.stamped,
      json,
    });
  } catch (err) {
    diag.capture(
      err,
      500,
      providerResponded ? "post_stamp_persistence" : "stamp_cfdi_unhandled",
    );
    console.error("[stamp-cfdi] unhandled exception", err);
    await releaseClaimAfterCrash(
      supabaseRef,
      invoiceIdRef,
      claimed && !providerResponded,
    );
    return json({
      error: "Internal server error",
      ...(providerResponded
        ? {
          code: "STAMP_RECOVERY_REQUIRED",
          ...stampOutcome({
            kind: "recovery_required",
            reference: recoveryReferenceSaved ? "saved" : "unconfirmed",
          }),
        }
        : {}),
    }, 500);
  }
}
