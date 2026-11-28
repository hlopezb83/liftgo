import { describeFacturapiError } from "../_shared/facturapi/client.ts";
import { computeStampVariance } from "../_shared/money.ts";
import { stampOutcome } from "../_shared/stampOutcome.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { InvoiceGateway } from "./invoiceGateway.ts";
import type { PacStampSuccess } from "./pacExecution.ts";
import type { JsonResponder } from "./preStampValidation.ts";

async function archiveXmlFile(params: {
  supabase: SupabaseLike;
  gateway: InvoiceGateway;
  organizationIdRaw: unknown;
  invoiceId: string;
  facturApiId: string;
  cfdiUuid: string;
}): Promise<{ cfdiXml: string | null; xmlStoragePath: string | null }> {
  const {
    supabase,
    gateway,
    organizationIdRaw,
    invoiceId,
    facturApiId,
    cfdiUuid,
  } = params;
  let cfdiXml: string | null = null;
  let xmlStoragePath: string | null = null;
  try {
    cfdiXml = await gateway.downloadXml(facturApiId);
    const path = organizationStoragePath(
      organizationIdRaw,
      `${invoiceId}/${cfdiUuid}.xml`,
    );
    const { error: upErr } = await supabase.storage.from("cfdi-files").upload(
      path,
      new Blob([cfdiXml], { type: "application/xml" }),
      { contentType: "application/xml", upsert: true },
    );
    if (!upErr) xmlStoragePath = path;
    else {
      console.error("[stamp-cfdi] archive xml upload failed", {
        invoice_id: invoiceId,
        err: upErr,
      });
    }
  } catch (err) {
    console.error("[stamp-cfdi] archive xml failed", {
      invoice_id: invoiceId,
      err: describeFacturapiError(err),
    });
  }
  return { cfdiXml, xmlStoragePath };
}

async function archivePdfFile(params: {
  supabase: SupabaseLike;
  gateway: InvoiceGateway;
  organizationIdRaw: unknown;
  invoiceId: string;
  facturApiId: string;
  cfdiUuid: string;
}): Promise<string | null> {
  const {
    supabase,
    gateway,
    organizationIdRaw,
    invoiceId,
    facturApiId,
    cfdiUuid,
  } = params;
  try {
    const pdfBytes = await gateway.downloadPdf(facturApiId);
    const path = organizationStoragePath(
      organizationIdRaw,
      `${invoiceId}/${cfdiUuid}.pdf`,
    );
    const { error: upErr } = await supabase.storage.from("cfdi-files").upload(
      path,
      pdfBytes,
      { contentType: "application/pdf", upsert: true },
    );
    if (!upErr) return path;
    console.error("[stamp-cfdi] archive pdf upload failed", {
      invoice_id: invoiceId,
      err: upErr,
    });
  } catch (err) {
    console.error("[stamp-cfdi] archive pdf failed", {
      invoice_id: invoiceId,
      err: describeFacturapiError(err),
    });
  }
  return null;
}

function evaluateVariance(
  invoiceId: string,
  invoiceTotal: unknown,
  stampedTotal: unknown,
) {
  const varianceCheck = computeStampVariance(invoiceTotal, stampedTotal);
  const hasVariance = Boolean(varianceCheck && !varianceCheck.withinTolerance);
  const varianceMessage = hasVariance && varianceCheck
    ? `Error BL-A5: el total timbrado (${
      Number(stampedTotal).toFixed(2)
    }) difiere del total de la factura (${
      Number(invoiceTotal).toFixed(2)
    }); varianza ${
      varianceCheck.variance.toFixed(2)
    }. El CFDI existe ante el SAT: cancélalo y corrige tasas/descuentos.`
    : null;
  if (hasVariance && varianceCheck) {
    console.error("[stamp-cfdi] BL-A5 stamp variance detectada", {
      invoice_id: invoiceId,
      invoice_total: invoiceTotal,
      stamped_total: stampedTotal,
      variance: varianceCheck.variance,
    });
  }
  return { varianceCheck, hasVariance, varianceMessage };
}

async function promoteDraftFolioIfNeeded(params: {
  supabase: SupabaseLike;
  invoiceId: string;
  currentInvNum: string | null;
  facturApiSeries: string | null;
  facturApiFolio: string | null;
}): Promise<string | null> {
  const {
    supabase,
    invoiceId,
    currentInvNum,
    facturApiSeries,
    facturApiFolio,
  } = params;
  if (!facturApiFolio || !currentInvNum?.startsWith("BORRADOR-")) {
    return null;
  }
  const rpcRes = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  }).rpc("assign_stamped_invoice_number", {
    p_invoice_id: invoiceId,
    p_serie: facturApiSeries,
    p_folio: facturApiFolio,
  });
  const rpcErr = rpcRes.error as { message?: string } | null;
  if (rpcErr) {
    console.error("[stamp-cfdi] assign_stamped_invoice_number failed", {
      invoice_id: invoiceId,
      err: rpcErr.message,
    });
    return null;
  }
  return rpcRes.data as string;
}

export async function finalizeStampedInvoice(params: {
  supabase: SupabaseLike;
  gateway: InvoiceGateway;
  invoiceId: string;
  organizationId: string;
  inv: Record<string, unknown>;
  mode: string;
  stamped: PacStampSuccess;
  json: JsonResponder;
}): Promise<Response> {
  const {
    supabase,
    gateway,
    invoiceId,
    organizationId,
    inv,
    mode,
    stamped,
    json,
  } = params;
  const {
    facturApiInvoice,
    facturApiId,
    cfdiUuid,
    facturApiSeries,
    facturApiFolio,
  } = stamped;

  const { cfdiXml, xmlStoragePath } = await archiveXmlFile({
    supabase,
    gateway,
    organizationIdRaw: inv.organization_id,
    invoiceId,
    facturApiId,
    cfdiUuid,
  });
  const pdfStoragePath = await archivePdfFile({
    supabase,
    gateway,
    organizationIdRaw: inv.organization_id,
    invoiceId,
    facturApiId,
    cfdiUuid,
  });

  const { varianceCheck, hasVariance, varianceMessage } = evaluateVariance(
    invoiceId,
    inv.total,
    facturApiInvoice.total,
  );

  const updRes = await supabase
    .from("invoices")
    .update({
      cfdi_uuid: cfdiUuid,
      cfdi_xml: cfdiXml,
      cfdi_xml_url: xmlStoragePath,
      cfdi_pdf_url: pdfStoragePath,
      cfdi_status: hasVariance ? "error" : "stamped",
      cfdi_error_message: varianceMessage,
      ...(varianceCheck
        ? {
          stamp_variance: varianceCheck.variance,
          stamp_variance_checked_at: new Date().toISOString(),
        }
        : {}),
      facturapi_invoice_id: facturApiId,
      facturapi_env: mode === "live" ? "live" : "test",
      ...(facturApiSeries ? { serie: facturApiSeries } : {}),
      ...(facturApiFolio ? { folio: facturApiFolio } : {}),
      ...(inv.status === "draft" ? { status: "sent" } : {}),
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .eq("cfdi_status", "stamping")
    .eq("facturapi_invoice_id", facturApiId)
    .select("id")
    .maybeSingle();

  if (updRes.error || !updRes.data) {
    console.error("[stamp-cfdi] DB update failed after stamp", {
      invoice_id: invoiceId,
      cfdiUuid,
    });
    return json({
      error: "Stamped but failed to save to DB",
      code: "STAMP_RECOVERY_REQUIRED",
      ...stampOutcome({ kind: "recovery_required", reference: "saved" }),
    }, 500);
  }

  if (hasVariance) {
    return json({
      error: varianceMessage ??
        "Stamp variance exceeds tolerance; invoice not stamped",
      cfdi_uuid: cfdiUuid,
      ...stampOutcome({ kind: "rejected" }),
    }, 502);
  }

  const currentInvNum = (inv.invoice_number as string | null) ?? null;
  const finalInvoiceNumber = await promoteDraftFolioIfNeeded({
    supabase,
    invoiceId,
    currentInvNum,
    facturApiSeries,
    facturApiFolio,
  });

  return json({
    success: true,
    cfdi_uuid: cfdiUuid,
    facturapi_invoice_id: facturApiId,
    invoice_number: finalInvoiceNumber ?? currentInvNum,
    stub: false,
    ...stampOutcome({ kind: "issued", cfdi_uuid: cfdiUuid }),
  }, 200);
}
