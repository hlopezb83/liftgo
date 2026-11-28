import {
  createFacturapiClient,
  createInvoiceWithSignal,
  describeFacturapiError,
  type FacturapiClient,
} from "../_shared/facturapi/client.ts";
import { classifyPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import {
  isFacturapiTimeout,
  sdkCallWithTimeout,
} from "../_shared/facturapi/withTimeout.ts";
import { jsonResponse } from "../_shared/http.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  archiveCreditNoteFiles,
  evaluateCreditNoteVariance,
  promoteCreditNoteFolioIfNeeded,
} from "./creditNoteArchive.ts";
import type { JsonResponder } from "./creditNoteClaimAndSource.ts";

export interface PacCreditNoteHit {
  client: FacturapiClient;
  rawPacDoc: {
    id: string;
    uuid?: string;
    status?: string;
    folio_number?: number | string | null;
    total?: unknown;
  };
  facturApiId: string;
  cfdiUuid: string;
}

export async function executeCreditNotePacStamp(params: {
  req: Request;
  supabase: SupabaseLike;
  apiKey: string;
  creditNoteId: string;
  payload: Record<string, unknown>;
  json: JsonResponder;
  onPacAccepted: (facturapiId: string | null, cfdiUuid: string | null) => void;
}): Promise<
  { ok: false; response: Response } | { ok: true; hit: PacCreditNoteHit }
> {
  const { req, supabase, apiKey, creditNoteId, payload, json, onPacAccepted } =
    params;
  const client = createFacturapiClient(apiKey);

  let fa: PacCreditNoteHit["rawPacDoc"];
  try {
    fa = (await sdkCallWithTimeout((signal) =>
      createInvoiceWithSignal(client, payload, { signal })
    )) as PacCreditNoteHit["rawPacDoc"];
  } catch (err) {
    if (isFacturapiTimeout(err)) {
      console.warn("[stamp-credit-note] facturapi timeout", {
        credit_note_id: creditNoteId,
      });
      return {
        ok: false,
        response: jsonResponse(
          req,
          {
            error: "PAC no respondió a tiempo, reintenta",
            code: "TIMEOUT",
            transient: true,
          },
          { status: 504 },
        ),
      };
    }
    const desc = describeFacturapiError(err);
    console.error("[stamp-credit-note] facturapi rejected", {
      credit_note_id: creditNoteId,
      status: desc.status,
      code: desc.code,
      message: desc.message,
    });
    await supabase
      .from("credit_notes")
      .update({
        cfdi_status: "error",
        cfdi_error_message: desc.detail.slice(0, 1000),
      })
      .eq("id", creditNoteId)
      .eq("cfdi_status", "stamping");
    return {
      ok: false,
      response: json(
        { error: `Facturapi error: ${desc.status}`, detail: desc.detail },
        502,
      ),
    };
  }

  const emittedFacturapiId = typeof fa?.id === "string" ? fa.id : null;
  const emittedCfdiUuid = typeof fa?.uuid === "string" ? fa.uuid : null;
  onPacAccepted(emittedFacturapiId, emittedCfdiUuid);

  const pacResult = classifyPacInvoice(fa);
  if (pacResult.kind !== "hit") {
    const isPending = pacResult.kind === "pending";
    await supabase
      .from("credit_notes")
      .update({
        ...(emittedFacturapiId
          ? { facturapi_invoice_id: emittedFacturapiId }
          : {}),
        cfdi_status: pacResult.kind === "failed" ? "error" : "stamping",
        cfdi_error_message: isPending
          ? "Facturapi aceptó la NC; timbrado pendiente de resolución."
          : "Respuesta de Facturapi sin UUID válido. Revisar antes de reemitir.",
      })
      .eq("id", creditNoteId)
      .eq("cfdi_status", "stamping");
    return {
      ok: false,
      response: json(
        {
          error: isPending
            ? "Facturapi aceptó la NC; timbrado pendiente de resolución."
            : "Facturapi no devolvió un UUID válido; requiere conciliación.",
          code: isPending ? "PAC_PENDING" : "PAC_INCOMPLETE",
        },
        isPending ? 202 : 502,
      ),
    };
  }

  return {
    ok: true,
    hit: {
      client,
      rawPacDoc: fa,
      facturApiId: pacResult.facturapi_id,
      cfdiUuid: pacResult.uuid,
    },
  };
}

export async function finalizeStampedCreditNote(params: {
  supabase: SupabaseLike;
  creditNoteId: string;
  initialNcRow: Record<string, unknown>;
  ncRow: Record<string, unknown>;
  hit: PacCreditNoteHit;
  json: JsonResponder;
}): Promise<Response> {
  const { supabase, creditNoteId, initialNcRow, ncRow, hit, json } = params;
  const { client, rawPacDoc, facturApiId, cfdiUuid } = hit;

  const { xmlPath, pdfPath } = await archiveCreditNoteFiles({
    supabase,
    client,
    organizationIdRaw: initialNcRow.organization_id,
    creditNoteId,
    facturApiId,
    cfdiUuid,
  });

  const { varianceCheck, hasVariance, varianceMessage } =
    evaluateCreditNoteVariance(creditNoteId, ncRow.total, rawPacDoc.total);

  const updRes = await supabase
    .from("credit_notes")
    .update({
      facturapi_invoice_id: facturApiId,
      cfdi_uuid: cfdiUuid,
      cfdi_status: hasVariance ? "error" : "stamped",
      ...(hasVariance ? {} : { status: "stamped" }),
      cfdi_xml_url: xmlPath,
      cfdi_pdf_url: pdfPath,
      cfdi_error_message: varianceMessage,
      ...(varianceCheck
        ? {
          stamp_variance: varianceCheck.variance,
          stamp_variance_checked_at: new Date().toISOString(),
        }
        : {}),
    })
    .eq("id", creditNoteId)
    .eq("cfdi_status", "stamping");

  const updErr = (updRes as { error: unknown }).error;
  if (updErr) {
    console.error("[stamp-credit-note] DB update failed after stamp", {
      credit_note_id: creditNoteId,
      cfdiUuid,
      facturApiId,
    });
    return json({
      error:
        "El CFDI se timbró pero no se pudo guardar en la base de datos. Se reconciliará automáticamente; no reintentes el timbrado manualmente.",
      cfdi_uuid: cfdiUuid,
      reconciling: true,
    }, 502);
  }

  if (hasVariance) {
    return json({
      error: varianceMessage ??
        "Stamp variance exceeds tolerance; credit note not stamped",
      cfdi_uuid: cfdiUuid,
    }, 502);
  }

  const currentNcNum = (ncRow.credit_note_number as string | null) ?? null;
  const finalCreditNoteNumber = await promoteCreditNoteFolioIfNeeded(
    supabase,
    creditNoteId,
    currentNcNum,
    rawPacDoc.folio_number,
  );

  return json({
    success: true,
    cfdi_uuid: cfdiUuid,
    facturapi_invoice_id: facturApiId,
    credit_note_number: finalCreditNoteNumber ?? currentNcNum,
  }, 200);
}
