// Pure handler for stamp-credit-note, deps-injected for testability.
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";
import { handleCors } from "../_shared/cors.ts";
import {
  createRequestDiagnostics,
  type EdgeDiagnostics,
} from "../_shared/edgeDiagnostics.ts";
import { jsonResponse } from "../_shared/http.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  claimAndValidateCreditNoteSource,
  type JsonResponder,
} from "./creditNoteClaimAndSource.ts";
import {
  executeCreditNotePacStamp,
  finalizeStampedCreditNote,
} from "./creditNotePacAndPersistence.ts";
import {
  buildCreditNotePayload,
  resolveCreditNoteFiscalConfig,
} from "./creditNotePayload.ts";

export type { SupabaseLike };

export interface StampCreditNoteDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (k: string) => string | undefined;
  diagnostics?: EdgeDiagnostics;
}

async function compensateCreditNoteCrash(params: {
  claimed: boolean;
  supabase: SupabaseLike | null;
  creditNoteId: unknown;
  pacAccepted: boolean;
  emittedFacturapiId: string | null;
  emittedCfdiUuid: string | null;
}): Promise<void> {
  const {
    claimed,
    supabase,
    creditNoteId,
    pacAccepted,
    emittedFacturapiId,
    emittedCfdiUuid,
  } = params;
  if (!claimed || !supabase || !creditNoteId) return;

  try {
    if (pacAccepted) {
      await supabase
        .from("credit_notes")
        .update({
          ...(emittedFacturapiId
            ? { facturapi_invoice_id: emittedFacturapiId }
            : {}),
          ...(emittedCfdiUuid ? { cfdi_uuid: emittedCfdiUuid } : {}),
          cfdi_error_message: emittedCfdiUuid
            ? "CFDI timbrado en Facturapi pero la persistencia local falló. Pendiente de reconciliación automática."
            : "Facturapi aceptó la NC sin UUID; la persistencia local falló. Pendiente de reconciliación automática.",
        })
        .eq("id", creditNoteId)
        .eq("cfdi_status", "stamping");
    } else {
      await supabase
        .from("credit_notes")
        .update({
          cfdi_status: "error",
          cfdi_error_message: "Internal error during stamping",
        })
        .eq("id", creditNoteId)
        .eq("cfdi_status", "stamping");
    }
  } catch (releaseErr) {
    console.error("[stamp-credit-note] release-on-exception failed", {
      credit_note_id: creditNoteId,
      err: releaseErr instanceof Error
        ? releaseErr.message
        : String(releaseErr),
    });
  }
}

export async function handleStampCreditNote(
  req: Request,
  deps: StampCreditNoteDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json: JsonResponder = (body, status) =>
    jsonResponse(req, body, { status });
  const diag = createRequestDiagnostics(deps.diagnostics);

  let creditNoteId: unknown = undefined;
  let userId: string | undefined = undefined;
  let supabaseRef: SupabaseLike | null = null;
  let claimed = false;
  let pacAccepted = false;
  let emittedFacturapiId: string | null = null;
  let emittedCfdiUuid: string | null = null;

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[stamp-credit-note]",
    });
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    diag.authenticated({
      userId: auth.userId,
      role: auth.isServiceRole ? "service_role" : auth.role,
    });
    userId = auth.userId;
    const supabase = auth.supabase;
    supabaseRef = supabase;

    const body = await req.json().catch(() => null);
    creditNoteId = body?.credit_note_id;

    const claimedRes = await claimAndValidateCreditNoteSource({
      supabase,
      creditNoteIdRaw: creditNoteId,
      userId,
      isServiceRole: auth.isServiceRole,
      json,
      onClaimed: () => {
        claimed = true;
      },
    });
    if (!claimedRes.ok) return claimedRes.response;

    const {
      creditNoteId: validId,
      initialNcRow,
      ncRow,
      inv,
      organizationId,
      sourceLines,
      releaseClaim,
    } = claimedRes.data;
    diag.organization(organizationId);

    const fiscalCfg = await resolveCreditNoteFiscalConfig({
      supabase,
      env: deps.env,
      organizationId,
      creditNoteId: validId,
      releaseClaim,
      json,
    });
    if (!fiscalCfg.ok) return fiscalCfg.response;

    const built = await buildCreditNotePayload({
      creditNoteId: validId,
      ncRow,
      inv,
      sourceLines,
      releaseClaim,
      json,
    });
    if (!built.ok) return built.response;

    const pacExec = await executeCreditNotePacStamp({
      req,
      supabase,
      apiKey: fiscalCfg.apiKey,
      creditNoteId: validId,
      payload: built.payload,
      json,
      onPacAccepted: (fId, uuid) => {
        pacAccepted = true;
        emittedFacturapiId = fId;
        emittedCfdiUuid = uuid;
      },
    });
    if (!pacExec.ok) return pacExec.response;

    return await finalizeStampedCreditNote({
      supabase,
      creditNoteId: validId,
      initialNcRow,
      ncRow,
      hit: pacExec.hit,
      json,
    });
  } catch (err) {
    diag.capture(
      err,
      pacAccepted ? 502 : 500,
      pacAccepted
        ? "credit_note_post_stamp_persistence"
        : "stamp_credit_note_unhandled",
    );
    console.error("[stamp-credit-note] unhandled exception", {
      credit_note_id: creditNoteId,
      userId,
      pacAccepted,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await compensateCreditNoteCrash({
      claimed,
      supabase: supabaseRef,
      creditNoteId,
      pacAccepted,
      emittedFacturapiId,
      emittedCfdiUuid,
    });
    return buildCreditNoteCrashResponse(json, pacAccepted, emittedCfdiUuid);
  }
}

function buildCreditNoteCrashResponse(
  json: JsonResponder,
  pacAccepted: boolean,
  emittedCfdiUuid: string | null,
): Response {
  if (!pacAccepted) return json({ error: "Internal server error" }, 500);
  return json({
    error: emittedCfdiUuid
      ? "El CFDI se timbró pero ocurrió un error interno al finalizar. Se reconciliará automáticamente; no reintentes el timbrado manualmente."
      : "Facturapi aceptó la NC sin UUID, pero ocurrió un error interno al guardar. Se reconciliará automáticamente; no reintentes el timbrado manualmente.",
    reconciling: true,
  }, 502);
}
