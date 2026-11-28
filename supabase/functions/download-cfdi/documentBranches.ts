import { jsonError } from "../_shared/http.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import {
  type BaseFormat,
  checkDocumentOrganization,
  type DownloadCfdiDeps,
  type DownloadSupabaseLike,
  type PortalAccess,
  requireCustomerOwnership,
} from "./downloadAuthAndAccess.ts";
import {
  attachmentResponse,
  facturapiErrorResponse,
  fetchFromFacturapi,
  loadFacturapiKey,
  persistDownload,
  tryStorageDownload,
} from "./downloadStorageAndPac.ts";
import { downloadInvoiceOrAcuseBranch } from "./invoiceBranches.ts";

export { downloadInvoiceOrAcuseBranch };

interface CreditNoteRow {
  id: string;
  organization_id: string | null;
  customer_id: string | null;
  credit_note_number: string | null;
  cfdi_uuid: string | null;
  cfdi_status: string | null;
  cfdi_xml_url: string | null;
  cfdi_pdf_url: string | null;
  facturapi_invoice_id: string | null;
}

interface PaymentRow {
  organization_id: string | null;
  invoice_id: string | null;
  rep_facturapi_id: string | null;
  rep_cfdi_uuid: string | null;
  rep_cfdi_status: string | null;
  rep_xml_url: string | null;
  rep_pdf_url: string | null;
}

interface InvoiceCustomerRow {
  customer_id: string | null;
  organization_id: string | null;
}

export interface BranchCommonContext {
  req: Request;
  supabase: DownloadSupabaseLike;
  deps: DownloadCfdiDeps;
  userId: string;
  portal: PortalAccess | null;
  baseFormat: BaseFormat;
  contentType: string;
}

export async function downloadCreditNoteBranch(
  ctx: BranchCommonContext,
  creditNoteId: string,
): Promise<Response> {
  const { req, supabase, deps, userId, portal, baseFormat, contentType } = ctx;
  const { data: cn } = await supabase
    .from("credit_notes")
    .select(
      "id, organization_id, customer_id, credit_note_number, cfdi_uuid, cfdi_status, cfdi_xml_url, cfdi_pdf_url, facturapi_invoice_id",
    )
    .eq("id", creditNoteId)
    .single() as { data: CreditNoteRow | null; error: unknown };
  if (!cn || cn.cfdi_status !== "stamped" || !cn.cfdi_uuid) {
    return jsonError(req, 409, "Credit note not stamped");
  }
  const orgCheck = await checkDocumentOrganization(
    req,
    supabase,
    userId,
    cn.organization_id,
    portal,
  );
  if (!orgCheck.ok) return orgCheck.response;
  const forbidden = requireCustomerOwnership(req, portal, cn.customer_id);
  if (forbidden) return forbidden;

  const filename = `${cn.credit_note_number || cn.cfdi_uuid}.${baseFormat}`;
  const storedPath = baseFormat === "pdf" ? cn.cfdi_pdf_url : cn.cfdi_xml_url;
  const existing = await tryStorageDownload(supabase, storedPath);
  if (existing) {
    return attachmentResponse(req, existing, contentType, filename);
  }
  if (!cn.facturapi_invoice_id) {
    return jsonError(req, 404, "Missing facturapi reference");
  }

  const keyRes = await loadFacturapiKey(
    req,
    supabase,
    deps,
    orgCheck.organizationId,
  );
  if (!keyRes.ok) return keyRes.response;

  const res = await fetchFromFacturapi(
    keyRes.apiKey,
    cn.facturapi_invoice_id,
    baseFormat,
    deps.fetchImpl,
  );
  if (!res.ok) return facturapiErrorResponse(req, res);

  const newPath = organizationStoragePath(
    cn.organization_id,
    `credit-notes/${cn.id}/${cn.cfdi_uuid}.${baseFormat}`,
  );
  const persisted = await persistDownload({
    supabase,
    newPath,
    bytes: res.bytes,
    contentType,
    table: "credit_notes",
    updates: baseFormat === "pdf"
      ? { cfdi_pdf_url: newPath }
      : { cfdi_xml_url: newPath },
    matchColumn: "id",
    matchValue: creditNoteId,
  });
  if (!persisted) {
    console.error("download-cfdi: NC servida sin persistir metadatos", {
      credit_note_id: creditNoteId,
      format: baseFormat,
    });
  }
  return attachmentResponse(req, res.bytes, contentType, filename);
}

async function verifyRepParentInvoice(
  ctx: BranchCommonContext,
  invoiceId: string | null,
  repOrganizationId: string,
): Promise<Response | null> {
  const { req, supabase, userId, portal } = ctx;
  const { data: repInv, error: repInvErr } = await supabase
    .from("invoices")
    .select("customer_id, organization_id")
    .eq("id", invoiceId as string)
    .maybeSingle() as { data: InvoiceCustomerRow | null; error: unknown };
  if (repInvErr) {
    return jsonError(
      req,
      503,
      "No se pudo verificar la factura relacionada. Reintenta en unos segundos.",
    );
  }
  const repInvOrgCheck = await checkDocumentOrganization(
    req,
    supabase,
    userId,
    repInv?.organization_id,
    portal,
  );
  if (!repInvOrgCheck.ok) return repInvOrgCheck.response;
  if (repInvOrgCheck.organizationId !== repOrganizationId) {
    return jsonError(req, 403, "El documento pertenece a otra empresa.");
  }
  return requireCustomerOwnership(req, portal, repInv?.customer_id);
}

export async function downloadRepBranch(
  ctx: BranchCommonContext,
  paymentId: string,
): Promise<Response> {
  const { req, supabase, deps, userId, portal, baseFormat, contentType } = ctx;
  const { data: payment } = await supabase
    .from("payments")
    .select(
      "organization_id, invoice_id, rep_facturapi_id, rep_cfdi_uuid, rep_cfdi_status, rep_xml_url, rep_pdf_url",
    )
    .eq("id", paymentId)
    .single() as { data: PaymentRow | null; error: unknown };
  const repStamped = payment?.rep_cfdi_status === "stamped" &&
    Boolean(payment.rep_cfdi_uuid);
  if (!payment || !repStamped) {
    return jsonError(req, 409, "REP not stamped");
  }
  const repOrgCheck = await checkDocumentOrganization(
    req,
    supabase,
    userId,
    payment.organization_id,
    portal,
  );
  if (!repOrgCheck.ok) return repOrgCheck.response;

  const parentErr = await verifyRepParentInvoice(
    ctx,
    payment.invoice_id,
    repOrgCheck.organizationId,
  );
  if (parentErr) return parentErr;

  const filename = `REP-${payment.rep_cfdi_uuid}.${baseFormat}`;
  const storedPath = baseFormat === "pdf"
    ? payment.rep_pdf_url
    : payment.rep_xml_url;
  const existing = await tryStorageDownload(supabase, storedPath);
  if (existing) {
    return attachmentResponse(req, existing, contentType, filename);
  }
  if (!payment.rep_facturapi_id) {
    return jsonError(req, 404, "Missing facturapi REP reference");
  }

  const keyRes = await loadFacturapiKey(
    req,
    supabase,
    deps,
    repOrgCheck.organizationId,
  );
  if (!keyRes.ok) return keyRes.response;

  const res = await fetchFromFacturapi(
    keyRes.apiKey,
    payment.rep_facturapi_id,
    baseFormat,
    deps.fetchImpl,
  );
  if (!res.ok) return facturapiErrorResponse(req, res);

  const newPath = organizationStoragePath(
    payment.organization_id,
    `${payment.invoice_id}/rep-${payment.rep_cfdi_uuid}.${baseFormat}`,
  );
  const persisted = await persistDownload({
    supabase,
    newPath,
    bytes: res.bytes,
    contentType,
    table: "payments",
    updates: baseFormat === "pdf"
      ? { rep_pdf_url: newPath }
      : { rep_xml_url: newPath },
    matchColumn: "id",
    matchValue: paymentId,
  });
  if (!persisted) {
    console.error("download-cfdi: REP servido sin persistir metadatos", {
      payment_id: paymentId,
      format: baseFormat,
    });
  }
  return attachmentResponse(req, res.bytes, contentType, filename);
}
