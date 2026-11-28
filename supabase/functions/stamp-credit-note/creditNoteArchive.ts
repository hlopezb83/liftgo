import {
  binaryToBytes,
  binaryToText,
  type FacturapiClient,
} from "../_shared/facturapi/client.ts";
import { computeStampVariance } from "../_shared/money.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import type { SupabaseLike } from "../_shared/types.ts";

const BUCKET = "cfdi-files";

export async function archiveCreditNoteFiles(params: {
  supabase: SupabaseLike;
  client: FacturapiClient;
  organizationIdRaw: unknown;
  creditNoteId: string;
  facturApiId: string;
  cfdiUuid: string;
}): Promise<{ xmlPath: string | null; pdfPath: string | null }> {
  const {
    supabase,
    client,
    organizationIdRaw,
    creditNoteId,
    facturApiId,
    cfdiUuid,
  } = params;
  let xmlPath: string | null = null;
  let pdfPath: string | null = null;

  try {
    const xml = await binaryToText(
      await client.invoices.downloadXml(facturApiId),
    );
    const path = organizationStoragePath(
      organizationIdRaw,
      `credit-notes/${creditNoteId}/${cfdiUuid}.xml`,
    );
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([xml], { type: "application/xml" }), {
        contentType: "application/xml",
        upsert: true,
      });
    if (!upErr) xmlPath = path;
    else {
      console.error("[stamp-credit-note] archive xml upload failed", {
        credit_note_id: creditNoteId,
        err: upErr,
      });
    }
  } catch (e) {
    console.error("[stamp-credit-note] archive xml failed", {
      credit_note_id: creditNoteId,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const bytes = await binaryToBytes(
      await client.invoices.downloadPdf(facturApiId),
    );
    const path = organizationStoragePath(
      organizationIdRaw,
      `credit-notes/${creditNoteId}/${cfdiUuid}.pdf`,
    );
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (!upErr) pdfPath = path;
    else {
      console.error("[stamp-credit-note] archive pdf upload failed", {
        credit_note_id: creditNoteId,
        err: upErr,
      });
    }
  } catch (e) {
    console.error("[stamp-credit-note] archive pdf failed", {
      credit_note_id: creditNoteId,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  return { xmlPath, pdfPath };
}

export function evaluateCreditNoteVariance(
  creditNoteId: string,
  expectedTotal: unknown,
  stampedTotal: unknown,
) {
  const varianceCheck = computeStampVariance(expectedTotal, stampedTotal);
  const hasVariance = Boolean(varianceCheck && !varianceCheck.withinTolerance);
  const varianceMessage = hasVariance && varianceCheck
    ? `Error BL-A5: el total timbrado (${
      Number(stampedTotal).toFixed(2)
    }) difiere del total de la nota de crédito (${
      Number(expectedTotal).toFixed(2)
    }); varianza ${
      varianceCheck.variance.toFixed(2)
    }. El CFDI de egreso existe ante el SAT: cancélalo y corrige tasas/descuentos.`
    : null;
  if (hasVariance && varianceCheck) {
    console.error("[stamp-credit-note] BL-A5 stamp variance detectada", {
      credit_note_id: creditNoteId,
      credit_note_total: expectedTotal,
      stamped_total: stampedTotal,
      variance: varianceCheck.variance,
    });
  }
  return { varianceCheck, hasVariance, varianceMessage };
}

export async function promoteCreditNoteFolioIfNeeded(
  supabase: SupabaseLike,
  creditNoteId: string,
  currentNcNum: string | null,
  folioRaw: number | string | null | undefined,
): Promise<string | null> {
  const facturApiFolio = folioRaw !== null && folioRaw !== undefined
    ? String(folioRaw)
    : null;
  if (!facturApiFolio || !currentNcNum?.startsWith("BORRADOR-NC-")) {
    return null;
  }
  const rpcRes = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  }).rpc("assign_stamped_credit_note_number", {
    p_credit_note_id: creditNoteId,
    p_folio: facturApiFolio,
  });
  const rpcErr = rpcRes.error as { message?: string } | null;
  if (rpcErr) {
    console.error(
      "[stamp-credit-note] assign_stamped_credit_note_number failed",
      { credit_note_id: creditNoteId, err: rpcErr.message },
    );
    return null;
  }
  return rpcRes.data as string;
}
