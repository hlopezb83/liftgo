import {
  binaryToBytes,
  binaryToText,
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
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { assignRepFolio, repFolioPendingMessage } from "../_shared/repFolio.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { PreparedRepContext } from "./repPreparation.ts";

const BUCKET = "cfdi-files";
const AMBIGUOUS_4XX = new Set([408, 409, 425, 429]);

type RawRepDoc = {
  id: string;
  uuid?: string;
  status?: string;
  folio_number?: number | string | null;
};

async function handleRepCreateError(params: {
  req: Request;
  supabase: SupabaseLike;
  ctx: PreparedRepContext;
  err: unknown;
}): Promise<Response> {
  const { req, supabase, ctx, err } = params;
  if (isFacturapiTimeout(err)) {
    console.warn("[stamp-payment-complement] facturapi timeout", {
      payment_id: ctx.paymentId,
    });
    return jsonResponse(
      req,
      {
        error: "PAC no respondió a tiempo, reintenta",
        code: "TIMEOUT",
        transient: true,
      },
      { status: 504 },
    );
  }
  const desc = describeFacturapiError(err);
  console.error("Facturapi REP create error:", desc.detail);
  const definitiveRejection = desc.status >= 400 && desc.status < 500 &&
    !AMBIGUOUS_4XX.has(desc.status);
  if (!definitiveRejection) {
    await supabase
      .from("payments")
      .update({
        rep_error_message:
          "No se confirmó el resultado del timbrado. Se consultará al PAC antes de permitir otro intento.",
      })
      .eq("id", ctx.paymentId);
    return jsonError(
      req,
      502,
      "No se confirmó el resultado del timbrado del REP. Espera la conciliación antes de reintentar.",
      { code: "PAC_UNCERTAIN" },
    );
  }
  await ctx.controls.failAfterClaim("error", desc.detail.slice(0, 1000));
  return jsonError(
    req,
    502,
    desc.message || `Facturapi error: ${desc.status}`,
    { detail: desc.detail },
  );
}

async function archiveRepFiles(params: {
  supabase: SupabaseLike;
  client: FacturapiClient;
  organizationIdRaw: unknown;
  invoiceIdRaw: unknown;
  repId: string;
  repUuid: string;
}): Promise<{ xmlPath: string | null; pdfPath: string | null }> {
  const {
    supabase,
    client,
    organizationIdRaw,
    invoiceIdRaw,
    repId,
    repUuid,
  } = params;
  let xmlPath: string | null = null;
  let pdfPath: string | null = null;

  try {
    const xmlTxt = await binaryToText(
      await client.invoices.downloadXml(repId),
    );
    const p = organizationStoragePath(
      organizationIdRaw,
      `${invoiceIdRaw}/rep-${repUuid}.xml`,
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
      organizationIdRaw,
      `${invoiceIdRaw}/rep-${repUuid}.pdf`,
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

  return { xmlPath, pdfPath };
}

export async function executeRepPacAndPersist(params: {
  req: Request;
  supabase: SupabaseLike;
  ctx: PreparedRepContext;
  payload: Record<string, unknown>;
}): Promise<Response> {
  const { req, supabase, ctx, payload } = params;
  const client = createFacturapiClient(ctx.apiKey);

  let repInvoice: RawRepDoc;
  try {
    repInvoice = (await sdkCallWithTimeout((signal) =>
      createInvoiceWithSignal(client, payload, { signal })
    )) as RawRepDoc;
  } catch (err) {
    return await handleRepCreateError({ req, supabase, ctx, err });
  }

  const pacResult = classifyPacInvoice(repInvoice);
  if (pacResult.kind !== "hit") {
    const repId = typeof repInvoice?.id === "string" ? repInvoice.id : null;
    const isPending = pacResult.kind === "pending";
    await supabase
      .from("payments")
      .update({
        ...(repId ? { rep_facturapi_id: repId } : {}),
        rep_cfdi_status: pacResult.kind === "failed" ? "error" : "stamping",
        rep_error_message: isPending
          ? "Facturapi aceptó el REP; timbrado pendiente de resolución."
          : "Respuesta de Facturapi sin UUID válido. Revisar antes de reemitir.",
      })
      .eq("id", ctx.paymentId);
    return jsonResponse(
      req,
      {
        error: isPending
          ? "Facturapi aceptó el REP; timbrado pendiente de resolución."
          : "Facturapi no devolvió un UUID válido; requiere conciliación.",
        code: isPending ? "PAC_PENDING" : "PAC_INCOMPLETE",
      },
      { status: isPending ? 202 : 502 },
    );
  }

  const repId = pacResult.facturapi_id;
  const repUuid = pacResult.uuid;
  const { xmlPath, pdfPath } = await archiveRepFiles({
    supabase,
    client,
    organizationIdRaw: ctx.invoiceRow.organization_id,
    invoiceIdRaw: ctx.invoiceRow.id,
    repId,
    repUuid,
  });

  const { error: updErr } = await supabase
    .from("payments")
    .update({
      installment_number: ctx.installmentNumber,
      prior_balance: ctx.priorBalance,
      rep_facturapi_id: repId,
      rep_cfdi_uuid: repUuid,
      rep_cfdi_status: "stamped",
      rep_stamping_started_at: null,
      rep_xml_url: xmlPath,
      rep_pdf_url: pdfPath,
      rep_error_message: null,
    })
    .eq("id", ctx.paymentId);

  if (updErr) {
    console.error("DB update error after REP stamp:", updErr);
    return jsonError(req, 500, "REP timbrado pero no se pudo guardar en DB");
  }

  const folioRes = await assignRepFolio(supabase, {
    paymentId: ctx.paymentId,
    organizationId: ctx.organizationId,
    folio: repInvoice.folio_number ?? null,
  });
  if (!folioRes.ok) {
    console.error(
      "[stamp-payment-complement] assign_stamped_rep_number failed",
      {
        payment_id: ctx.paymentId,
        code: folioRes.code,
        err: folioRes.message,
      },
    );
    await supabase
      .from("payments")
      .update({
        rep_error_message: repFolioPendingMessage(folioRes.message),
      })
      .eq("id", ctx.paymentId);
    return jsonError(
      req,
      503,
      `El complemento de pago se timbró correctamente (UUID ${repUuid}), pero no se pudo asignar su folio interno: ${folioRes.message} No se volverá a timbrar; el folio se asignará en la siguiente reconciliación.`,
    );
  }

  return jsonResponse(req, {
    success: true,
    rep_cfdi_uuid: repUuid,
    rep_facturapi_id: repId,
    rep_number: folioRes.repNumber,
    installment_number: ctx.installmentNumber,
  });
}
