import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { jsonError } from "../_shared/http.ts";
import { requireRole } from "../_shared/auth.ts";
import { isUUID } from "../_shared/validate.ts";
import {
  getFacturapiConfig,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";

const BUCKET = "cfdi-files";
const FACTURAPI_BASE = "https://www.facturapi.io/v2";

type DlFormat = "xml" | "pdf" | "acuse_xml" | "acuse_pdf";
type BaseFormat = "xml" | "pdf";
type FacturapiFetch =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: number; detail: string };

async function fetchFacturapiBinary(
  apiKey: string,
  path: string,
): Promise<FacturapiFetch> {
  try {
    const bytes = await retryOnFacturapi5xx(async () => {
      const r = await fetch(`${FACTURAPI_BASE}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        const err = new Error(`Facturapi ${r.status}`) as Error & {
          status?: number;
          detail?: string;
        };
        err.status = r.status;
        err.detail = text;
        throw err;
      }
      return new Uint8Array(await r.arrayBuffer());
    });
    return { ok: true, bytes };
  } catch (err) {
    const e = err as { status?: number; detail?: string; message?: string };
    console.error("[download-cfdi] Facturapi failed", {
      path,
      status: e.status ?? 500,
    });
    return {
      ok: false,
      status: e.status ?? 500,
      detail: e.detail ?? e.message ?? "unknown",
    };
  }
}

const fetchFromFacturapi = (
  apiKey: string,
  facturapiId: string,
  format: BaseFormat,
) => fetchFacturapiBinary(apiKey, `/invoices/${facturapiId}/${format}`);

const fetchAcuseFromFacturapi = (
  apiKey: string,
  facturapiId: string,
  format: BaseFormat,
) =>
  fetchFacturapiBinary(
    apiKey,
    `/invoices/${facturapiId}/cancellation_receipt/${format}`,
  );

async function loadFacturapiKey(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: company } = await supabase
    .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
  const { data: secrets } = await supabase
    .from("billing_secrets").select("facturapi_test_key, facturapi_live_key")
    .limit(1).maybeSingle();
  const mode = (company?.facturapi_mode as string | undefined) || "test";
  return resolveFacturapiKey({
    mode: mode === "live" ? "live" : "test",
    dbTestKey: secrets?.facturapi_test_key ?? null,
    dbLiveKey: secrets?.facturapi_live_key ?? null,
    envTestKey: Deno.env.get("FACTURAPI_TEST_KEY"),
    envLiveKey: Deno.env.get("FACTURAPI_LIVE_KEY"),
  });
}

function attachmentResponse(
  req: Request,
  body: BodyInit,
  contentType: string,
  filename: string,
): Response {
  const headers = new Headers(getCorsHeaders(req));
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  return new Response(body, { headers });
}

async function tryStorageDownload(
  supabase: SupabaseClient,
  path: string | null,
): Promise<Blob | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(path);
  return data ?? null;
}

async function persistDownload(
  supabase: SupabaseClient,
  newPath: string,
  bytes: Uint8Array,
  contentType: string,
  table: "invoices" | "payments" | "credit_notes",
  updates: Record<string, string>,
  matchColumn: string,
  matchValue: string,
) {
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(newPath, bytes, { contentType, upsert: true });
  if (upErr) {
    console.error("Storage upload failed:", upErr);
    return;
  }
  await supabase.from(table).update(updates).eq(matchColumn, matchValue);
}

function facturapiErrorResponse(
  req: Request,
  res: Extract<FacturapiFetch, { ok: false }>,
  notFoundMsg?: string,
) {
  const msg = res.status >= 500
    ? "Facturapi está experimentando problemas. Intenta de nuevo en unos segundos."
    : res.status === 404 && notFoundMsg
    ? notFoundMsg
    : `Facturapi error: ${res.status}`;
  return jsonError(req, 502, msg, { detail: res.detail.slice(0, 500) });
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireRole(req, ["admin", "administrativo", "ventas"]);
    if (!auth.ok) return auth.response;
    const supabase = auth.adminClient;

    const body = await req.json().catch(() => null);
    const invoice_id = body?.invoice_id;
    const payment_id = body?.payment_id;
    const credit_note_id = body?.credit_note_id;
    const format = body?.format as DlFormat | undefined;
    const validFormat = format === "xml" || format === "pdf" ||
      format === "acuse_xml" || format === "acuse_pdf";
    if (
      !validFormat ||
      (!isUUID(invoice_id) && !isUUID(payment_id) && !isUUID(credit_note_id))
    ) {
      return jsonError(req, 400, "Invalid payload");
    }

    const isAcuse = format === "acuse_pdf" || format === "acuse_xml";
    const baseFormat: BaseFormat = format === "pdf" || format === "acuse_pdf"
      ? "pdf"
      : "xml";
    const contentType = baseFormat === "pdf"
      ? "application/pdf"
      : "application/xml";

    if (isAcuse && !isUUID(invoice_id)) {
      return jsonError(req, 400, "Acuse download requires invoice_id");
    }

    // --- Credit Note branch ---
    if (isUUID(credit_note_id)) {
      const { data: cn } = await supabase
        .from("credit_notes")
        .select(
          "id, credit_note_number, cfdi_uuid, cfdi_status, cfdi_xml_url, cfdi_pdf_url, facturapi_invoice_id",
        )
        .eq("id", credit_note_id)
        .single();
      if (!cn || cn.cfdi_status !== "stamped" || !cn.cfdi_uuid) {
        return jsonError(req, 409, "Credit note not stamped");
      }
      const filename = `${cn.credit_note_number || cn.cfdi_uuid}.${baseFormat}`;
      const existing = await tryStorageDownload(
        supabase,
        (baseFormat === "pdf" ? cn.cfdi_pdf_url : cn.cfdi_xml_url) as
          | string
          | null,
      );
      if (existing) {
        return attachmentResponse(req, existing, contentType, filename);
      }

      if (!cn.facturapi_invoice_id) {
        return jsonError(req, 404, "Missing facturapi reference");
      }
      const apiKey = await loadFacturapiKey(supabase);
      if (!apiKey) return jsonError(req, 500, "Facturapi key not configured");

      const res = await fetchFromFacturapi(
        apiKey,
        cn.facturapi_invoice_id as string,
        baseFormat,
      );
      if (!res.ok) return facturapiErrorResponse(req, res);

      const newPath = `credit-notes/${cn.id}/${cn.cfdi_uuid}.${baseFormat}`;
      await persistDownload(
        supabase,
        newPath,
        res.bytes,
        contentType,
        "credit_notes",
        baseFormat === "pdf"
          ? { cfdi_pdf_url: newPath }
          : { cfdi_xml_url: newPath },
        "id",
        credit_note_id,
      );
      return attachmentResponse(req, res.bytes, contentType, filename);
    }

    // --- REP (Payment Complement) branch ---
    if (isUUID(payment_id)) {
      const { data: payment } = await supabase
        .from("payments")
        .select(
          "invoice_id, rep_facturapi_id, rep_cfdi_uuid, rep_cfdi_status, rep_xml_url, rep_pdf_url",
        )
        .eq("id", payment_id)
        .single();
      if (
        !payment || payment.rep_cfdi_status !== "stamped" ||
        !payment.rep_cfdi_uuid
      ) {
        return jsonError(req, 409, "REP not stamped");
      }
      const filename = `REP-${payment.rep_cfdi_uuid}.${baseFormat}`;
      const existing = await tryStorageDownload(
        supabase,
        (baseFormat === "pdf" ? payment.rep_pdf_url : payment.rep_xml_url) as
          | string
          | null,
      );
      if (existing) {
        return attachmentResponse(req, existing, contentType, filename);
      }

      if (!payment.rep_facturapi_id) {
        return jsonError(req, 404, "Missing facturapi REP reference");
      }
      const apiKey = await loadFacturapiKey(supabase);
      if (!apiKey) return jsonError(req, 500, "Facturapi key not configured");

      const res = await fetchFromFacturapi(
        apiKey,
        payment.rep_facturapi_id as string,
        baseFormat,
      );
      if (!res.ok) return facturapiErrorResponse(req, res);

      const newPath =
        `${payment.invoice_id}/rep-${payment.rep_cfdi_uuid}.${baseFormat}`;
      await persistDownload(
        supabase,
        newPath,
        res.bytes,
        contentType,
        "payments",
        baseFormat === "pdf"
          ? { rep_pdf_url: newPath }
          : { rep_xml_url: newPath },
        "id",
        payment_id,
      );
      return attachmentResponse(req, res.bytes, contentType, filename);
    }

    // --- Invoice / Acuse branch ---
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, cfdi_uuid, cfdi_status, cancellation_status, cfdi_xml, cfdi_xml_url, cfdi_pdf_url, acuse_pdf_url, acuse_xml_url, facturapi_invoice_id",
      )
      .eq("id", invoice_id)
      .single();
    if (invErr || !invoice) return jsonError(req, 404, "Invoice not found");
    const cfdiOk = invoice.cfdi_status === "stamped" ||
      invoice.cfdi_status === "cancelled";
    if (!cfdiOk || !invoice.cfdi_uuid) {
      return jsonError(req, 409, "Invoice not stamped");
    }

    if (isAcuse) {
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
      const existing = await tryStorageDownload(
        supabase,
        (baseFormat === "pdf"
          ? invoice.acuse_pdf_url
          : invoice.acuse_xml_url) as string | null,
      );
      if (existing) {
        return attachmentResponse(req, existing, contentType, filename);
      }

      if (!invoice.facturapi_invoice_id) {
        return jsonError(req, 404, "Missing facturapi reference");
      }
      const apiKey = await loadFacturapiKey(supabase);
      if (!apiKey) return jsonError(req, 500, "Facturapi key not configured");

      const res = await fetchAcuseFromFacturapi(
        apiKey,
        invoice.facturapi_invoice_id as string,
        baseFormat,
      );
      if (!res.ok) {
        return facturapiErrorResponse(
          req,
          res,
          "El acuse aún no está disponible en Facturapi.",
        );
      }

      const newPath = `${invoice_id}/acuse-${invoice.cfdi_uuid}.${baseFormat}`;
      await persistDownload(
        supabase,
        newPath,
        res.bytes,
        contentType,
        "invoices",
        baseFormat === "pdf"
          ? { acuse_pdf_url: newPath }
          : { acuse_xml_url: newPath },
        "id",
        invoice_id,
      );
      return attachmentResponse(req, res.bytes, contentType, filename);
    }

    const filename = `${
      invoice.invoice_number || invoice.cfdi_uuid
    }.${baseFormat}`;
    const existing = await tryStorageDownload(
      supabase,
      (baseFormat === "pdf" ? invoice.cfdi_pdf_url : invoice.cfdi_xml_url) as
        | string
        | null,
    );
    if (existing) {
      return attachmentResponse(req, existing, contentType, filename);
    }

    if (baseFormat === "xml" && invoice.cfdi_xml) {
      return attachmentResponse(req, invoice.cfdi_xml, contentType, filename);
    }

    if (!invoice.facturapi_invoice_id) {
      return jsonError(req, 404, "Missing facturapi reference");
    }
    const apiKey = await loadFacturapiKey(supabase);
    if (!apiKey) return jsonError(req, 500, "Facturapi key not configured");

    const res = await fetchFromFacturapi(
      apiKey,
      invoice.facturapi_invoice_id as string,
      baseFormat,
    );
    if (!res.ok) return facturapiErrorResponse(req, res);

    const newPath = `${invoice_id}/${invoice.cfdi_uuid}.${baseFormat}`;
    await persistDownload(
      supabase,
      newPath,
      res.bytes,
      contentType,
      "invoices",
      baseFormat === "pdf"
        ? { cfdi_pdf_url: newPath }
        : { cfdi_xml_url: newPath },
      "id",
      invoice_id,
    );
    return attachmentResponse(req, res.bytes, contentType, filename);
  } catch (err) {
    console.error("download-cfdi error:", err);
    return jsonError(req, 500, "Internal server error");
  }
});
