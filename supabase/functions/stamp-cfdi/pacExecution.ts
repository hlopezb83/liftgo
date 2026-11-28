import {
  enqueueCfdiRetry,
  isTransientFacturapiError,
} from "../_shared/cfdiRetryQueue.ts";
import { describeFacturapiError } from "../_shared/facturapi/client.ts";
import { classifyPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import { stampOutcome } from "../_shared/stampOutcome.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { InvoiceGateway } from "./invoiceGateway.ts";
import type { ClaimControls, JsonResponder } from "./preStampValidation.ts";

const FACTURAPI_TIMEOUT_MS = 30_000;

export interface PacStampSuccess {
  facturApiInvoice: Record<string, unknown>;
  facturApiId: string;
  cfdiUuid: string;
  facturApiSeries: string | null;
  facturApiFolio: string | null;
}

async function createPacInvoiceWithTimeout(
  gateway: InvoiceGateway,
  payload: Record<string, unknown>,
): Promise<{ id: string; uuid?: string; status?: string }> {
  const stampAbort = new AbortController();
  let rejectOnTimeout: ((err: unknown) => void) | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectOnTimeout = reject;
  });
  const stampTimeoutId = setTimeout(() => {
    stampAbort.abort(new Error("Facturapi request timed out"));
    rejectOnTimeout?.(
      Object.assign(new Error("Facturapi request timed out"), {
        status: 504,
        code: "TIMEOUT",
      }),
    );
  }, FACTURAPI_TIMEOUT_MS);
  try {
    return (await Promise.race([
      gateway.create(payload, { signal: stampAbort.signal }),
      timeoutPromise,
    ])) as { id: string; uuid?: string; status?: string };
  } finally {
    clearTimeout(stampTimeoutId);
  }
}

async function handlePacCreateError(params: {
  err: unknown;
  supabase: SupabaseLike;
  invoiceId: string;
  apiKey: string;
  mode: string;
  body: unknown;
  json: JsonResponder;
}): Promise<Response> {
  const { err, supabase, invoiceId, apiKey, mode, body, json } = params;
  const desc = describeFacturapiError(err);
  const isTimeout = (desc as { code?: string }).code === "TIMEOUT" ||
    (err as { code?: string })?.code === "TIMEOUT";
  console.error("[stamp-cfdi] facturapi rejected", {
    invoice_id: invoiceId,
    status: desc.status,
    code: desc.code,
    message: desc.message,
    timeout: isTimeout,
  });
  if (isTimeout) {
    return json({
      error: "Facturapi timeout — reconciliación en curso",
      code: "TIMEOUT",
      status: 504,
      detail: desc.detail,
      transient: true,
      ...stampOutcome({
        kind: "recovery_required",
        reference: "unconfirmed",
      }),
    }, 504);
  }
  await supabase
    .from("invoices")
    .update({
      cfdi_status: "error",
      cfdi_error_message: desc.detail.slice(0, 1000),
    })
    .eq("id", invoiceId);

  const transient = isTransientFacturapiError(desc);
  if (transient) {
    await enqueueCfdiRetry(supabase, {
      operation: "stamp",
      fiscalConfig: { apiKey, mode },
      invoiceId,
      payload: { body },
      errorMessage: `${desc.code ?? ""} ${desc.message}`.trim(),
    });
  }
  const errorText = desc.code ? `${desc.code}: ${desc.message}` : desc.message;
  return json({
    error: errorText,
    code: desc.code,
    status: desc.status,
    detail: desc.detail,
    transient,
  }, 502);
}

async function handleNonHitPacResult(params: {
  pacResult: Exclude<ReturnType<typeof classifyPacInvoice>, { kind: "hit" }>;
  rawInvoiceId: unknown;
  mode: string;
  controls: ClaimControls;
  json: JsonResponder;
}): Promise<Response> {
  const { pacResult, rawInvoiceId, mode, controls, json } = params;
  const facturapiId = "facturapi_id" in pacResult
    ? pacResult.facturapi_id
    : typeof rawInvoiceId === "string"
    ? rawInvoiceId
    : null;
  const isPending = pacResult.kind === "pending";
  const saved = await controls.saveClaim({
    ...(facturapiId ? { facturapi_invoice_id: facturapiId } : {}),
    facturapi_env: mode === "live" ? "live" : "test",
    cfdi_status: pacResult.kind === "failed" ? "error" : "stamping",
    cfdi_error_message: isPending
      ? "Facturapi aceptó el CFDI; timbrado pendiente de resolución."
      : "Respuesta de Facturapi sin UUID válido. Revisar antes de reemitir.",
  });
  if (!saved) return controls.unconfirmedRecovery();
  return json(
    {
      error: isPending
        ? "Facturapi aceptó el CFDI; timbrado pendiente de resolución."
        : "Facturapi no devolvió un UUID válido; requiere conciliación.",
      code: isPending ? "PAC_PENDING" : "PAC_INCOMPLETE",
      ...(facturapiId ? { facturapi_invoice_id: facturapiId } : {}),
      ...stampOutcome(
        pacResult.kind === "failed" ? { kind: "rejected" } : {
          kind: "recovery_required",
          reference: facturapiId ? "saved" : "unconfirmed",
        },
      ),
    },
    isPending ? 202 : 502,
  );
}

export async function executePacStamp(params: {
  supabase: SupabaseLike;
  gateway: InvoiceGateway;
  payload: Record<string, unknown>;
  invoiceId: string;
  apiKey: string;
  mode: string;
  body: unknown;
  controls: ClaimControls;
  json: JsonResponder;
  onProviderResponded: () => void;
  onRecoveryReferenceSaved: () => void;
}): Promise<
  { ok: false; response: Response } | { ok: true; stamped: PacStampSuccess }
> {
  const {
    supabase,
    gateway,
    payload,
    invoiceId,
    apiKey,
    mode,
    body,
    controls,
    json,
    onProviderResponded,
    onRecoveryReferenceSaved,
  } = params;

  let facturApiInvoice: { id: string; uuid?: string; status?: string };
  try {
    facturApiInvoice = await createPacInvoiceWithTimeout(gateway, payload);
  } catch (err) {
    return {
      ok: false,
      response: await handlePacCreateError({
        err,
        supabase,
        invoiceId,
        apiKey,
        mode,
        body,
        json,
      }),
    };
  }

  onProviderResponded();
  const pacResult = classifyPacInvoice(facturApiInvoice);
  if (pacResult.kind !== "hit") {
    return {
      ok: false,
      response: await handleNonHitPacResult({
        pacResult,
        rawInvoiceId: facturApiInvoice.id,
        mode,
        controls,
        json,
      }),
    };
  }

  const savedRef = await controls.saveClaim({
    facturapi_invoice_id: pacResult.facturapi_id,
    cfdi_uuid: pacResult.uuid,
    facturapi_env: mode === "live" ? "live" : "test",
  });
  if (!savedRef) {
    return { ok: false, response: controls.unconfirmedRecovery() };
  }
  onRecoveryReferenceSaved();

  const rawRec = facturApiInvoice as Record<string, unknown>;
  const facturApiSeries = (rawRec.series as string | null | undefined) ?? null;
  const folioRaw = rawRec.folio_number as number | string | null | undefined;
  const facturApiFolio = folioRaw !== null && folioRaw !== undefined
    ? String(folioRaw)
    : null;

  return {
    ok: true,
    stamped: {
      facturApiInvoice: rawRec,
      facturApiId: pacResult.facturapi_id,
      cfdiUuid: pacResult.uuid,
      facturApiSeries,
      facturApiFolio,
    },
  };
}
