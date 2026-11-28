import { jsonError } from "../_shared/http.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import type { BranchCommonContext } from "./documentBranches.ts";
import {
  checkDocumentOrganization,
  requireCustomerOwnership,
} from "./downloadAuthAndAccess.ts";
import {
  attachmentResponse,
  clearXmlPendingFlag,
  facturapiErrorResponse,
  fetchAcuseFromFacturapi,
  fetchFromFacturapi,
  loadFacturapiKey,
  persistDownload,
  tryStorageDownload,
} from "./downloadStorageAndPac.ts";

interface InvoiceRow {
  id: string;
  organization_id: string | null;
  customer_id: string | null;
  invoice_number: string | null;
  cfdi_uuid: string | null;
  cfdi_status: string | null;
  cancellation_status: string | null;
  cfdi_xml: string | null;
  cfdi_xml_url: string | null;
  cfdi_xml_pending: boolean | null;
  cfdi_pdf_url: string | null;
  acuse_pdf_url: string | null;
  acuse_xml_url: string | null;
  facturapi_invoice_id: string | null;
}

async function downloadInvoiceAcuse(
  ctx: BranchCommonContext,
  invoice: InvoiceRow,
  invoiceId: string,
  organizationId: string,
): Promise<Response> {
  const { req, supabase, deps, baseFormat, contentType } = ctx;
  if (invoice.cancellation_status !== "accepted") {
    return jsonError(
      req,
      409,
      "El acuse aún no está disponible. Actualiza el estado SAT hasta que la cancelación esté aceptada.",
    );
  }
  const filename = `Acuse-${
    invoice.invoice_number || invoice.cfdi_uuid
  }.${baseFormat}`;
  const storedPath = baseFormat === "pdf"
    ? invoice.acuse_pdf_url
    : invoice.acuse_xml_url;
  const existing = await tryStorageDownload(supabase, storedPath);
  if (existing) {
    return attachmentResponse(req, existing, contentType, filename);
  }
  if (!invoice.facturapi_invoice_id) {
    return jsonError(req, 404, "Missing facturapi reference");
  }

  const keyRes = await loadFacturapiKey(req, supabase, deps, organizationId);
  if (!keyRes.ok) return keyRes.response;

  const res = await fetchAcuseFromFacturapi(
    keyRes.apiKey,
    invoice.facturapi_invoice_id,
    baseFormat,
    deps.fetchImpl,
  );
  if (!res.ok) {
    return facturapiErrorResponse(
      req,
      res,
      "El acuse aún no está disponible en Facturapi.",
    );
  }

  const newPath = organizationStoragePath(
    invoice.organization_id,
    `${invoiceId}/acuse-${invoice.cfdi_uuid}.${baseFormat}`,
  );
  const persisted = await persistDownload({
    supabase,
    newPath,
    bytes: res.bytes,
    contentType,
    table: "invoices",
    updates: baseFormat === "pdf"
      ? { acuse_pdf_url: newPath }
      : { acuse_xml_url: newPath },
    matchColumn: "id",
    matchValue: invoiceId,
  });
  if (!persisted) {
    console.error("download-cfdi: acuse servido sin persistir metadatos", {
      invoice_id: invoiceId,
      format: baseFormat,
    });
  }
  return attachmentResponse(req, res.bytes, contentType, filename);
}

async function downloadInvoiceCfdi(
  ctx: BranchCommonContext,
  invoice: InvoiceRow,
  invoiceId: string,
  organizationId: string,
): Promise<Response> {
  const { req, supabase, deps, baseFormat, contentType } = ctx;
  const filename = `${
    invoice.invoice_number || invoice.cfdi_uuid
  }.${baseFormat}`;
  const storedPath = baseFormat === "pdf"
    ? invoice.cfdi_pdf_url
    : invoice.cfdi_xml_url;
  const existing = await tryStorageDownload(supabase, storedPath);
  if (existing) {
    if (baseFormat === "xml" && invoice.cfdi_xml_pending) {
      await clearXmlPendingFlag(supabase, invoiceId);
    }
    return attachmentResponse(req, existing, contentType, filename);
  }

  if (baseFormat === "xml" && invoice.cfdi_xml) {
    if (invoice.cfdi_xml_pending) {
      await clearXmlPendingFlag(supabase, invoiceId);
    }
    return attachmentResponse(req, invoice.cfdi_xml, contentType, filename);
  }

  if (!invoice.facturapi_invoice_id) {
    return jsonError(req, 404, "Missing facturapi reference");
  }
  const keyRes = await loadFacturapiKey(req, supabase, deps, organizationId);
  if (!keyRes.ok) return keyRes.response;

  const res = await fetchFromFacturapi(
    keyRes.apiKey,
    invoice.facturapi_invoice_id,
    baseFormat,
    deps.fetchImpl,
  );
  if (!res.ok) return facturapiErrorResponse(req, res);

  const newPath = organizationStoragePath(
    invoice.organization_id,
    `${invoiceId}/${invoice.cfdi_uuid}.${baseFormat}`,
  );
  const persisted = await persistDownload({
    supabase,
    newPath,
    bytes: res.bytes,
    contentType,
    table: "invoices",
    updates: baseFormat === "pdf"
      ? { cfdi_pdf_url: newPath }
      : { cfdi_xml_url: newPath, cfdi_xml_pending: false },
    matchColumn: "id",
    matchValue: invoiceId,
  });
  if (!persisted) {
    console.error("download-cfdi: descarga servida sin persistir metadatos", {
      invoice_id: invoiceId,
      format: baseFormat,
    });
  }
  return attachmentResponse(req, res.bytes, contentType, filename);
}

export async function downloadInvoiceOrAcuseBranch(
  ctx: BranchCommonContext,
  invoiceId: string,
  isAcuse: boolean,
): Promise<Response> {
  const { req, supabase, userId, portal } = ctx;
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, organization_id, customer_id, invoice_number, cfdi_uuid, cfdi_status, cancellation_status, cfdi_xml, cfdi_xml_url, cfdi_xml_pending, cfdi_pdf_url, acuse_pdf_url, acuse_xml_url, facturapi_invoice_id",
    )
    .eq("id", invoiceId)
    .single() as { data: InvoiceRow | null; error: unknown };
  if (invErr || !invoice) return jsonError(req, 404, "Invoice not found");

  const orgCheck = await checkDocumentOrganization(
    req,
    supabase,
    userId,
    invoice.organization_id,
    portal,
  );
  if (!orgCheck.ok) return orgCheck.response;
  const forbidden = requireCustomerOwnership(req, portal, invoice.customer_id);
  if (forbidden) return forbidden;

  const cfdiOk = invoice.cfdi_status === "stamped" ||
    invoice.cfdi_status === "cancelled";
  if (!cfdiOk || !invoice.cfdi_uuid) {
    return jsonError(req, 409, "Invoice not stamped");
  }

  if (isAcuse) {
    return await downloadInvoiceAcuse(
      ctx,
      invoice,
      invoiceId,
      orgCheck.organizationId,
    );
  }
  return await downloadInvoiceCfdi(
    ctx,
    invoice,
    invoiceId,
    orgCheck.organizationId,
  );
}
